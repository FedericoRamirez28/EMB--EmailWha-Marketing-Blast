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

/** Extrae status code desde el error de WhapiService (ej: "Whapi sendText failed: 429 ...") */
function parseWhapiStatusCode(errMsg: string): number | null {
  const m = String(errMsg || '').match(/sendText failed:\s*(\d{3})\b/i)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) ? n : null
}

/** Errores transitorios: vale la pena retry */
function isRetryableError(errMsg: string): boolean {
  const msg = String(errMsg || '').toLowerCase()
  const code = parseWhapiStatusCode(msg)

  // 408 timeout, 429 rate limit, 5xx servidor
  if (code === 408) return true
  if (code === 429) return true
  if (code && code >= 500) return true

  // timeouts/red
  if (msg.includes('timeout')) return true
  if (msg.includes('fetch failed')) return true
  if (msg.includes('econnreset')) return true
  if (msg.includes('etimedout')) return true
  if (msg.includes('socket hang up')) return true

  return false
}

/** Errores “límite/cuota” donde conviene pausar campaña para no quemar intentos */
function isHardLimitError(errMsg: string): boolean {
  const msg = String(errMsg || '').toLowerCase()
  const code = parseWhapiStatusCode(msg)

  // en muchos providers: 402/403 por cuota/plan
  if (code === 402) return true
  if (code === 403 && (msg.includes('limit') || msg.includes('quota') || msg.includes('trial'))) return true

  // textos típicos
  if (msg.includes('exceed')) return true
  if (msg.includes('limit')) return true
  if (msg.includes('quota')) return true
  if (msg.includes('payment')) return true

  return false
}

/** Backoff simple con jitter (cap 10 min) */
function computeNextAttempt(attempts: number, baseDelayMs: number): Date {
  const base = Math.max(500, Math.min(60_000, Math.trunc(baseDelayMs)))
  const mult = Math.min(10, Math.max(1, attempts)) // 1..10
  const jitter = Math.trunc(Math.random() * 500)
  const ms = Math.min(10 * 60_000, base * mult + jitter)
  return new Date(Date.now() + ms)
}

const INFLIGHT_TTL_MS = 2 * 60_000 // 2 min

@Injectable()
export class WhapiCampaignService {
  private running = false
  private readonly log = new Logger(WhapiCampaignService.name)

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

        // 1) Buscar próximo item pendiente
        const next = await this.prisma.whatsappCampaignItem.findFirst({
          where: {
            campaignId: camp.id,
            status: WhatsappCampaignItemStatus.pending,
            OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
          },
          orderBy: [{ nextAttemptAt: 'asc' }, { createdAt: 'asc' }],
          select: {
            id: true,
            recipientId: true,
            to: true,
            attempts: true,
          },
        })

