import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common'
import { Public } from '@/auth/public.decorator'
import { WhapiWebhookGuard } from './whapi.webhook.guard'
import { WhapiWebhookService } from './whapi.webhook.service'

@Controller('whapi')
export class WhapiWebhookController {
  constructor(private readonly svc: WhapiWebhookService) {}

  @Public()
  @UseGuards(WhapiWebhookGuard)
  @Post('webhook')
  @HttpCode(200)
  async webhook(@Body() body: any) {
    await this.svc.ingest(body)
    return { ok: true }
  }
}