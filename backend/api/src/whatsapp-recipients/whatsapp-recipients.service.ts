import { Injectable } from '@nestjs/common'
import { PrismaService } from '@/prisma/prisma.service'
import { CreateManyWaDto } from './dto/create-many-wa.dto'

function normPhone(raw: any): string {
  return String(raw ?? '').replace(/[^\d]/g, '').trim()
}

@Injectable()
export class WhatsappRecipientsService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    return this.prisma.recipient.findMany({
      where: { channel: 'whatsapp' },
      orderBy: { id: 'desc' },
      select: {
        id: true,
        name: true,
        phone: true,
        tags: true,
        blockId: true,
        createdAt: true,
      },
    })
  }

  async createMany(dto: CreateManyWaDto) {
    const data = dto.recipients
      .map((r) => ({
        channel: 'whatsapp' as const,
        phone: normPhone(r.phone) || null,
        email: null,
        name: String(r.name ?? ''),
        tags: String(r.tags ?? ''),
        blockId: Number(r.blockId ?? 0),
      }))
      .filter((x) => !!x.phone)

    if (!data.length) return { ok: true, created: 0 }

    const res = await this.prisma.recipient.createMany({
      data,
      // ✅ con @@unique([channel,phone]) evita duplicados
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
      where: { id: { in: ids }, channel: 'whatsapp' },
    })
    return { ok: true }
  }

  async bulkMove(ids: number[], blockId: number) {
    await this.prisma.recipient.updateMany({
      where: { id: { in: ids }, channel: 'whatsapp' },
      data: { blockId },
    })
    return { ok: true }
  }
}