import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common'
import { JwtGuard } from '@/auth/jwt.guard'
import { WhatsappRecipientsService } from './whatsapp-recipients.service'
import { CreateManyWaDto } from './dto/create-many-wa.dto'

@UseGuards(JwtGuard)
@Controller('whatsapp/recipients')
export class WhatsappRecipientsController {
  constructor(private readonly recipients: WhatsappRecipientsService) {}

  @Get()
  list() {
    return this.recipients.list()
  }

  @Post('create-many')
  createMany(@Body() dto: CreateManyWaDto) {
    return this.recipients.createMany(dto)
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.recipients.remove(id)
  }

  @Post('bulk-remove')
  bulkRemove(@Body() body: { ids: number[] }) {
    return this.recipients.bulkRemove(body.ids ?? [])
  }

  @Post('bulk-move')
  bulkMove(@Body() body: { ids: number[]; blockId: number }) {
    return this.recipients.bulkMove(body.ids ?? [], Number(body.blockId))
  }
}