        // Si no hay item, ver si terminó
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
            await sleep(1000)
          }
          continue
        }

        // 2) Claim seguro: si hay 2 instancias, solo una lo toma
        const attemptsNow = next.attempts + 1
        const claimed = await this.prisma.whatsappCampaignItem.updateMany({
          where: { id: next.id, status: WhatsappCampaignItemStatus.pending },
          data: {
            status: WhatsappCampaignItemStatus.sending,
            lastAttemptAt: new Date(),
            attempts: attemptsNow, // ✅ incrementa ANTES de enviar (estable en crash/restart)
            nextAttemptAt: null,
          },
        })
        if (claimed.count !== 1) continue

        // 3) Crear mensaje con clientRef idempotente por intento
        const clientRef = `camp:${camp.id}:${next.id}:${attemptsNow}`

        let msg: { id: string; status: WhatsappMessageStatus; whapiMessageId: string | null; createdAt: Date } | null =
          null

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
            select: { id: true, status: true, whapiMessageId: true, createdAt: true },
          })
        } catch (e: unknown) {
          // Si clientRef es @unique y ya existe, lo traemos y NO duplicamos envío
          if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
            msg = await this.prisma.whatsappMessage.findFirst({
              where: { clientRef },
              select: { id: true, status: true, whapiMessageId: true, createdAt: true },
            })
          } else {
            throw e
          }
        }

        if (!msg) {
          // imposible, pero por seguridad:
          await this.prisma.whatsappCampaignItem.update({
            where: { id: next.id },
            data: {
              status: WhatsappCampaignItemStatus.pending,
              nextAttemptAt: computeNextAttempt(attemptsNow, camp.delayMs),
              lastError: 'msg_create_failed',
            },
          })
          await sleep(500)
          continue
        }

        // 4) Si el msg ya estaba enviado por un intento anterior, NO re-enviar
        const isAlreadySent =
          msg.status === WhatsappMessageStatus.sent ||
          msg.status === WhatsappMessageStatus.delivered ||
          msg.status === WhatsappMessageStatus.read

        if (isAlreadySent) {
          await this.prisma.whatsappCampaignItem.update({
            where: { id: next.id },
            data: {
              status: WhatsappCampaignItemStatus.sent,
              lastError: null,
              messageId: msg.id,
              nextAttemptAt: null,
            },
          })

          await this.prisma.whatsappCampaign.update({
            where: { id: camp.id },
            data: {
              sentCount: { increment: 1 },
              doneCount: { increment: 1 },
            },
          })

          await sleep(Math.max(250, camp.delayMs))
          continue
        }

        // 5) Si quedó “pending” viejo (crash/timeout), evitamos spam:
        // - si es reciente, lo reprogramamos (no enviamos de nuevo)
        // - si es muy viejo, lo marcamos failed y seguimos con retry normal
        if (msg.status === WhatsappMessageStatus.pending) {
          const age = Date.now() - new Date(msg.createdAt).getTime()
          if (age < INFLIGHT_TTL_MS) {
            await this.prisma.whatsappCampaignItem.update({
              where: { id: next.id },
              data: {
                status: WhatsappCampaignItemStatus.pending,
                nextAttemptAt: new Date(Date.now() + Math.max(1000, camp.delayMs)),
                lastError: 'inflight_dedup_wait',
                messageId: msg.id,
              },
            })
            await sleep(500)
            continue
          } else {
            // demasiado viejo, lo cerramos como failed para permitir retry con otro clientRef
            await this.prisma.whatsappMessage.update({
              where: { id: msg.id },
              data: { status: WhatsappMessageStatus.failed, error: 'stale_pending_timeout' },
            })
          }
        }

        // 6) Enviar a Whapi 1 sola vez
        try {
          const r = await this.whapi.sendText(next.to, camp.body)
          const whapiMessageId = typeof (r as any)?.id === 'string' ? String((r as any).id) : ''

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
            where: { id: next.id },
            data: {
              status: WhatsappCampaignItemStatus.sent,
              lastError: null,
              messageId: msg.id,
              nextAttemptAt: null,
            },
          })

          await this.prisma.whatsappCampaign.update({
            where: { id: camp.id },
            data: {
              sentCount: { increment: 1 },
              doneCount: { increment: 1 }, // “done” = procesado (enviado o fallido final)
            },
          })
        } catch (e: unknown) {
          const error = e instanceof Error ? e.message : 'send_failed'

          await this.prisma.whatsappMessage.update({
            where: { id: msg.id },
            data: { status: WhatsappMessageStatus.failed, error },
          })

          // Si es error de cuota/limit, pausamos campaña para no quemar intentos
          if (isHardLimitError(error)) {
            await this.prisma.whatsappCampaign.update({
              where: { id: camp.id },
              data: { status: WhatsappCampaignStatus.paused },
            })

            await this.prisma.whatsappCampaignItem.update({
              where: { id: next.id },
              data: {
                status: WhatsappCampaignItemStatus.pending,
                nextAttemptAt: new Date(Date.now() + 60_000), // reintenta más tarde
                lastError: `paused_limit: ${error}`,
                messageId: msg.id,
              },
            })

            this.log.warn(`Campaign ${camp.id} pausada por límite/cuota: ${error}`)
            await sleep(1000)
            continue
          }

          const retryable = isRetryableError(error)
          const canRetry = retryable && attemptsNow <= camp.maxRetries

          await this.prisma.whatsappCampaignItem.update({
            where: { id: next.id },
            data: {
              lastError: error,
              status: canRetry ? WhatsappCampaignItemStatus.pending : WhatsappCampaignItemStatus.failed,
              nextAttemptAt: canRetry ? computeNextAttempt(attemptsNow, camp.delayMs) : null,
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
