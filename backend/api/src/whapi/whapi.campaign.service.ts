// src/whapi/whapi.campaign.service.ts
import { Injectable, Logger } from '@nestjs/common'
import {
  Prisma,
  WhatsappCampaignItemStatus,
  WhatsappCampaignStatus,
  WhatsappMessageStatus,
} from '@prisma/client'
import { PrismaService } from '@/prisma/prisma.service'
import { WhapiService } from './whapi.service'

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms))
}

function normPhone(raw?: string | null) {
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
  const hay = String(recipientTags || '')
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean)

  const needle = tags.map((t) => t.toLowerCase())
  return requireAll ? needle.every((t) => hay.includes(t)) : needle.some((t) => hay.includes(t))
}

function clampInt(n: number, min: number, max: number) {
  const x = Number(n)
  if (!Number.isFinite(x)) return min
  return Math.max(min, Math.min(max, Math.trunc(x)))
}

async function chunked<T>(arr: T[], size: number, fn: (chunk: T[]) => Promise<void>) {
  for (let i = 0; i < arr.length; i += size) {
    // eslint-disable-next-line no-await-in-loop
    await fn(arr.slice(i, i + size))
  }
}

@Injectable()
export class WhapiCampaignService {
  private running = false
  private readonly log = new Logger(WhapiCampaignService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly whapi: WhapiService,
  ) {}

