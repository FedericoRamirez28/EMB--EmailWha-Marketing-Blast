import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { JwtGuard } from '@/auth/jwt.guard'
import { WhapiRecipientsService } from './whapi.recipients.service'

@UseGuards(JwtGuard)
@Controller('whapi/recipients')
export class WhapiRecipientsController {
  constructor(private readonly svc: WhapiRecipientsService) {}

  @Get()
  async list(@Query('q') q?: string, @Query('blockId') blockId?: string) {
    const b = blockId !== undefined ? Number(blockId) : undefined
    const rows = await this.svc.list({
      q,
      blockId: Number.isFinite(b as number) ? Math.trunc(b as number) : undefined,
    })
    return { ok: true as const, data: rows }
  }

  @Post('import-phones')
  async importPhones(@Body() body: { blockId: number; tags?: string; rows: Array<{ phone: string; name?: string }> }) {
    return this.svc.importPhones(body)
  }

  // (opcional) alta masiva directa
  @Post('bulk')
  async bulk(@Body() body: { rows: Array<{ phone: string; name?: string; tags?: string; blockId?: number }> }) {
    return this.svc.bulkUpsert(body)
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.svc.removeOne(id)
  }

  @Post('bulk-delete')
  async bulkDelete(@Body() body: { ids: number[] }) {
    return this.svc.bulkDelete(body?.ids ?? [])
  }

  @Patch('bulk-move')
  async bulkMove(@Body() body: { ids: number[]; destBlockId: number }) {
    return this.svc.bulkMove(body?.ids ?? [], Number(body?.destBlockId))
  }
}