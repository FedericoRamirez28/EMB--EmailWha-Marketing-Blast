import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post, Query, Req, UseGuards } from '@nestjs/common'
import type { Request } from 'express'
import { WhatsappCampaignItemStatus, WhatsappCampaignMediaType, WhatsappMessageStatus } from '@prisma/client'
import { PrismaService } from '@/prisma/prisma.service'
import { JwtGuard } from '@/auth/jwt.guard'
import { Public } from '@/auth/public.decorator'
import { WhapiService } from './whapi.service'
import { SendTextDto } from './dto/send-text.dto'
import { CreateCampaignDto } from './dto/campaign.dto'
import { WhapiCampaignService } from './whapi.campaign.service'
import { WhapiAutoReplyService } from './whapi.autoreply.service'

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

  if (s.includes('read')) return WhatsappMessageStatus.read
  if (s.includes('deliver')) return WhatsappMessageStatus.delivered
  if (s.includes('sent')) return WhatsappMessageStatus.sent
  if (s.includes('fail') || s.includes('error') || s.includes('reject')) return WhatsappMessageStatus.failed
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
  return safeString(p['type']) || safeString(p['update_type']) || ''
}

function extractStatuses(payload: unknown): Array<{ id: string; status: string; error?: string }> {
  if (!isRecord(payload)) return []
  const p = payload as AnyRecord
  const out: Array<{ id: string; status: string; error?: string }> = []

  const pickId = (row: AnyRecord) =>
    safeString(row['id']) ||
    safeString(row['message_id']) ||
    safeString(row['messageId']) ||
    safeString(row['msg_id'])

  const pickStatus = (row: AnyRecord) => safeString(row['status']) || safeString(row['ack']) || safeString(row['state'])

  const pushRow = (row: unknown) => {
    if (!isRecord(row)) return
    const r = row as AnyRecord
    const msg = isRecord(r['message']) ? (r['message'] as AnyRecord) : null
    const id = (msg ? pickId(msg) : '') || pickId(r)
    const st = (msg ? pickStatus(msg) : '') || pickStatus(r)
    const er = safeString(r['error']) || (msg ? safeString(msg['error']) : '')
    if (!id || !st) return
    out.push(er ? { id, status: st, error: er } : { id, status: st })
  }

  if (Array.isArray(p['statuses'])) {
    for (const s of p['statuses'] as unknown[]) pushRow(s)
    if (out.length) return out
  }

  if (Array.isArray(p['messages'])) {
    // ojo: messages[] suele ser inbound, pero por si trae status también
    for (const s of p['messages'] as unknown[]) pushRow(s)
    if (out.length) return out
  }

  const data = p['data']
  if (Array.isArray(data)) {
    for (const s of data) pushRow(s)
    if (out.length) return out
  }

  if (isRecord(data)) {
    const d = data as AnyRecord

    if (Array.isArray(d['statuses'])) {
      for (const s of d['statuses'] as unknown[]) pushRow(s)
      if (out.length) return out
    }

    if (Array.isArray(d['messages'])) {
      for (const s of d['messages'] as unknown[]) pushRow(s)
      if (out.length) return out
    }

    if (isRecord(d['message'])) pushRow(d)
    pushRow(d)
    if (out.length) return out
  }

  if (isRecord(p['message'])) pushRow(p)
  return out
}

