import { Injectable, Logger } from '@nestjs/common'
import { Prisma, RecipientChannel } from '@prisma/client'
import { PrismaService } from '@/prisma/prisma.service'
import { WhapiService } from './whapi.service'

type BotConfig = {
  enabled: boolean
  maxRepliesPerContact: number
  replyDelayMs: number
  onlyIfCampaignItemExists: boolean
  lookbackDays: number

  businessHoursEnabled: boolean
  timezone: string
  businessStart: string // "09:00"
  businessEnd: string   // "18:00"
  outOfHoursReply: string

  defaultReply: string

  optOutKeywordsCsv: string
  optOutReply: string
}

type IncomingMsg = {
  id: string
  from: string
  chatId: string | null
  fromMe: boolean
  type: string | null
  body: string | null
}

function normPhone(raw: unknown): string {
  return String(raw ?? '').replace(/[^\d]/g, '')
}

function safeStr(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function pickTextBody(m: Record<string, unknown>): string | null {
  // formatos comunes: text.body / body / caption / content
  const text = m['text']
  if (isRecord(text)) {
    const b = safeStr(text['body']).trim()
    if (b) return b
  }
  const body = safeStr(m['body']).trim()
  if (body) return body
  const caption = safeStr(m['caption']).trim()
  if (caption) return caption
  const content = safeStr(m['content']).trim()
  if (content) return content
  return null
}

function parseIncomingMessages(payload: unknown): IncomingMsg[] {
  if (!isRecord(payload)) return []
  const p = payload as Record<string, unknown>

  const arr = Array.isArray(p['messages']) ? (p['messages'] as unknown[]) : null
  if (!arr) return []

  const out: IncomingMsg[] = []
  for (const it of arr) {
    if (!isRecord(it)) continue
    const m = it as Record<string, unknown>

    const id = safeStr(m['id']).trim()
    if (!id) continue

    const fromMe = Boolean(m['from_me'])
    const from = normPhone(m['from'] ?? m['author'] ?? m['sender'] ?? m['chat_id'])
    if (!from) continue

    const chatId = safeStr(m['chat_id']).trim() || null
    const type = safeStr(m['type']).trim() || null
    const body = pickTextBody(m)

    out.push({ id, from, chatId, fromMe, type, body })
  }

  return out
}

function minutesOf(hhmm: string): number | null {
  const s = String(hhmm || '').trim()
  const m = /^(\d{2}):(\d{2})$/.exec(s)
  if (!m) return null
  const hh = Number(m[1]); const mm = Number(m[2])
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null
  return hh * 60 + mm
}

function nowInTzHHMM(tz: string, d = new Date()): string {
  // "HH:MM"
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false })
  return fmt.format(d)
}

function withinBusinessHours(cfg: BotConfig, d = new Date()): boolean {
  if (!cfg.businessHoursEnabled) return true
  const tz = cfg.timezone || 'America/Argentina/Buenos_Aires'
  const cur = minutesOf(nowInTzHHMM(tz, d))
  const a = minutesOf(cfg.businessStart)
  const b = minutesOf(cfg.businessEnd)
  if (cur === null || a === null || b === null) return true
  if (a <= b) return cur >= a && cur <= b
  // rango cruzando medianoche
  return cur >= a || cur <= b
}

