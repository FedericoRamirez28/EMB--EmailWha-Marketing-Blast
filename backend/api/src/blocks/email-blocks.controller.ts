import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common'
import { JwtGuard } from '@/auth/jwt.guard'
import { BlocksService } from './blocks.service'
import { UpsertBlockDto } from './dto/upsert-block.dto'

@UseGuards(JwtGuard)
@Controller('email/blocks')
export class EmailBlocksController {
  constructor(private readonly blocks: BlocksService) {}

  @Get()
  listEmail() {
    return this.blocks.list('email')
  }

  @Post('upsert')
  upsertEmail(@Body() dto: UpsertBlockDto) {
    return this.blocks.upsert(dto, 'email')
  }

  @Delete(':id')
  removeEmail(@Param('id', ParseIntPipe) id: number) {
    return this.blocks.remove(id, 'email')
  }
}