@Controller('whapi')
export class WhapiController {
  constructor(
    private readonly whapi: WhapiService,
    private readonly prisma: PrismaService,
    private readonly campaigns: WhapiCampaignService,
    private readonly bot: WhapiAutoReplyService,
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

  // ✅ BOT CONFIG (para UI)
  @UseGuards(JwtGuard)
  @Get('bot-config')
  async getBotConfig() {
    const data = await this.bot.getConfig()
    return { ok: true, data }
  }

  @UseGuards(JwtGuard)
  @Post('bot-config')
  async updateBotConfig(@Body() patch: any) {
    const data = await this.bot.updateConfig(patch || {})
    return { ok: true, data }
  }

  @UseGuards(JwtGuard)
  @Post('send')
  async send(@Body() dto: SendTextDto) {
    const to = normPhone(dto.to)
    const body = String(dto.body ?? '')
    const clientRef = dto.clientRef?.trim() ? dto.clientRef.trim() : null

    if (clientRef) {
      const existing = await this.prisma.whatsappMessage.findFirst({
        where: { clientRef },
        select: { id: true, status: true, error: true, whapiMessageId: true },
      })

      if (existing) {
        if (existing.status === WhatsappMessageStatus.failed) {
          return { ok: false, id: existing.id, status: 'failed', error: existing.error ?? 'failed', deduped: true }
        }
        const apiStatus = existing.status === WhatsappMessageStatus.pending ? 'pending' : 'sent'
        return { ok: true, id: existing.id, whapiMessageId: existing.whapiMessageId ?? null, status: apiStatus, deduped: true }
      }
    }

    const msg = await this.prisma.whatsappMessage.create({
      data: { to, body, status: WhatsappMessageStatus.pending, clientRef },
      select: { id: true },
    })

    try {
      const r = await this.whapi.sendText(to, body)
      const rawId = (r as any)?.message?.id || (r as any)?.id
      const whapiMessageId = typeof rawId === 'string' ? rawId : ''

      await this.prisma.whatsappMessage.update({
        where: { id: msg.id },
        data: { whapiMessageId: whapiMessageId || null, status: WhatsappMessageStatus.sent, sentAt: new Date(), error: null },
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
      select: { id: true, to: true, status: true, error: true, whapiMessageId: true, createdAt: true, sentAt: true, deliveredAt: true, readAt: true },
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

    const mediaTypeStr = (dto.mediaType ?? 'text').toLowerCase()
    const mediaType =
      mediaTypeStr === 'image'
        ? WhatsappCampaignMediaType.image
        : mediaTypeStr === 'video'
          ? WhatsappCampaignMediaType.video
          : mediaTypeStr === 'document'
            ? WhatsappCampaignMediaType.document
            : WhatsappCampaignMediaType.text

    const body = String(dto.body ?? '')

    if (mediaType === WhatsappCampaignMediaType.text && !body.trim()) {
      throw new BadRequestException('body_required')
    }

    const attachmentId = typeof dto.attachmentId === 'number' ? dto.attachmentId : undefined
    if (mediaType !== WhatsappCampaignMediaType.text && !attachmentId) {
      throw new BadRequestException('attachment_required')
    }

    let scheduledAt: Date | null = null
    if (dto.scheduledAt) {
      const d = new Date(dto.scheduledAt)
      if (Number.isNaN(d.getTime())) throw new BadRequestException('scheduledAt inválido')
      scheduledAt = d
    }

    return this.campaigns.createCampaignAndStart({
      name,
      body,
      blockId: typeof dto.blockId === 'number' ? dto.blockId : undefined,
      tags: dto.tags?.trim() ? dto.tags.trim() : undefined,
      requireAllTags: Boolean(dto.requireAllTags),
      delayMs: typeof dto.delayMs === 'number' ? dto.delayMs : 2500,
      mediaType,
      attachmentId,
      scheduledAt,
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

  @UseGuards(JwtGuard)
  @Get('webhook-logs')
  async webhookLogs(@Query('take') take?: string) {
    const n = Math.max(1, Math.min(200, Number(take || 50)))
    const rows = await this.prisma.whatsappWebhookLog.findMany({
      take: n,
      orderBy: { createdAt: 'desc' },
      select: { id: true, createdAt: true, event: true, messageId: true, status: true, payload: true },
    })
    return { ok: true, data: rows }
  }

  @Public()
  @Post('webhook')
  @HttpCode(200)
  async webhook(@Req() req: Request, @Query('secret') secret: string | undefined, @Body() payload: unknown) {
    const expected = (process.env.WHAPI_WEBHOOK_SECRET || '').trim()
    const headerSecret = String(req.headers['x-whapi-secret'] ?? '').trim()
    const querySecret = String(secret ?? '').trim()

    if (expected && headerSecret !== expected && querySecret !== expected) {
      return { ok: false, error: 'unauthorized' }
    }

    const eventStr = isRecord(payload) ? deriveEventString(payload as AnyRecord) : ''
    const rows = extractStatuses(payload)

    await this.prisma.whatsappWebhookLog
      .create({
        data: {
          event: eventStr || null,
          messageId: rows[0]?.id ?? null,
          status: rows[0]?.status ?? null,
          payload: payload as any,
        },
      })
      .catch(() => undefined)

    // ✅ 1) Procesar statuses (delivered/read/failed)
    if (rows.length) {
      const now = new Date()
      const touchedCampaignIds = new Set<string>()

      for (const stRow of rows) {
        const whapiMsgId = stRow.id
        const mappedMsgStatus = mapMsgStatus(stRow.status)
        if (!mappedMsgStatus) continue

        await this.prisma.whatsappMessage.updateMany({
          where: { whapiMessageId: whapiMsgId },
          data: {
            status: mappedMsgStatus,
            deliveredAt: mappedMsgStatus === WhatsappMessageStatus.delivered ? now : undefined,
            readAt: mappedMsgStatus === WhatsappMessageStatus.read ? now : undefined,
            error: mappedMsgStatus === WhatsappMessageStatus.failed ? (stRow.error || 'failed') : null,
          },
        })

        const msg = await this.prisma.whatsappMessage.findFirst({
          where: { whapiMessageId: whapiMsgId },
          select: { campaignItemId: true },
        })
        if (!msg?.campaignItemId) continue

        const itemId = msg.campaignItemId
        const mappedItem = msgToItemStatus(mappedMsgStatus)
        if (!mappedItem) continue

        const updated = await this.prisma.$transaction(async (tx) => {
          const item = await tx.whatsappCampaignItem.findUnique({
            where: { id: itemId },
            select: { id: true, campaignId: true, status: true },
          })
          if (!item) return { campaignId: null as string | null }

          const prev = item.status
          if (prev === WhatsappCampaignItemStatus.failed || prev === WhatsappCampaignItemStatus.skipped) {
            return { campaignId: item.campaignId }
          }

          const prevRank = statusRankItem(prev)
          const nextRank = statusRankItem(mappedItem)
          if (nextRank <= prevRank) return { campaignId: item.campaignId }

          await tx.whatsappCampaignItem.update({
            where: { id: item.id },
            data: { status: mappedItem, updatedAt: now, lastError: mappedItem === WhatsappCampaignItemStatus.failed ? (stRow.error || 'failed') : null },
          })

          return { campaignId: item.campaignId }
        })

        if (updated.campaignId) touchedCampaignIds.add(updated.campaignId)
      }

      for (const campaignId of touchedCampaignIds) {
        const agg = await this.prisma.whatsappCampaignItem.groupBy({
          by: ['status'],
          where: { campaignId },
          _count: { _all: true },
        })

        const count = (s: WhatsappCampaignItemStatus) => agg.find((a) => a.status === s)?._count._all ?? 0
        const total = await this.prisma.whatsappCampaignItem.count({ where: { campaignId } })
        const pending = count(WhatsappCampaignItemStatus.pending) + count(WhatsappCampaignItemStatus.sending)
        const doneCount = Math.max(0, total - pending)

        const sent = count(WhatsappCampaignItemStatus.sent)
        const delivered = count(WhatsappCampaignItemStatus.delivered)
        const read = count(WhatsappCampaignItemStatus.read)
        const failed = count(WhatsappCampaignItemStatus.failed)
        const skipped = count(WhatsappCampaignItemStatus.skipped)

        await this.prisma.whatsappCampaign.update({
          where: { id: campaignId },
          data: {
            total,
            doneCount,
            sentCount: sent + delivered + read,
            deliveredCount: delivered + read,
            readCount: read,
            failedCount: failed,
            skippedCount: skipped,
          },
        })
      }
    }

    // ✅ 2) Procesar inbound + auto-reply (messages.post)
    try {
      await this.bot.handleIncomingWebhook(payload)
    } catch {
      // nunca tirar error al webhook
    }

    return { ok: true }
  }
}