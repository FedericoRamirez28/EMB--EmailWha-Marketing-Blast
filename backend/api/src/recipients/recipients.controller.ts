import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { JwtGuard } from '@/auth/jwt.guard'
import { RecipientsService } from './recipients.service'
import { BulkDeleteDto, BulkMoveDto, CreateManyRecipientsDto } from './dto/create-many.dto'

@UseGuards(JwtGuard)
@Controller('recipients')
export class RecipientsController {
  constructor(private recipients: RecipientsService) {}

  @Get()
  listAll() {
    return this.recipients.listAll()
  }

  @Post('bulk')
  createMany(@Body() dto: CreateManyRecipientsDto) {
    return this.recipients.createMany(dto.rows)
  }

  @Delete(':id')
  removeOne(@Param('id') idStr: string) {
    return this.recipients.removeOne(Number(idStr))
  }

  @Post('bulk-delete')
  bulkDelete(@Body() dto: BulkDeleteDto) {
    return this.recipients.bulkDelete(dto.ids)
  }

  @Patch('bulk-move')
  bulkMove(@Body() dto: BulkMoveDto) {
    return this.recipients.bulkMove(dto.ids, dto.destBlockId)
  }
}
