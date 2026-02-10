import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common'
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

  /** ✅ Nuevo: crea bloque con ID automático si no viene id */
  @Post()
  create(@Body() dto: UpsertBlockDto) {
    return this.blocks.createOrUpsert(dto)
  }

  /** ✅ Mantengo tu endpoint */
  @Put()
  upsert(@Body() dto: UpsertBlockDto) {
    return this.blocks.createOrUpsert(dto)
  }

  @Delete(':id')
  remove(@Param('id') idStr: string) {
    const id = Number(idStr)
    return this.blocks.remove(id)
  }
}
