import { Body, Controller, Post, UseGuards } from '@nestjs/common'
import { JwtGuard } from '@/auth/jwt.guard'
import { ImportPhonesDto } from './dto/import-phones.dto'
import { WhapiRecipientsService } from './whapi.recipients.service'

@UseGuards(JwtGuard)
@Controller('whapi/recipients')
export class WhapiRecipientsController {
  constructor(private readonly recipients: WhapiRecipientsService) {}

  @Post('import-phones')
  importPhones(@Body() dto: ImportPhonesDto) {
    return this.recipients.importPhones({
      blockId: dto.blockId,
      tags: dto.tags,
      rows: dto.rows,
    })
  }
}
