import { Injectable } from '@nestjs/common'
import { PrismaService } from '@/prisma/prisma.service'
import { WhatsappMessageStatus, WhatsappCampaignItemStatus } from '@prisma/client'

type Ack = 'sent' | 'delivered' | 'read' | 'failed'

function rank(s: string) {
  return s === 'read' ? 4 : s === 'delivered' ? 3 : s === 'sent' ? 2 : s === 'failed' ? 1 : 0
}

@Injectable()
export class WhapiWebhookService {
  constructor(private readonly prisma: PrismaService) {}

  async ingest(payload: any) {
    const { whapiMessageId, status, event } = this.extract(payload)

    // 1) Log crudo SIEMPRE (esto te permite “ver payload” ya mismo)
    await this.prisma.whatsappWebhookLog.create({
      data: {
        event,
        messageId: whapiMessageId ?? null,
        status: status ?? null,
        payload,
      },
    }).catch(() => undefined)

    if (!whapiMessageId || !status) return

    // 2) Buscar mensaje por whapiMessageId
    const msg = await this.prisma.whatsappMessage.findUnique({
      where: { whapiMessageId },
      select: { id: true, status: true, campaignItemId: true },
    })
    if (!msg) return

    const nextStatus = this.mapStatus(status)
    if (!nextStatus) return

    const curr = String(msg.status)
    if (rank(nextStatus) <= rank(curr)) return

    const now = new Date()

    // 3) Update mensaje + item + (opcional) recalcular counts
    await this.prisma.$transaction(async (tx) => {
      await tx.whatsappMessage.update({
        where: { id: msg.id },
        data: {
          status: nextStatus as any,
          deliveredAt: nextStatus === 'delivered' ? now : undefined,
          readAt: nextStatus === 'read' ? now : undefined,
          error: nextStatus === 'failed' ? (status || 'failed') : null,
        },
      })

      if (msg.campaignItemId) {
        const item = await tx.whatsappCampaignItem.findUnique({
          where: { id: msg.campaignItemId },
          select: { id: true, status: true, campaignId: true },
        })
        if (item) {
          const mappedItem = this.mapItemStatus(nextStatus)
          if (rank(mappedItem) > rank(String(item.status))) {
            await tx.whatsappCampaignItem.update({
              where: { id: item.id },
              data: {
                status: mappedItem as any,
                updatedAt: now,
                lastError: nextStatus === 'failed' ? (status || 'failed') : null,
              },
            })
          }

          // Recalcular counts (simple y robusto)
          const agg = await tx.whatsappCampaignItem.groupBy({
            by: ['status'],
            where: { campaignId: item.campaignId },
            _count: { _all: true },
          })
          const c = (s: string) => agg.find(a => a.status === s)?._count._all ?? 0
          const total = await tx.whatsappCampaignItem.count({ where: { campaignId: item.campaignId } })
          const pending = c('pending') + c('sending')
          const doneCount = Math.max(0, total - pending)

          await tx.whatsappCampaign.update({
            where: { id: item.campaignId },
            data: {
              total,
              doneCount,
              sentCount: c('sent') + c('delivered') + c('read'),
              deliveredCount: c('delivered') + c('read'),
              readCount: c('read'),
              failedCount: c('failed'),
              skippedCount: c('skipped'),
            },
          })
        }
      }
    })
  }

  private mapStatus(s: string): WhatsappMessageStatus | null {
    const v = String(s).toLowerCase()
    if (v.includes('read')) return WhatsappMessageStatus.read
    if (v.includes('deliver')) return WhatsappMessageStatus.delivered
    if (v.includes('sent')) return WhatsappMessageStatus.sent
    if (v.includes('fail') || v.includes('error')) return WhatsappMessageStatus.failed
    return null
  }

  private mapItemStatus(msgStatus: string): WhatsappCampaignItemStatus {
    if (msgStatus === 'read') return WhatsappCampaignItemStatus.read
    if (msgStatus === 'delivered') return WhatsappCampaignItemStatus.delivered
    if (msgStatus === 'sent') return WhatsappCampaignItemStatus.sent
    return WhatsappCampaignItemStatus.failed
  }

  private extract(payload: any): { whapiMessageId: string | null; status: string | null; event: string | null } {
    const event =
      payload?.event ??
      payload?.type ??
      payload?.update_type ??
      null

    const whapiMessageId =
      payload?.message?.id ??
      payload?.messageId ??
      payload?.data?.message?.id ??
      payload?.data?.id ??
      payload?.messages?.[0]?.id ??
      null

    const status =
      payload?.status ??
      payload?.ack ??
      payload?.message?.status ??
      payload?.data?.status ??
      payload?.data?.ack ??
      null

    return {
      whapiMessageId: whapiMessageId ? String(whapiMessageId) : null,
      status: status ? String(status) : null,
      event: event ? String(event) : null,
    }
  }
}