  /**
   * ✅ Crea campaña y la ejecuta.
   * - NO hay reintentos automáticos
   * - Cada destinatario se procesa 1 vez (sent o failed)
   */
  async createCampaignAndStart(input: {
    name: string
    body: string
    blockId?: number
    tags?: string
    requireAllTags: boolean
    delayMs: number
  }) {
    const CHANNEL = 'whatsapp' as const

    const delayMs = clampInt(input.delayMs, 250, 60_000)
    const tags = splitTags(input.tags)

    // ✅ SOLO recipients whatsapp
    const recs = await this.prisma.recipient.findMany({
      where: {
        channel: CHANNEL,
        ...(typeof input.blockId === 'number' ? { blockId: input.blockId } : {}),
        NOT: [{ phone: null }, { phone: '' }],
      },
      select: { id: true, name: true, phone: true, tags: true, blockId: true },
      orderBy: { id: 'asc' },
    })

    const chosen = tags.length
      ? recs.filter((r) => recipientHasTags(r.tags || '', tags, input.requireAllTags))
      : recs

    const startedAt = new Date()

    const camp = await this.prisma.whatsappCampaign.create({
      data: {
        name: input.name || 'Campaña WhatsApp',
        status: WhatsappCampaignStatus.running,
        body: input.body,
        blockId: typeof input.blockId === 'number' ? input.blockId : null,
        tags: input.tags?.trim() ? input.tags.trim() : null,
        requireAllTags: input.requireAllTags,
        delayMs,
        maxRetries: 0,
        total: chosen.length,
        startedAt,
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
          attempts: 0,
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

  /**
   * ✅ Reenviar toda la campaña MANUALMENTE.
   * - Resetea items (excepto skipped)
   * - Resetea contadores
   * - Desvincula mensajes viejos (campaignItemId = null) para que webhooks tardíos no contaminen
   */
  async resendAllCampaign(id: string) {
    const camp = await this.prisma.whatsappCampaign.findUnique({ where: { id } })
    if (!camp) return { ok: false, error: 'not_found' }

    const items = await this.prisma.whatsappCampaignItem.findMany({
      where: { campaignId: id },
      select: { id: true, status: true },
    })

    const itemIds = items.map((x) => x.id)
    const skippedCount = items.filter((x) => x.status === WhatsappCampaignItemStatus.skipped).length

    if (itemIds.length) {
      await chunked(itemIds, 500, async (chunk) => {
        await this.prisma.whatsappMessage.updateMany({
          where: { campaignItemId: { in: chunk } },
          data: { campaignItemId: null },
        })
      })
    }

    const now = new Date()

    await this.prisma.whatsappCampaignItem.updateMany({
      where: { campaignId: id, status: { not: WhatsappCampaignItemStatus.skipped } },
      data: {
        status: WhatsappCampaignItemStatus.pending,
        attempts: 0,
        lastError: null,
        messageId: null,
        nextAttemptAt: now,
        lastAttemptAt: null,
      },
    })

    await this.prisma.whatsappCampaign.update({
      where: { id },
      data: {
        status: WhatsappCampaignStatus.running,
        startedAt: now,
        finishedAt: null,
        doneCount: 0,
        sentCount: 0,
        deliveredCount: 0,
        readCount: 0,
        failedCount: 0,
        skippedCount,
        maxRetries: 0,
      },
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

        const next = await this.prisma.whatsappCampaignItem.findFirst({
          where: {
            campaignId: camp.id,
            status: WhatsappCampaignItemStatus.pending,
            OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
          },
          orderBy: [{ nextAttemptAt: 'asc' }, { createdAt: 'asc' }],
          select: { id: true, recipientId: true, to: true, attempts: true },
        })

        if (!next) {
          const remaining = await this.prisma.whatsappCampaignItem.count({
            where: {
              campaignId: camp.id,
              status: { in: [WhatsappCampaignItemStatus.pending, WhatsappCampaignItemStatus.sending] },
            },
          })

          if (remaining === 0) {
            await this.prisma.whatsappCampaign.update({
              where: { id: camp.id },
              data: { status: WhatsappCampaignStatus.done, finishedAt: new Date() },
            })
          } else {
            await sleep(800)
          }
          continue
        }

        const attemptsNow = next.attempts + 1
        const claimed = await this.prisma.whatsappCampaignItem.updateMany({
          where: { id: next.id, status: WhatsappCampaignItemStatus.pending },
          data: {
            status: WhatsappCampaignItemStatus.sending,
            lastAttemptAt: new Date(),
            attempts: attemptsNow,
            nextAttemptAt: null,
          },
        })
        if (claimed.count !== 1) continue

        const startedKey = camp.startedAt ? new Date(camp.startedAt).getTime() : Date.now()
        const clientRef = `camp:${camp.id}:${next.id}:${startedKey}`

        let msgWasExisting = false
        let msg:
          | { id: string; status: WhatsappMessageStatus; whapiMessageId: string | null; error: string | null }
          | null = null

        try {
          msg = await this.prisma.whatsappMessage.create({
            data: {
              to: next.to,
              body: camp.body,
              status: WhatsappMessageStatus.pending,
              recipientId: next.recipientId ?? null,
              campaignItemId: next.id,
              clientRef,
            },
            select: { id: true, status: true, whapiMessageId: true, error: true },
          })
        } catch (e: unknown) {
          if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
            msgWasExisting = true
            msg = await this.prisma.whatsappMessage.findFirst({
              where: { clientRef },
              select: { id: true, status: true, whapiMessageId: true, error: true },
            })
          } else {
            throw e
          }
        }

        if (!msg) {
          await this.prisma.$transaction(async (tx) => {
            await tx.whatsappCampaignItem.update({
              where: { id: next.id },
              data: { status: WhatsappCampaignItemStatus.failed, lastError: 'msg_create_failed', nextAttemptAt: null },
            })
            await tx.whatsappCampaign.update({
              where: { id: camp.id },
              data: { failedCount: { increment: 1 }, doneCount: { increment: 1 } },
            })
          })
          await sleep(Math.max(250, camp.delayMs))
          continue
        }

        if (msgWasExisting) {
          const alreadySent =
            msg.status === WhatsappMessageStatus.sent ||
            msg.status === WhatsappMessageStatus.delivered ||
            msg.status === WhatsappMessageStatus.read

          if (alreadySent) {
            await this.prisma.$transaction(async (tx) => {
              const mappedItemStatus =
                msg!.status === WhatsappMessageStatus.read
                  ? WhatsappCampaignItemStatus.read
                  : msg!.status === WhatsappMessageStatus.delivered
                    ? WhatsappCampaignItemStatus.delivered
                    : WhatsappCampaignItemStatus.sent

              await tx.whatsappCampaignItem.update({
                where: { id: next.id },
                data: { status: mappedItemStatus, lastError: null, messageId: msg!.id, nextAttemptAt: null },
              })

              await tx.whatsappCampaign.update({
                where: { id: camp.id },
                data: {
                  sentCount: { increment: 1 },
                  doneCount: { increment: 1 },
                  ...(mappedItemStatus === WhatsappCampaignItemStatus.delivered
                    ? { deliveredCount: { increment: 1 } }
                    : {}),
                  ...(mappedItemStatus === WhatsappCampaignItemStatus.read ? { readCount: { increment: 1 } } : {}),
                },
              })
            })
            await sleep(Math.max(250, camp.delayMs))
            continue
          }

          const reason =
            msg.status === WhatsappMessageStatus.failed ? msg.error || 'dedup_existing_failed' : 'dedup_inflight_unknown'

          if (msg.status === WhatsappMessageStatus.pending) {
            await this.prisma.whatsappMessage.update({
              where: { id: msg.id },
              data: { status: WhatsappMessageStatus.failed, error: reason },
            })
          }

          await this.prisma.$transaction(async (tx) => {
            await tx.whatsappCampaignItem.update({
              where: { id: next.id },
              data: { status: WhatsappCampaignItemStatus.failed, lastError: reason, messageId: msg!.id, nextAttemptAt: null },
            })
            await tx.whatsappCampaign.update({
              where: { id: camp.id },
              data: { failedCount: { increment: 1 }, doneCount: { increment: 1 } },
            })
          })

          await sleep(Math.max(250, camp.delayMs))
          continue
        }

        try {
          const r = await this.whapi.sendText(next.to, camp.body)
          const whapiMessageId = typeof (r as any)?.id === 'string' ? String((r as any).id) : ''

          await this.prisma.$transaction(async (tx) => {
            await tx.whatsappMessage.update({
              where: { id: msg!.id },
              data: { whapiMessageId: whapiMessageId || null, status: WhatsappMessageStatus.sent, sentAt: new Date(), error: null },
            })

            await tx.whatsappCampaignItem.update({
              where: { id: next.id },
              data: { status: WhatsappCampaignItemStatus.sent, lastError: null, messageId: msg!.id, nextAttemptAt: null },
            })

            await tx.whatsappCampaign.update({
              where: { id: camp.id },
              data: { sentCount: { increment: 1 }, doneCount: { increment: 1 } },
            })
          })
        } catch (e: unknown) {
          const error = e instanceof Error ? e.message : 'send_failed'

          await this.prisma.$transaction(async (tx) => {
            await tx.whatsappMessage.update({
              where: { id: msg!.id },
              data: { status: WhatsappMessageStatus.failed, error },
            })

            await tx.whatsappCampaignItem.update({
              where: { id: next.id },
              data: { status: WhatsappCampaignItemStatus.failed, lastError: error, messageId: msg!.id, nextAttemptAt: null },
            })

            await tx.whatsappCampaign.update({
              where: { id: camp.id },
              data: { failedCount: { increment: 1 }, doneCount: { increment: 1 } },
            })
          })

          this.log.warn(`Send failed camp=${camp.id} item=${next.id} to=${next.to}: ${error}`)
        }

        await sleep(Math.max(250, camp.delayMs))
      }
    } finally {
      this.running = false
    }
  }
}