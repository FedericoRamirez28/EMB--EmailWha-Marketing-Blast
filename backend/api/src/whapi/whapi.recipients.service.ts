// src/whapi/whapi.recipients.service.ts
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
    const CHANNEL = 'whatsapp' as const

    const blockId = Math.trunc(input.blockId)
    if (!Number.isFinite(blockId) || blockId <= 0) throw new BadRequestException('blockId inválido')

    // ✅ Block tiene PK compuesta: @@id([channel, id])
    const block = await this.prisma.block.findUnique({
      where: { channel_id: { channel: CHANNEL, id: blockId } },
    })
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

    // ✅ capacidad actual del bloque SOLO whatsapp
    const currentCount = await this.prisma.recipient.count({
      where: { channel: CHANNEL, blockId },
    })
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

        // ✅ con @@unique([channel, phone]) buscamos por channel+phone
        const existing = await tx.recipient.findFirst({
          where: { channel: CHANNEL, phone: r.phone },
          select: { id: true },
          orderBy: { id: 'asc' },
        })

        if (existing) {
          await tx.recipient.update({
            where: { id: existing.id },
            data: {
              channel: CHANNEL,
              phone: r.phone,
              blockId,
              name: r.name ? r.name : undefined,
              tags: tags ? tags : undefined,
              email: null, // WA no usa email
            },
          })
          updated += 1
          used += 1
          continue
        }

        // ✅ email puede ser null (y no rompe @@unique([channel,email]) porque NULL no colisiona)
        await tx.recipient.create({
          data: {
            channel: CHANNEL,
            phone: r.phone,
            blockId,
            name: r.name || '',
            tags: tags || '',
            email: null,
          },
        })
        inserted += 1
        used += 1
      }
    })

    return { ok: true, inserted, updated, skipped }
  }
}