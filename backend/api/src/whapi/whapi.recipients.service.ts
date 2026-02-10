import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '@/prisma/prisma.service'

function normPhone(raw: string): string {
  return String(raw ?? '').replace(/[^\d]/g, '').trim()
}

function normCsvTags(csv?: string | null): string {
  const s = String(csv ?? '').trim()
  if (!s) return ''
  return s
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean)
    .join(',')
}

@Injectable()
export class WhapiRecipientsService {
  constructor(private prisma: PrismaService) {}

  async importPhones(input: { blockId: number; tags?: string; rows: Array<{ phone: string; name?: string }> }) {
    const blockId = Math.trunc(input.blockId)
    if (!Number.isFinite(blockId) || blockId <= 0) throw new BadRequestException('blockId inválido')

    const block = await this.prisma.block.findUnique({ where: { id: blockId } })
    if (!block) throw new NotFoundException('Bloque no existe')

    const tags = normCsvTags(input.tags)

    // normalizar + dedupe
    const seen = new Set<string>()
    const rows = input.rows
      .map((r) => ({ phone: normPhone(r.phone), name: String(r.name ?? '').trim() }))
      .filter((r) => r.phone.length > 0)
      .filter((r) => {
        if (seen.has(r.phone)) return false
        seen.add(r.phone)
        return true
      })

    if (!rows.length) throw new BadRequestException('rows vacío')

    // capacidad actual del bloque
    const currentCount = await this.prisma.recipient.count({ where: { blockId } })
    const remaining = Math.max(0, block.capacity - currentCount)

    let inserted = 0
    let updated = 0
    let skipped = 0

    await this.prisma.$transaction(async (tx) => {
      let used = 0

      for (const r of rows) {
        if (used >= remaining) {
          skipped += 1
          continue
        }

        // upsert lógico por phone (phone NO es unique)
        const existing = await tx.recipient.findFirst({
          where: { phone: r.phone },
          select: { id: true },
          orderBy: { id: 'asc' },
        })

        if (existing) {
          await tx.recipient.update({
            where: { id: existing.id },
            data: {
              phone: r.phone,
              blockId,
              name: r.name ? r.name : undefined,
              tags: tags ? tags : undefined,
            },
          })
          updated += 1
          used += 1
          continue
        }

        // Si tu schema/db exige email NOT NULL, placeholder único por phone
        await tx.recipient.create({
          data: {
            phone: r.phone,
            blockId,
            name: r.name || '',
            tags: tags || '',
            email: `${r.phone}@wa.local`,
          },
        })
        inserted += 1
        used += 1
      }
    })

    return { ok: true, inserted, updated, skipped }
  }
}
