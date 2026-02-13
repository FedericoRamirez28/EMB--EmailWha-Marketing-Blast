import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { WhatsappCampaignItemStatus, WhatsappMessageStatus } from '@prisma/client'
import { PrismaService } from '@/prisma/prisma.service'
import { JwtGuard } from '@/auth/jwt.guard'
import { WhapiService } from './whapi.service'
import { SendTextDto } from './dto/send-text.dto'
import { CreateCampaignDto } from './dto/campaign.dto'
import { WhapiCampaignService } from './whapi.campaign.service'

type AnyRecord = Record<string, unknown>

function isRecord(v: unknown): v is AnyRecord {
  return typeof v === 'object' && v !== null
}

function safeString(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function normPhone(raw: string) {
  return String(raw ?? '').replace(/[^\d]/g, '')
}

function mapMsgStatus(status: string): WhatsappMessageStatus | null {
  const s = String(status || '').toLowerCase()
  if (s === 'sent') return WhatsappMessageStatus.sent
  if (s === 'delivered') return WhatsappMessageStatus.delivered
  if (s === 'read') return WhatsappMessageStatus.read
  if (s === 'failed') return WhatsappMessageStatus.failed
  return null
}

function msgToItemStatus(ms: WhatsappMessageStatus): WhatsappCampaignItemStatus | null {
  if (ms === WhatsappMessageStatus.sent) return WhatsappCampaignItemStatus.sent
  if (ms === WhatsappMessageStatus.delivered) return WhatsappCampaignItemStatus.delivered
  if (ms === WhatsappMessageStatus.read) return WhatsappCampaignItemStatus.read
  if (ms === WhatsappMessageStatus.failed) return WhatsappCampaignItemStatus.failed
  return null
}

function statusRankItem(s: WhatsappCampaignItemStatus): number {
  // orden “progreso”
  if (s === WhatsappCampaignItemStatus.pending) return 0
  if (s === WhatsappCampaignItemStatus.sending) return 1
  if (s === WhatsappCampaignItemStatus.sent) return 2
  if (s === WhatsappCampaignItemStatus.delivered) return 3
  if (s === WhatsappCampaignItemStatus.read) return 4
  if (s === WhatsappCampaignItemStatus.failed) return 99
  if (s === WhatsappCampaignItemStatus.skipped) return 100
  return 0
}

function deriveEventString(p: AnyRecord): string {
  const ev = p['event']
  if (typeof ev === 'string') return ev
  if (isRecord(ev)) {
    const type = safeString(ev['type'])
    const e = safeString(ev['event'])
    if (type && e) return `${type}.${e}`
    if (type) return type
    if (e) return e
  }
  return ''
}

/**
 * Soporta distintos formatos de Whapi:
 * - { event: "statuses.post", data: { id, status, error? } }
 * - { statuses: [ { id, status, error? }, ... ] }
 * - { data: { statuses: [ ... ] } }
 * - { data: [ { id, status }, ... ] }
 */
function extractStatuses(payload: unknown): Array<{ id: string; status: string; error?: string }> {
  if (!isRecord(payload)) return []

  const p = payload as AnyRecord
  const out: Array<{ id: string; status: string; error?: string }> = []

  const pushRow = (row: unknown) => {
    if (!isRecord(row)) return
    const id = safeString(row['id']) || safeString(row['message_id'])
    const st = safeString(row['status'])
    const er = safeString(row['error'])
    if (!id || !st) return
    out.push(er ? { id, status: st, error: er } : { id, status: st })
  }

  // Caso viejo: event string + data objeto
  const ev = safeString(p['event'])
  if (ev === 'statuses.post' && isRecord(p['data'])) {
    pushRow(p['data'])
  }

  // statuses[]
  if (Array.isArray(p['statuses'])) {
    for (const s of p['statuses'] as unknown[]) pushRow(s)
    if (out.length) return out
  }

  // data.statuses[]
  const data = p['data']
  if (isRecord(data) && Array.isArray((data as AnyRecord)['statuses'])) {
    for (const s of (data as AnyRecord)['statuses'] as unknown[]) pushRow(s)
    if (out.length) return out
  }

  // data como array
  if (Array.isArray(data)) {
    for (const s of data) pushRow(s)
    if (out.length) return out
  }

  // data como objeto único
  if (isRecord(data)) {
    pushRow(data)
  }

  return out
}

@Controller('whapi')
export class WhapiController {
  constructor(
    private readonly whapi: WhapiService,
    private readonly prisma: PrismaService,
    private readonly campaigns: WhapiCampaignService,
  ) {}

  @UseGuards(JwtGuard)
  @Get('health')
  health() {
    return {
      ok: true,
      configured: this.whapi.isConfigured(),
      baseUrl: (process.env.WHAPI_BASE_URL || '').replace(/\/+$/, ''),
    }
  }

  @UseGuards(JwtGuard)
  @Get('limits')
  async limits() {
    try {
      const data = await this.whapi.getLimits()
      return { ok: true, data }
    } catch (e: unknown) {
      const error = e instanceof Error ? e.message : 'limits failed'
      return { ok: false, error }
    }
  }

  @UseGuards(JwtGuard)
  @Post('send')
  async send(@Body() dto: SendTextDto) {
    const to = normPhone(dto.to)
    const body = String(dto.body ?? '')
    const clientRef = dto.clientRef?.trim() ? dto.clientRef.trim() : null

    // dedup por clientRef si viene
    if (clientRef) {
      const existing = await this.prisma.whatsappMessage.findFirst({
        where: { clientRef },
        select: { id: true, status: true, error: true, whapiMessageId: true },
      })

      if (existing) {
        if (existing.status === WhatsappMessageStatus.failed) {
          return {
            ok: false,
            id: existing.id,
            status: 'failed',
            error: existing.error ?? 'failed',
            deduped: true,
          }
        }
        const apiStatus = existing.status === WhatsappMessageStatus.pending ? 'pending' : 'sent'
        return {
          ok: true,
          id: existing.id,
          whapiMessageId: existing.whapiMessageId ?? null,
          status: apiStatus,
          deduped: true,
        }
      }
    }

    const msg = await this.prisma.whatsappMessage.create({
      data: { to, body, status: WhatsappMessageStatus.pending, clientRef },
      select: { id: true },
    })

    try {
      const r = await this.whapi.sendText(to, body)
      const whapiMessageId = safeString((r as any)?.id)

      await this.prisma.whatsappMessage.update({
        where: { id: msg.id },
        data: {
          whapiMessageId: whapiMessageId || null,
          status: WhatsappMessageStatus.sent,
          sentAt: new Date(),
          error: null,
        },
      })

      return { ok: true, id: msg.id, whapiMessageId: whapiMessageId || null, status: 'sent', data: r }
    } catch (e: unknown) {
      const error = e instanceof Error ? e.message : 'send failed'
      await this.prisma.whatsappMessage.update({
        where: { id: msg.id },
        data: { status: WhatsappMessageStatus.failed, error },
      })
      return { ok: false, id: msg.id, status: 'failed', error }
    }
  }

  @UseGuards(JwtGuard)
  @Get('status/:id')
  async status(@Param('id') id: string) {
    const row = await this.prisma.whatsappMessage.findUnique({
      where: { id },
      select: {
        id: true,
        to: true,
        status: true,
        error: true,
        whapiMessageId: true,
        createdAt: true,
        sentAt: true,
        deliveredAt: true,
        readAt: true,
      },
    })
    if (!row) return { ok: false, error: 'not_found' }
    return { ok: true, data: row }
  }

  @UseGuards(JwtGuard)
  @Get('campaigns')
  async listCampaigns() {
    return this.campaigns.listCampaigns()
  }

  @UseGuards(JwtGuard)
  @Get('campaign/:id')
  async getCampaign(@Param('id') id: string) {
    return this.campaigns.getCampaign(id)
  }

  @UseGuards(JwtGuard)
  @Post('campaign')
  async createCampaign(@Body() dto: CreateCampaignDto) {
    const name = (dto.name ?? 'Campaña WhatsApp').trim()
    return this.campaigns.createCampaignAndStart({
      name,
      body: dto.body,
      blockId: typeof dto.blockId === 'number' ? dto.blockId : undefined,
      tags: dto.tags?.trim() ? dto.tags.trim() : undefined,
      requireAllTags: Boolean(dto.requireAllTags),
      delayMs: typeof dto.delayMs === 'number' ? dto.delayMs : 2500,
    })
  }

  @UseGuards(JwtGuard)
  @Post('campaign/:id/resume')
  async resume(@Param('id') id: string) {
    return this.campaigns.resumeCampaign(id)
  }

  @UseGuards(JwtGuard)
  @Post('campaign/:id/cancel')
  async cancel(@Param('id') id: string) {
    return this.campaigns.cancelCampaign(id)
  }

  @UseGuards(JwtGuard)
  @Post('campaign/:id/resend-all')
  async resendAll(@Param('id') id: string) {
    return this.campaigns.resendAllCampaign(id)
  }

  /**
   * ✅ Webhook SIN JWT (Whapi pega desde afuera)
   */
  @Post('webhook')
  async webhook(@Query('secret') secret: string | undefined, @Body() payload: unknown) {
    const expected = process.env.WHAPI_WEBHOOK_SECRET || ''
    if (expected && secret !== expected) return { ok: false, error: 'unauthorized' }

    const p = isRecord(payload) ? (payload as AnyRecord) : {}
    const eventStr = deriveEventString(p)
    const rows = extractStatuses(payload)

    // log siempre
    await this.prisma.whatsappWebhookLog.create({
      data: {
        event: eventStr || safeString(p['event']) || null,
        messageId: rows[0]?.id ?? null,
        status: rows[0]?.status ?? null,
        payload: p as any,
      },
    })

    if (!rows.length) return { ok: true }

    const now = new Date()

    for (const stRow of rows) {
      const messageId = stRow.id
      const mappedMsgStatus = mapMsgStatus(stRow.status)
      if (!mappedMsgStatus) continue

      // actualiza whatsappMessage por whapiMessageId
      await this.prisma.whatsappMessage.updateMany({
        where: { whapiMessageId: messageId },
        data: {
          status: mappedMsgStatus,
          deliveredAt: mappedMsgStatus === WhatsappMessageStatus.delivered ? now : undefined,
          readAt: mappedMsgStatus === WhatsappMessageStatus.read ? now : undefined,
          error: mappedMsgStatus === WhatsappMessageStatus.failed ? (stRow.error || 'failed') : undefined,
        },
      })

      const msg = await this.prisma.whatsappMessage.findFirst({
        where: { whapiMessageId: messageId },
        select: { campaignItemId: true },
      })
      if (!msg?.campaignItemId) continue

      const itemId = msg.campaignItemId
      const mappedItem = msgToItemStatus(mappedMsgStatus)
      if (!mappedItem) continue

      await this.prisma.$transaction(async (tx) => {
        const item = await tx.whatsappCampaignItem.findUnique({
          where: { id: itemId },
          select: { id: true, campaignId: true, status: true },
        })
        if (!item) return

        const prev = item.status
        // si ya está failed/skipped, no avanzar
        if (prev === WhatsappCampaignItemStatus.failed || prev === WhatsappCampaignItemStatus.skipped) return

        const prevRank = statusRankItem(prev)
        const nextRank = statusRankItem(mappedItem)
        if (nextRank <= prevRank) return

        // update item
        await tx.whatsappCampaignItem.update({
          where: { id: item.id },
          data: { status: mappedItem },
        })

        // contadores “al menos delivered/read”
        if (mappedItem === WhatsappCampaignItemStatus.delivered) {
          // si viene delivered y antes era < delivered
          if (prevRank < statusRankItem(WhatsappCampaignItemStatus.delivered)) {
            await tx.whatsappCampaign.update({
              where: { id: item.campaignId },
              data: { deliveredCount: { increment: 1 } },
            })
          }
        }

        if (mappedItem === WhatsappCampaignItemStatus.read) {
          // si salta directo a read sin delivered
          if (prevRank < statusRankItem(WhatsappCampaignItemStatus.delivered)) {
            await tx.whatsappCampaign.update({
              where: { id: item.campaignId },
              data: { deliveredCount: { increment: 1 } },
            })
          }
          if (prevRank < statusRankItem(WhatsappCampaignItemStatus.read)) {
            await tx.whatsappCampaign.update({
              where: { id: item.campaignId },
              data: { readCount: { increment: 1 } },
            })
          }
        }
      })
    }

    return { ok: true }
  }
}
