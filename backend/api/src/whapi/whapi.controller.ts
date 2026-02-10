import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { PrismaService } from '@/prisma/prisma.service'
import { JwtGuard } from '@/auth/jwt.guard'
import { WhatsappCampaignItemStatus, WhatsappMessageStatus } from '@prisma/client'
import { WhapiService } from './whapi.service'
import { SendTextDto } from './dto/send-text.dto'
import { CreateCampaignDto } from './dto/campaign.dto'
import { WhapiCampaignService } from './whapi.campaign.service'

function safeString(v: unknown): string {
  return typeof v === 'string' ? v : ''
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

@UseGuards(JwtGuard)
@Controller('whapi')
export class WhapiController {
  constructor(
    private readonly whapi: WhapiService,
    private readonly prisma: PrismaService,
    private readonly campaigns: WhapiCampaignService,
  ) {}

  @Get('health')
  health() {
    return {
      ok: true,
      configured: this.whapi.isConfigured(),
      baseUrl: (process.env.WHAPI_BASE_URL || '').replace(/\/+$/, ''),
    }
  }

  @Post('send')
  async send(@Body() dto: SendTextDto) {
    const msg = await this.prisma.whatsappMessage.create({
      data: {
        to: dto.to,
        body: dto.body,
        status: WhatsappMessageStatus.pending,
        clientRef: dto.clientRef ?? null,
      },
      select: { id: true },
    })

    try {
      const r = await this.whapi.sendText(dto.to, dto.body)
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

      return {
        ok: true,
        id: msg.id,
        whapiMessageId: whapiMessageId || null,
        status: 'sent',
        data: r,
      }
    } catch (e: unknown) {
      const error = e instanceof Error ? e.message : 'send failed'
      await this.prisma.whatsappMessage.update({
        where: { id: msg.id },
        data: { status: WhatsappMessageStatus.failed, error },
      })
      return { ok: false, id: msg.id, status: 'failed', error }
    }
  }

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

  @Get('campaigns')
  async listCampaigns() {
    return this.campaigns.listCampaigns()
  }

  @Get('campaign/:id')
  async getCampaign(@Param('id') id: string) {
    return this.campaigns.getCampaign(id)
  }

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

  @Post('campaign/:id/resume')
  async resume(@Param('id') id: string) {
    return this.campaigns.resumeCampaign(id)
  }

  @Post('campaign/:id/cancel')
  async cancel(@Param('id') id: string) {
    return this.campaigns.cancelCampaign(id)
  }

  @Post('campaign/:id/retry-failed')
  async retryFailed(@Param('id') id: string) {
    return this.campaigns.retryFailed(id)
  }

  /**
   * ✅ Webhook SIN JWT (Whapi pega desde afuera)
   */
  @Post('webhook')
  @UseGuards() // sin guard
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

      // orden de avance
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

      // no retroceder; y no recontar si es igual
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
