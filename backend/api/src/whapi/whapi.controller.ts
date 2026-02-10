import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { Prisma, WhatsappCampaignItemStatus, WhatsappMessageStatus } from '@prisma/client'
import { PrismaService } from '@/prisma/prisma.service'
import { JwtGuard } from '@/auth/jwt.guard'
import { WhapiService } from './whapi.service'
import { SendTextDto } from './dto/send-text.dto'
import { CreateCampaignDto } from './dto/campaign.dto'
import { WhapiCampaignService } from './whapi.campaign.service'

function safeString(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function normPhone(raw: string) {
  return String(raw ?? '').replace(/[^\d]/g, '')
}

function mapMsgStatus(status: string): WhatsappMessageStatus | null {
  if (status === 'sent') return WhatsappMessageStatus.sent
  if (status === 'delivered') return WhatsappMessageStatus.delivered
  if (status === 'read') return WhatsappMessageStatus.read
  if (status === 'failed') return WhatsappMessageStatus.failed
  return null
}

function mapItemStatus(ms: WhatsappMessageStatus): WhatsappCampaignItemStatus | null {
  if (ms === WhatsappMessageStatus.sent) return WhatsappCampaignItemStatus.sent
  if (ms === WhatsappMessageStatus.delivered) return WhatsappCampaignItemStatus.delivered
  if (ms === WhatsappMessageStatus.read) return WhatsappCampaignItemStatus.read
  if (ms === WhatsappMessageStatus.failed) return WhatsappCampaignItemStatus.failed
  return null
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

  /**
   * ✅ Para ver límites desde UI cuando quieras (manual refresh)
   */
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

  /**
   * ✅ SEND idempotente por clientRef:
   * - si llega el mismo clientRef otra vez => NO reenvía a Whapi
   * - retorna el registro existente
   */
  @UseGuards(JwtGuard)
  @Post('send')
  async send(@Body() dto: SendTextDto) {
    const to = normPhone(dto.to)
    const body = String(dto.body ?? '')
    const clientRef = dto.clientRef?.trim() ? dto.clientRef.trim() : null

    // 1) Si viene clientRef: si ya existe, devolvemos SIN reenviar (anti-duplicados)
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

    // 2) Crear registro (si hay unique en clientRef y hay carrera, atrapamos P2002 abajo)
    let msgId: string

    try {
      const msg = await this.prisma.whatsappMessage.create({
        data: {
          to,
          body,
          status: WhatsappMessageStatus.pending,
          clientRef,
        },
        select: { id: true },
      })
      msgId = msg.id
    } catch (e: unknown) {
      // ✅ Si agregaste @unique en clientRef y chocan 2 requests simultáneos, cae acá
      if (clientRef && e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
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
      throw e
    }

    // 3) Enviar a Whapi 1 sola vez
    try {
      const r = await this.whapi.sendText(to, body)
      const whapiMessageId = safeString((r as any)?.id)

      await this.prisma.whatsappMessage.update({
        where: { id: msgId },
        data: {
          whapiMessageId: whapiMessageId || null,
          status: WhatsappMessageStatus.sent,
          sentAt: new Date(),
          error: null,
        },
      })

      return {
        ok: true,
        id: msgId,
        whapiMessageId: whapiMessageId || null,
        status: 'sent',
        data: r,
      }
    } catch (e: unknown) {
      const error = e instanceof Error ? e.message : 'send failed'
      await this.prisma.whatsappMessage.update({
        where: { id: msgId },
        data: { status: WhatsappMessageStatus.failed, error },
      })
      return { ok: false, id: msgId, status: 'failed', error }
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
      maxRetries: typeof dto.maxRetries === 'number' ? dto.maxRetries : 2,
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
  @Post('campaign/:id/retry-failed')
  async retryFailed(@Param('id') id: string) {
    return this.campaigns.retryFailed(id)
  }

  /**
   * ✅ Webhook SIN JWT (Whapi pega desde afuera)
   */
  @Post('webhook')
  async webhook(@Query('secret') secret: string | undefined, @Body() payload: unknown) {
    const expected = process.env.WHAPI_WEBHOOK_SECRET || ''
    if (expected && secret !== expected) {
      return { ok: false, error: 'unauthorized' }
    }

    const p = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
    const event = safeString(p.event)
    const data = p.data && typeof p.data === 'object' ? (p.data as Record<string, unknown>) : {}

    let messageId: string | null = null
    let status: string | null = null

    if (event === 'statuses.post') {
      messageId = safeString(data.id) || null
      status = safeString(data.status) || null
    }

    await this.prisma.whatsappWebhookLog.create({
      data: {
        event: event || null,
        messageId,
        status,
        payload: p as any,
      },
    })

    if (!messageId || !status) return { ok: true }

    const mappedMsgStatus = mapMsgStatus(status)
    if (!mappedMsgStatus) return { ok: true }

    const now = new Date()

    const msg = await this.prisma.whatsappMessage.findUnique({
      where: { whapiMessageId: messageId },
      select: { id: true, campaignItemId: true },
    })

    await this.prisma.whatsappMessage.updateMany({
      where: { whapiMessageId: messageId },
      data: {
        status: mappedMsgStatus,
        deliveredAt: mappedMsgStatus === WhatsappMessageStatus.delivered ? now : undefined,
        readAt: mappedMsgStatus === WhatsappMessageStatus.read ? now : undefined,
        error: mappedMsgStatus === WhatsappMessageStatus.failed ? safeString((data as any).error) || 'failed' : undefined,
      },
    })

    if (!msg?.campaignItemId) return { ok: true }

    const itemId = msg.campaignItemId
    const mappedItem = mapItemStatus(mappedMsgStatus)
    if (!mappedItem) return { ok: true }

    // ✅ evitar duplicar contadores: solo si realmente avanza el status del item
    await this.prisma.$transaction(async (tx) => {
      const item = await tx.whatsappCampaignItem.findUnique({
        where: { id: itemId },
        select: { id: true, campaignId: true, status: true },
      })
      if (!item) return

      const prev = item.status

      const order: WhatsappCampaignItemStatus[] = [
        WhatsappCampaignItemStatus.pending,
        WhatsappCampaignItemStatus.sending,
        WhatsappCampaignItemStatus.sent,
        WhatsappCampaignItemStatus.delivered,
        WhatsappCampaignItemStatus.read,
        WhatsappCampaignItemStatus.failed,
        WhatsappCampaignItemStatus.skipped,
      ]

      const idxPrev = order.indexOf(prev)
      const idxNext = order.indexOf(mappedItem)
      if (idxNext <= idxPrev) return

      await tx.whatsappCampaignItem.update({
        where: { id: item.id },
        data: { status: mappedItem },
      })

      if (mappedItem === WhatsappCampaignItemStatus.delivered) {
        await tx.whatsappCampaign.update({
          where: { id: item.campaignId },
          data: { deliveredCount: { increment: 1 } },
        })
      }

      if (mappedItem === WhatsappCampaignItemStatus.read) {
        await tx.whatsappCampaign.update({
          where: { id: item.campaignId },
          data: { readCount: { increment: 1 } },
        })
      }
    })

    return { ok: true }
  }
}
