import { Body, Controller, Get, Headers, Post, Query } from '@nestjs/common';
import { WhapiService } from './whapi.service';
import { SendTextDto } from './dto/send-text.dto';

@Controller('whapi')
export class WhapiController {
  constructor(private readonly whapi: WhapiService) {}

  @Get('health')
  health() {
    return { ok: true };
  }

  @Post('send')
  async send(@Body() dto: SendTextDto) {
    const r = await this.whapi.sendText(dto.to, dto.body);
    return { ok: true, data: r };
  }

  /**
   * Webhook que vas a cargar en Whapi Panel:
   * https://TU_BACKEND.onrender.com/api/whapi/webhook?secret=XXX
   */
  @Post('webhook')
  async webhook(
    @Query('secret') secret: string | undefined,
    @Headers() headers: Record<string, string>,
    @Body() payload: any,
  ) {
    const expected = process.env.WHAPI_WEBHOOK_SECRET || '';
    if (expected && secret !== expected) {
      // Importante: respondé 200 igual si querés evitar reintentos infinitos,
      // pero marcá "unauthorized" para logs.
      return { ok: false, error: 'unauthorized' };
    }

    // MVP: log simple. Luego lo persistimos en Prisma (tabla logs + status updates)
    // console.log('WHAPI WEBHOOK', { headers, payload });

    return { ok: true };
  }
}
