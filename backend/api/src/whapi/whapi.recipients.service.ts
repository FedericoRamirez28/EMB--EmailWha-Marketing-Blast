import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { BlockChannel, Prisma, RecipientChannel } from '@prisma/client'
import { PrismaService } from '@/prisma/prisma.service'

function normPhone(raw: unknown): string {
  return String(raw ?? '').replace(/[^\d]/g, '').trim()
}

function normName(raw: unknown): string {
  return String(raw ?? '').replace(/\s+/g, ' ').trim()
}

function normCsvTags(csv?: unknown): string {
  const s = String(csv ?? '').trim()
  if (!s) return ''
  return s
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean)
    .join(',')
}

type ImportRow = { phone: string; name?: string }

@Injectable()
export class WhapiRecipientsService {
  constructor(private prisma: PrismaService) {}

  async list(params?: { q?: string; blockId?: number }) {
    const q = String(params?.q ?? '').trim()
    const blockId = typeof params?.blockId === 'number' ? Math.trunc(params.blockId) : undefined

    const where: Prisma.RecipientWhereInput = {
      channel: RecipientChannel.whatsapp,
      ...(typeof blockId === 'number' ? { blockId } : {}),
    }

    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
        { tags: { contains: q, mode: 'insensitive' } },
      ]
    }

    return this.prisma.recipient.findMany({
      where,
      select: { id: true, name: true, phone: true, tags: true, blockId: true },
      orderBy: { id: 'asc' },
    })
  }

  // Alta masiva directa (no-capacity) - opcional
  async bulkUpsert(input: { rows: Array<{ phone: string; name?: string; tags?: string; blockId?: number }> }) {
    const rows = Array.isArray(input?.rows) ? input.rows : []
    if (!rows.length) throw new BadRequestException('rows vacío')

    const seen = new Set<string>()
    const clean = rows
      .map((r) => ({
        phone: normPhone(r.phone),
        name: normName(r.name),
        tags: normCsvTags(r.tags),
        blockId: Number.isFinite(Number(r.blockId)) ? Math.trunc(Number(r.blockId)) : 0,
      }))
      .filter((r) => r.phone.length > 0)
      .filter((r) => {
        if (seen.has(r.phone)) return false
        seen.add(r.phone)
        return true
      })

    if (!clean.length) throw new BadRequestException('rows vacío')

    let inserted = 0
    let updated = 0

    await this.prisma.$transaction(async (tx) => {
      for (const r of clean) {
        const existing = await tx.recipient.findFirst({
          where: { channel: RecipientChannel.whatsapp, phone: r.phone },
          select: { id: true },
          orderBy: { id: 'asc' },
        })

        if (existing) {
          await tx.recipient.update({
            where: { id: existing.id },
            data: {
              name: r.name || undefined,
              tags: r.tags || undefined,
              blockId: r.blockId,
            },
          })
          updated++
        } else {
          await tx.recipient.create({
            data: {
              channel: RecipientChannel.whatsapp,
              phone: r.phone,
              name: r.name || '',
              tags: r.tags || '',
              blockId: r.blockId,
              email: `${r.phone}@wa.local`,
            },
          })
          inserted++
        }
      }
    })

    return { ok: true as const, inserted, updated }
  }

  async removeOne(id: number) {
    const rid = Math.trunc(Number(id))
    if (!Number.isFinite(rid) || rid <= 0) throw new BadRequestException('id inválido')

    const row = await this.prisma.recipient.findUnique({ where: { id: rid }, select: { id: true, channel: true } })
    if (!row || row.channel !== RecipientChannel.whatsapp) throw new NotFoundException('Recipient no existe')

    await this.prisma.recipient.delete({ where: { id: rid } })
    return { ok: true as const }
  }

  async bulkDelete(ids: number[]) {
    const list = (Array.isArray(ids) ? ids : [])
      .map((n) => Math.trunc(Number(n)))
      .filter((n) => Number.isFinite(n) && n > 0)

    if (!list.length) throw new BadRequestException('ids vacío')

    await this.prisma.recipient.deleteMany({
      where: { id: { in: list }, channel: RecipientChannel.whatsapp },
    })
    return { ok: true as const }
  }

  async bulkMove(ids: number[], destBlockId: number) {
    const list = (Array.isArray(ids) ? ids : [])
      .map((n) => Math.trunc(Number(n)))
      .filter((n) => Number.isFinite(n) && n > 0)

    if (!list.length) throw new BadRequestException('ids vacío')

    const dest = Math.trunc(Number(destBlockId))
    if (!Number.isFinite(dest) || dest < 0) throw new BadRequestException('destBlockId inválido')

    await this.prisma.recipient.updateMany({
      where: { id: { in: list }, channel: RecipientChannel.whatsapp },
      data: { blockId: dest },
    })
    return { ok: true as const }
  }

  // ✅ Import por bloque (con capacidad)
  async importPhones(input: { blockId: number; tags?: string; rows: ImportRow[] }) {
    const blockId = Math.trunc(Number(input?.blockId))
    if (!Number.isFinite(blockId) || blockId <= 0) throw new BadRequestException('blockId inválido')

    const block = await this.prisma.block.findFirst({
      where: { channel: BlockChannel.whatsapp, id: blockId },
      select: { id: true, capacity: true, name: true },
    })
    if (!block) throw new NotFoundException('Bloque no existe')

    const tags = normCsvTags(input.tags)

    const seen = new Set<string>()
    const rows = (Array.isArray(input?.rows) ? input.rows : [])
      .map((r) => ({ phone: normPhone(r.phone), name: normName(r.name) }))
      .filter((r) => r.phone.length > 0)
      .filter((r) => {
        if (seen.has(r.phone)) return false
        seen.add(r.phone)
        return true
      })

    if (!rows.length) throw new BadRequestException('rows vacío')

    const currentCount = await this.prisma.recipient.count({
      where: { channel: RecipientChannel.whatsapp, blockId },
    })
    const remaining = Math.max(0, block.capacity - currentCount)

    let inserted = 0
    let updated = 0
    let skipped = 0

    await this.prisma.$transaction(async (tx) => {
      let used = 0

      for (const r of rows) {
        const existing = await tx.recipient.findFirst({
          where: { channel: RecipientChannel.whatsapp, phone: r.phone },
          select: { id: true, blockId: true },
          orderBy: { id: 'asc' },
        })

        if (existing) {
          const needsSlot = existing.blockId !== blockId
          if (needsSlot && used >= remaining) {
            skipped++
            continue
          }

          await tx.recipient.update({
            where: { id: existing.id },
            data: {
              blockId,
              name: r.name || undefined,
              tags: tags || undefined,
            },
          })

          updated++
          if (needsSlot) used++
          continue
        }

        if (used >= remaining) {
          skipped++
          continue
        }

        await tx.recipient.create({
          data: {
            channel: RecipientChannel.whatsapp,
            phone: r.phone,
            blockId,
            name: r.name || '',
            tags: tags || '',
            email: `${r.phone}@wa.local`,
          },
        })

        inserted++
        used++
      }
    })

    return { ok: true as const, inserted, updated, skipped }
  }
}