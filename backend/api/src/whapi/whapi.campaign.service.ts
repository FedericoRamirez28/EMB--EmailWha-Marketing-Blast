import { Injectable } from '@nestjs/common'
import {
  WhatsappCampaignItemStatus,
  WhatsappCampaignStatus,
  WhatsappMessageStatus,
} from '@prisma/client'
import { PrismaService } from '@/prisma/prisma.service'
import { WhapiService } from './whapi.service'

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms))
}

function normPhone(raw: string) {
  return String(raw ?? '').replace(/[^\d]/g, '')
}

function splitTags(csv?: string | null): string[] {
  const s = String(csv ?? '').trim()
  if (!s) return []
  return s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
}

function recipientHasTags(recipientTags: string, tags: string[], requireAll: boolean): boolean {
  if (!tags.length) return true
  const hay = recipientTags
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean)

  const needle = tags.map((t) => t.toLowerCase())

  if (requireAll) return needle.every((t) => hay.includes(t))
  return needle.some((t) => hay.includes(t))
}

@Injectable()
export class WhapiCampaignService {
  private running = false

  constructor(
    private readonly prisma: PrismaService,
    private readonly whapi: WhapiService,
  ) {}

  async createCampaignAndStart(input: {
    name: string
    body: string
    blockId?: number
    tags?: string
    requireAllTags: boolean
    delayMs: number
    maxRetries: number
  }) {
    const delayMs = Math.max(250, Math.min(60_000, Math.trunc(input.delayMs)))
    const maxRetries = Math.max(0, Math.min(50, Math.trunc(input.maxRetries)))
    const tags = splitTags(input.tags)

    const recs = await this.prisma.recipient.findMany({
      where: {
        ...(typeof input.blockId === 'number' ? { blockId: input.blockId } : {}),
        NOT: { phone: '' },
      },
      select: { id: true, name: true, phone: true, tags: true, blockId: true },
      orderBy: { id: 'asc' },
    })

    const chosen = tags.length
      ? recs.filter((r) => recipientHasTags(r.tags || '', tags, input.requireAllTags))
      : recs

    const camp = await this.prisma.whatsappCampaign.create({
      data: {
        name: input.name || 'Campaña WhatsApp',
        status: WhatsappCampaignStatus.running,
        body: input.body,
        blockId: typeof input.blockId === 'number' ? input.blockId : null,
        tags: input.tags?.trim() ? input.tags.trim() : null,
        requireAllTags: input.requireAllTags,
        delayMs,
        maxRetries,
        total: chosen.length,
        startedAt: new Date(),
      },
      select: { id: true },
    })

    if (chosen.length) {
      await this.prisma.whatsappCampaignItem.createMany({
        data: chosen.map((r) => ({
          campaignId: camp.id,
          recipientId: r.id,
          to: normPhone(r.phone),
          name: r.name || null,
          tagsSnap: r.tags || null,
          blockIdSnap: r.blockId ?? null,
          status: r.phone ? WhatsappCampaignItemStatus.pending : WhatsappCampaignItemStatus.skipped,
          nextAttemptAt: r.phone ? new Date() : null,
        })),
      })
    }

    void this.kick()
    return { ok: true, id: camp.id }
  }

  async resumeCampaign(id: string) {
    const camp = await this.prisma.whatsappCampaign.findUnique({ where: { id } })
    if (!camp) return { ok: false, error: 'not_found' }

    if (camp.status === WhatsappCampaignStatus.done || camp.status === WhatsappCampaignStatus.cancelled) {
      return { ok: false, error: 'cannot_resume' }
    }

    await this.prisma.whatsappCampaign.update({
      where: { id },
      data: { status: WhatsappCampaignStatus.running, finishedAt: null },
    })

    void this.kick()
    return { ok: true }
  }

  async cancelCampaign(id: string) {
    await this.prisma.whatsappCampaign.update({
      where: { id },
      data: { status: WhatsappCampaignStatus.cancelled, finishedAt: new Date() },
    })
    return { ok: true }
  }

  async retryFailed(id: string) {
    const camp = await this.prisma.whatsappCampaign.findUnique({ where: { id } })
    if (!camp) return { ok: false, error: 'not_found' }

    await this.prisma.whatsappCampaignItem.updateMany({
      where: { campaignId: id, status: WhatsappCampaignItemStatus.failed },
      data: {
        status: WhatsappCampaignItemStatus.pending,
        nextAttemptAt: new Date(),
        lastError: null,
      },
    })

    await this.prisma.whatsappCampaign.update({
      where: { id },
      data: { status: WhatsappCampaignStatus.running, finishedAt: null },
    })

    void this.kick()
    return { ok: true }
  }

