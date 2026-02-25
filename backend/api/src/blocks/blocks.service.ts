import { Injectable } from '@nestjs/common'
import { PrismaService } from '@/prisma/prisma.service'
import { UpsertBlockDto, type BlockChannel } from './dto/upsert-block.dto'

const DEFAULT_BLOCKS: Record<BlockChannel, Array<{ id: number; name: string; capacity: number }>> = {
  whatsapp: [{ id: 1, name: 'Bloque 1', capacity: 250 }],
  email: [{ id: 1, name: 'Bloque 1', capacity: 250 }],
}

@Injectable()
export class BlocksService {
  constructor(private readonly prisma: PrismaService) {}

  async list(channel: BlockChannel) {
    const blocks = await this.prisma.block.findMany({
      where: { channel },
      orderBy: { id: 'asc' },
    })

    if (!blocks.length) {
      await this.prisma.block.createMany({
        data: DEFAULT_BLOCKS[channel].map((b) => ({ ...b, channel })),
      })
      return this.prisma.block.findMany({ where: { channel }, orderBy: { id: 'asc' } })
    }

    return blocks
  }

  async upsert(dto: UpsertBlockDto, forceChannel: BlockChannel) {
    const channel = (dto.channel ?? forceChannel) as BlockChannel

    return this.prisma.block.upsert({
      // ✅ IMPORTANTE: con @@id([channel,id]) el where compuesto se llama channel_id
      where: { channel_id: { channel, id: dto.id } },
      update: { name: dto.name, capacity: dto.capacity },
      create: { id: dto.id, channel, name: dto.name, capacity: dto.capacity },
    })
  }

  async remove(id: number, channel: BlockChannel) {
    await this.prisma.block
      .delete({
        where: { channel_id: { channel, id } },
      })
      .catch(() => null)

    return { ok: true }
  }
}