function splitKeywords(csv: string): string[] {
  return String(csv || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
}

function includesAnyKeyword(text: string, kws: string[]): boolean {
  const t = String(text || '').toLowerCase()
  return kws.some(k => k && t.includes(k))
}

function withVars(template: string, vars: Record<string, string>): string {
  let out = String(template || '')
  for (const [k, v] of Object.entries(vars)) {
    out = out.replaceAll(`{${k}}`, v)
  }
  return out
}

const DEFAULT_CFG: BotConfig = {
  enabled: true,
  maxRepliesPerContact: 1,
  replyDelayMs: 0,
  onlyIfCampaignItemExists: true,
  lookbackDays: 60,

  businessHoursEnabled: false,
  timezone: 'America/Argentina/Buenos_Aires',
  businessStart: '09:00',
  businessEnd: '18:00',
  outOfHoursReply: '¡Gracias por escribir! Un asesor te responde en el próximo horario laboral.',

  defaultReply:
    'Hola {NOMBRE} 👋 Gracias por escribir a Medic.\n' +
    '¿Te interesa Plan Individual o Familiar?\n' +
    'Respondé con: 1) Individual  2) Familiar.\n' +
    'Un asesor te contacta en breve.',

  optOutKeywordsCsv: 'baja,stop,no',
  optOutReply: 'Entendido. Te damos de baja y no volveremos a contactarte por este medio.',
}

@Injectable()
export class WhapiAutoReplyService {
  private readonly log = new Logger(WhapiAutoReplyService.name)
  private readonly SETTING_KEY = 'wa_bot_config'

  constructor(
    private readonly prisma: PrismaService,
    private readonly whapi: WhapiService,
  ) {}

  async getConfig(): Promise<BotConfig> {
    const row = await this.prisma.setting.findUnique({ where: { key: this.SETTING_KEY } })
    if (!row?.value) {
      await this.prisma.setting.upsert({
        where: { key: this.SETTING_KEY },
        create: { key: this.SETTING_KEY, value: JSON.stringify(DEFAULT_CFG) },
        update: { value: JSON.stringify(DEFAULT_CFG) },
      })
      return { ...DEFAULT_CFG }
    }

    try {
      const parsed = JSON.parse(row.value)
      const cfg = { ...DEFAULT_CFG, ...(parsed && typeof parsed === 'object' ? parsed : {}) } as BotConfig
      // clamp básicos
      cfg.maxRepliesPerContact = Math.max(0, Math.min(10, Math.trunc(Number(cfg.maxRepliesPerContact ?? 1))))
      cfg.replyDelayMs = Math.max(0, Math.min(60_000, Math.trunc(Number(cfg.replyDelayMs ?? 0))))
      cfg.lookbackDays = Math.max(1, Math.min(365, Math.trunc(Number(cfg.lookbackDays ?? 60))))
      cfg.businessStart = String(cfg.businessStart || '09:00')
      cfg.businessEnd = String(cfg.businessEnd || '18:00')
      cfg.timezone = String(cfg.timezone || 'America/Argentina/Buenos_Aires')
      cfg.defaultReply = String(cfg.defaultReply || DEFAULT_CFG.defaultReply)
      cfg.outOfHoursReply = String(cfg.outOfHoursReply || DEFAULT_CFG.outOfHoursReply)
      cfg.optOutKeywordsCsv = String(cfg.optOutKeywordsCsv || DEFAULT_CFG.optOutKeywordsCsv)
      cfg.optOutReply = String(cfg.optOutReply || DEFAULT_CFG.optOutReply)
      cfg.enabled = Boolean(cfg.enabled)
      cfg.onlyIfCampaignItemExists = Boolean(cfg.onlyIfCampaignItemExists)
      cfg.businessHoursEnabled = Boolean(cfg.businessHoursEnabled)
      return cfg
    } catch {
      await this.prisma.setting.update({ where: { key: this.SETTING_KEY }, data: { value: JSON.stringify(DEFAULT_CFG) } })
      return { ...DEFAULT_CFG }
    }
  }

  async updateConfig(patch: Partial<BotConfig>): Promise<BotConfig> {
    const cur = await this.getConfig()
    const next: BotConfig = { ...cur, ...(patch || {}) } as BotConfig

    // sanitize/clamps
    next.enabled = Boolean(next.enabled)
    next.onlyIfCampaignItemExists = Boolean(next.onlyIfCampaignItemExists)
    next.businessHoursEnabled = Boolean(next.businessHoursEnabled)

    next.maxRepliesPerContact = Math.max(0, Math.min(10, Math.trunc(Number(next.maxRepliesPerContact ?? 1))))
    next.replyDelayMs = Math.max(0, Math.min(60_000, Math.trunc(Number(next.replyDelayMs ?? 0))))
    next.lookbackDays = Math.max(1, Math.min(365, Math.trunc(Number(next.lookbackDays ?? 60))))

    next.timezone = String(next.timezone || 'America/Argentina/Buenos_Aires')
    next.businessStart = String(next.businessStart || '09:00')
    next.businessEnd = String(next.businessEnd || '18:00')
    next.defaultReply = String(next.defaultReply || DEFAULT_CFG.defaultReply)
    next.outOfHoursReply = String(next.outOfHoursReply || DEFAULT_CFG.outOfHoursReply)
    next.optOutKeywordsCsv = String(next.optOutKeywordsCsv || DEFAULT_CFG.optOutKeywordsCsv)
    next.optOutReply = String(next.optOutReply || DEFAULT_CFG.optOutReply)

    await this.prisma.setting.upsert({
      where: { key: this.SETTING_KEY },
      create: { key: this.SETTING_KEY, value: JSON.stringify(next) },
      update: { value: JSON.stringify(next) },
    })

    return next
  }

  /**
   * ✅ Se llama desde /whapi/webhook cuando llega messages.post
   * - Dedupe por whapiMessageId
   * - Marca replyCount/firstReplyAt
   * - Aplica opt-out
   * - Envia auto-reply (1ra respuesta) y deja el resto para el asesor
   */
  async handleIncomingWebhook(payload: unknown): Promise<{ ok: true; processed: number; replied: number }> {
    const cfg = await this.getConfig()
    if (!cfg.enabled) return { ok: true, processed: 0, replied: 0 }

    const msgs = parseIncomingMessages(payload)
    if (!msgs.length) return { ok: true, processed: 0, replied: 0 }

    let processed = 0
    let replied = 0

    for (const m of msgs) {
      // jamás responder a mensajes propios
      if (m.fromMe) continue

      processed++

      // dedupe: si ya existe, no procesar (evita doble respuesta por retries)
      const inboundCreated = await this.createInboundIfNew(m, payload)
      if (!inboundCreated) continue

      try {
        const didReply = await this.processOneInbound(cfg, m)
        if (didReply) replied++
      } catch (e: unknown) {
        this.log.warn(`processOneInbound failed: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    return { ok: true, processed, replied }
  }

  private async createInboundIfNew(m: IncomingMsg, payload: unknown): Promise<boolean> {
    try {
      await this.prisma.whatsappInboundMessage.create({
        data: {
          whapiMessageId: m.id,
          from: m.from,
          chatId: m.chatId,
          type: m.type,
          body: m.body,
          fromMe: m.fromMe,
          payload: payload as any,
        },
      })
      return true
    } catch (e: unknown) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return false
      }
      throw e
    }
  }

  private async processOneInbound(cfg: BotConfig, m: IncomingMsg): Promise<boolean> {
    const now = new Date()

    // buscar recipient (opcional, pero útil para {NOMBRE})
    const recipient = await this.prisma.recipient.findFirst({
      where: { channel: RecipientChannel.whatsapp, phone: m.from },
      select: { id: true, name: true, tags: true },
    })

    // buscar el campaign item más reciente para ese teléfono (lookback)
    const lookback = new Date(Date.now() - cfg.lookbackDays * 24 * 60 * 60 * 1000)

    const item = await this.prisma.whatsappCampaignItem.findFirst({
      where: {
        to: m.from,
        createdAt: { gte: lookback },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        to: true,
        name: true,
        replyCount: true,
        firstReplyAt: true,
        autoReplyCount: true,
        campaignId: true,
        campaign: {
          select: { id: true },
        },
      },
    })

    if (cfg.onlyIfCampaignItemExists && !item) return false

    // ✅ si hay item: marcar reply stats
    if (item) {
      const isFirstReply = !item.firstReplyAt

      await this.prisma.$transaction(async (tx) => {
        await tx.whatsappCampaignItem.update({
          where: { id: item.id },
          data: {
            replyCount: { increment: 1 },
            firstReplyAt: item.firstReplyAt ? undefined : now,
            lastReplyAt: now,
          },
        })

        if (isFirstReply) {
          await tx.whatsappCampaign.update({
            where: { id: item.campaignId },
            data: {
              repliedCount: { increment: 1 },
            },
          })
        }

        // link inbound a campaña/item (solo si existe)
        await tx.whatsappInboundMessage.updateMany({
          where: { whapiMessageId: m.id },
          data: { campaignId: item.campaignId, campaignItemId: item.id },
        })
      })
    }

    const bodyText = String(m.body || '').trim()

    // ✅ OPT-OUT
    const optKws = splitKeywords(cfg.optOutKeywordsCsv)
    if (bodyText && optKws.length && includesAnyKeyword(bodyText, optKws)) {
      // marcamos optout en recipient.tags (si existe)
      if (recipient) {
        const tags = String(recipient.tags || '')
        const has = tags.toLowerCase().split(',').map(s => s.trim()).includes('optout')
        if (!has) {
          const next = tags.trim() ? `${tags.trim()},optout` : 'optout'
          await this.prisma.recipient.update({ where: { id: recipient.id }, data: { tags: next } })
        }
      }

      // responder confirmación de baja (solo 1 vez, sin loops)
      const msgText = cfg.optOutReply || DEFAULT_CFG.optOutReply
      await this.sendBotMessage(m.from, msgText, recipient?.id ?? null, item?.id ?? null)
      return true
    }

    // ✅ límite de auto-respuestas por contacto/campaign item
    if (item && item.autoReplyCount >= cfg.maxRepliesPerContact) return false
    if (!item && cfg.onlyIfCampaignItemExists) return false

    // ✅ horario laboral
    const inHours = withinBusinessHours(cfg, now)
    const template = inHours ? cfg.defaultReply : (cfg.outOfHoursReply || cfg.defaultReply)

    const name = (item?.name || recipient?.name || '').trim() || '👋'
    const text = withVars(template, { NOMBRE: name })

    if (!text.trim()) return false

    // delay opcional
    if (cfg.replyDelayMs > 0) {
      await new Promise<void>(r => setTimeout(() => r(), cfg.replyDelayMs))
    }

    // enviar reply
    const sent = await this.sendBotMessage(m.from, text, recipient?.id ?? null, item?.id ?? null)

    // actualizar counters
    if (sent && item) {
      await this.prisma.$transaction(async (tx) => {
        await tx.whatsappCampaignItem.update({
          where: { id: item.id },
          data: {
            autoReplyCount: { increment: 1 },
            lastAutoReplyAt: now,
          },
        })
        await tx.whatsappCampaign.update({
          where: { id: item.campaignId },
          data: { autoRepliedCount: { increment: 1 } },
        })
      })
    }

    return Boolean(sent)
  }

  private async sendBotMessage(toPhone: string, text: string, recipientId: number | null, campaignItemId: string | null): Promise<boolean> {
    // guard: no enviar si whapi no está configurado
    if (!this.whapi.isConfigured()) return false

    // crear registro local (auditoría)
    const clientRef = `bot:${Date.now()}:${Math.random().toString(16).slice(2)}`
    const local = await this.prisma.whatsappMessage.create({
      data: {
        to: toPhone,
        body: text,
        status: 'pending',
        recipientId: recipientId ?? null,
        campaignItemId: campaignItemId ?? null,
        clientRef,
      },
      select: { id: true },
    })

    try {
      const r = await this.whapi.sendText(toPhone, text)
      const rawId = (r as any)?.message?.id || (r as any)?.id
      const whapiMessageId = typeof rawId === 'string' ? rawId : ''

      await this.prisma.whatsappMessage.update({
        where: { id: local.id },
        data: {
          whapiMessageId: whapiMessageId || null,
          status: 'sent',
          sentAt: new Date(),
          error: null,
        },
      })

      return true
    } catch (e: unknown) {
      const err = e instanceof Error ? e.message : 'bot_send_failed'
      await this.prisma.whatsappMessage.update({
        where: { id: local.id },
        data: { status: 'failed', error: err },
      })
      return false
    }
  }
}