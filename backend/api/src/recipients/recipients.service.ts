import { Injectable } from '@nestjs/common'
import { PrismaService } from '@/prisma/prisma.service'
import { CreateManyDto } from './dto/create-many.dto'

@Injectable()
export class RecipientsService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    // ✅ solo EMAIL (por canal)
    return this.prisma.recipient.findMany({
      where: { channel: 'email' },
      orderBy: { id: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        tags: true,
        blockId: true,
        createdAt: true,
      },
    })
  }

  async createMany(dto: CreateManyDto) {
    const data = dto.recipients
      .map((r) => ({
        channel: 'email' as const,
        name: String(r.name ?? ''),
        email: String(r.email ?? '').trim() || null,
        phone: null,
        tags: String(r.tags ?? ''),
        blockId: Number(r.blockId ?? 0),
      }))
      .filter((x) => !!x.email)

    if (!data.length) return { ok: true, created: 0 }

    const res = await this.prisma.recipient.createMany({
      data,
      // ✅ con @@unique([channel,email]) esto evita duplicados
      skipDuplicates: true,
    })

    return { ok: true, created: res.count }
  }

  async remove(id: number) {
    await this.prisma.recipient.delete({ where: { id } }).catch(() => null)
    return { ok: true }
  }

  async bulkRemove(ids: number[]) {
    await this.prisma.recipient.deleteMany({
      where: { id: { in: ids }, channel: 'email' },
    })
    return { ok: true }
  }

  async bulkMove(ids: number[], blockId: number) {
    await this.prisma.recipient.updateMany({
      where: { id: { in: ids }, channel: 'email' },
      data: { blockId },
    })
    return { ok: true }
  }
}