import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '@/prisma/prisma.service'

const MAX_BLOCK_CAPACITY = 2000

function clampInt(n: unknown, min: number, max: number) {
  const x = Number(n)
  if (!Number.isFinite(x)) return min
  return Math.max(min, Math.min(max, Math.trunc(x)))
}

@Injectable()
export class BlocksService {
  constructor(private prisma: PrismaService) {}

  async list() {
    const blocks = await this.prisma.block.findMany({ orderBy: { id: 'asc' } })
    return [...blocks, { id: 0, name: 'Sin bloque', capacity: 999999 }]
  }

  private async nextId(): Promise<number> {
    const maxRow = await this.prisma.block.findFirst({
      orderBy: { id: 'desc' },
      select: { id: true },
    })
    return (maxRow?.id ?? 0) + 1
  }

  async createOrUpsert(data: { id?: number; name: string; capacity: number }) {
    const hasId = typeof data.id === 'number' && Number.isInteger(data.id) && data.id > 0
    const id = hasId ? (data.id as number) : await this.nextId()

    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestException('Block id inválido (debe ser > 0)')
    }

    const name = String(data.name ?? '').trim() || `Bloque ${id}`
    const capacity = clampInt(data.capacity, 1, MAX_BLOCK_CAPACITY)

    return this.prisma.block.upsert({
      where: { id },
      update: { name, capacity },
      create: { id, name, capacity },
    })
  }

  async remove(id: number) {
    if (!Number.isInteger(id) || id <= 0) throw new BadRequestException('id inválido')
    const existing = await this.prisma.block.findUnique({ where: { id } })
    if (!existing) throw new NotFoundException('Bloque no existe')

    await this.prisma.recipient.updateMany({
      where: { blockId: id },
      data: { blockId: 0 },
    })

    await this.prisma.block.delete({ where: { id } })
    return { ok: true }
  }
}
