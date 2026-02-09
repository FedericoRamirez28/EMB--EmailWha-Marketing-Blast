import { Body, Controller, Delete, Get, Param, Put, UseGuards } from '@nestjs/common'
import { JwtGuard } from '@/auth/jwt.guard'
import { BlocksService } from './blocks.service'
import { UpsertBlockDto } from './dto/upsert-block.dto'

@UseGuards(JwtGuard)
@Controller('blocks')
export class BlocksController {
  constructor(private blocks: BlocksService) {}

  @Get()
  list() {
    return this.blocks.list()
  }

  @Put()
  upsert(@Body() dto: UpsertBlockDto) {
    return this.blocks.upsert(dto)
  }

  @Delete(':id')
  remove(@Param('id') idStr: string) {
    const id = Number(idStr)
    return this.blocks.remove(id)
  }
}