  async getCampaign(id: string) {
    const camp = await this.prisma.whatsappCampaign.findUnique({
      where: { id },
      include: {
        items: {
          take: 80,
          orderBy: { updatedAt: 'desc' },
          select: {
            id: true,
            to: true,
            name: true,
            status: true,
            attempts: true,
            lastError: true,
            updatedAt: true,
            messageId: true,
          },
        },
      },
    })
    if (!camp) return { ok: false, error: 'not_found' }
    return { ok: true, data: camp }
  }

  async listCampaigns() {
    const rows = await this.prisma.whatsappCampaign.findMany({
      take: 30,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        status: true,
        total: true,
        doneCount: true,
        sentCount: true,
        deliveredCount: true,
        readCount: true,
        failedCount: true,
        skippedCount: true,
        delayMs: true,
        maxRetries: true,
        createdAt: true,
        startedAt: true,
        finishedAt: true,
      },
    })
    return { ok: true, data: rows }
  }

  private async kick() {
    if (this.running) return
    this.running = true
    try {
      while (true) {
        const camp = await this.prisma.whatsappCampaign.findFirst({
          where: { status: WhatsappCampaignStatus.running },
          orderBy: { startedAt: 'asc' },
        })
        if (!camp) break

        if (!this.whapi.isConfigured()) {
          await this.prisma.whatsappCampaign.update({
            where: { id: camp.id },
            data: { status: WhatsappCampaignStatus.failed, finishedAt: new Date() },
          })
          break
        }

        const now = new Date()
        const item = await this.prisma.whatsappCampaignItem.findFirst({
          where: {
            campaignId: camp.id,
            status: WhatsappCampaignItemStatus.pending,
            OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
          },
          orderBy: [{ nextAttemptAt: 'asc' }, { createdAt: 'asc' }],
        })

        if (!item) {
          const remaining = await this.prisma.whatsappCampaignItem.count({
            where: { campaignId: camp.id, status: WhatsappCampaignItemStatus.pending },
          })
          if (remaining === 0) {
            await this.prisma.whatsappCampaign.update({
              where: { id: camp.id },
              data: { status: WhatsappCampaignStatus.done, finishedAt: new Date() },
            })
          } else {
            await sleep(1000)
          }
          continue
        }

        await this.prisma.whatsappCampaignItem.update({
          where: { id: item.id },
          data: { status: WhatsappCampaignItemStatus.sending, lastAttemptAt: new Date() },
        })

        const msg = await this.prisma.whatsappMessage.create({
          data: {
            to: item.to,
            body: camp.body,
            status: WhatsappMessageStatus.pending,
            recipientId: item.recipientId ?? null,
            campaignItemId: item.id,
          },
          select: { id: true },
        })

        try {
          const r = await this.whapi.sendText(item.to, camp.body)
          const whapiMessageId = typeof r?.id === 'string' ? r.id : ''

          await this.prisma.whatsappMessage.update({
            where: { id: msg.id },
            data: {
              whapiMessageId: whapiMessageId || null,
              status: WhatsappMessageStatus.sent,
              sentAt: new Date(),
              error: null,
            },
          })

          await this.prisma.whatsappCampaignItem.update({
            where: { id: item.id },
            data: {
              status: WhatsappCampaignItemStatus.sent,
              attempts: { increment: 1 },
              lastError: null,
              messageId: msg.id,
              nextAttemptAt: null,
            },
          })

          await this.prisma.whatsappCampaign.update({
            where: { id: camp.id },
            data: {
              sentCount: { increment: 1 },
              doneCount: { increment: 1 }, // ✅ “done” se considera “intentado/enviado”
            },
          })
        } catch (e: unknown) {
          const error = e instanceof Error ? e.message : 'send_failed'

          await this.prisma.whatsappMessage.update({
            where: { id: msg.id },
            data: { status: WhatsappMessageStatus.failed, error },
          })

          const attemptsNext = item.attempts + 1
          const canRetry = attemptsNext <= camp.maxRetries

          await this.prisma.whatsappCampaignItem.update({
            where: { id: item.id },
            data: {
              attempts: attemptsNext,
              lastError: error,
              status: canRetry ? WhatsappCampaignItemStatus.pending : WhatsappCampaignItemStatus.failed,
              nextAttemptAt: canRetry ? new Date(Date.now() + Math.max(500, camp.delayMs)) : null,
              messageId: msg.id,
            },
          })

          if (!canRetry) {
            await this.prisma.whatsappCampaign.update({
              where: { id: camp.id },
              data: {
                failedCount: { increment: 1 },
                doneCount: { increment: 1 },
              },
            })
          }
        }

        await sleep(Math.max(250, camp.delayMs))
      }
    } finally {
      this.running = false
    }
  }
}
