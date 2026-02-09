import { BadRequestException, Injectable } from '@nestjs/common'
import { PrismaService } from '@/prisma/prisma.service'

/* ================= helpers ================= */

function normStr(v: unknown): string {
  return String(v ?? '').trim()
}

function normalizeEmail(raw: unknown): string {
  let s = String(raw ?? '').trim()

  // BOM
  s = s.replace(/^\uFEFF/, '')

  // mailto:
  s = s.replace(/^mailto:/i, '')

  // "Nombre <mail@dom.com>"
  const angled = s.match(/<([^>]+)>/)
  if (angled?.[1]) s = angled[1].trim()

  // quitar comillas
  s = s.replace(/^"+|"+$/g, '').trim()

  // quitar puntuación pegada
  s = s.replace(/[),.;:\]]+$/g, '').trim()
  s = s.replace(/^[([<]+/g, '').trim()

  // lower + sin espacios
  s = s.toLowerCase().replace(/\s+/g, '')

  return s
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email)
}

/* ================= service ================= */

@Injectable()
export class RecipientsService {
  constructor(private readonly prisma: PrismaService) {}

  listAll() {
    return this.prisma.recipient.findMany({
      orderBy: { id: 'asc' },
    })
  }

  async createMany(
    rows: Array<{
      name?: string
      email: string
      tags?: string
      blockId?: number
    }>,
  ) {
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new BadRequestException('rows vacío')
    }

    // 1) Normalizar + validar
    const normalized = rows
      .map((r) => {
        const email = normalizeEmail(r.email)
        const name = normStr(r.name)
        const tags = normStr(r.tags)
        const blockId =
          Number.isFinite(Number(r.blockId)) && Number(r.blockId) >= 0
            ? Number(r.blockId)
            : 0

        return { email, name, tags, blockId }
      })
      .filter((r) => r.email && isValidEmail(r.email))

    if (!normalized.length) {
      throw new BadRequestException('No hay emails válidos')
    }

    // 2) Deduplicar en memoria por email
    const mapByEmail = new Map<string, { email: string; name: string; tags: string; blockId: number }>()
    for (const r of normalized) {
      // si viene repetido, nos quedamos con el primero
      if (!mapByEmail.has(r.email)) {
        mapByEmail.set(r.email, r)
      }
    }
    const uniqueRows = [...mapByEmail.values()]

    // 3) Consultar existentes en DB para no chocar unique(email)
    const existing = await this.prisma.recipient.findMany({
      where: { email: { in: uniqueRows.map((r) => r.email) } },
      select: { email: true },
    })
    const existingSet = new Set(existing.map((e) => e.email))

    // 4) Insertar solo los nuevos (SIN skipDuplicates)
    const toInsert = uniqueRows.filter((r) => !existingSet.has(r.email))

    if (toInsert.length) {
      await this.prisma.recipient.createMany({
        data: toInsert,
      })
    }

    return {
      inserted: toInsert.length,
      skipped: uniqueRows.length - toInsert.length,
      receivedValid: normalized.length,
    }
  }

  async removeOne(id: number) {
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestException('id inválido')
    }

    await this.prisma.recipient.delete({
      where: { id },
    })

    return { ok: true }
  }

  async bulkDelete(ids: number[]) {
    const cleanIds = (ids ?? [])
      .map(Number)
      .filter((n) => Number.isInteger(n) && n > 0)

    if (!cleanIds.length) {
      throw new BadRequestException('ids vacío')
    }

    await this.prisma.recipient.deleteMany({
      where: { id: { in: cleanIds } },
    })

    return { ok: true }
  }

  async bulkMove(ids: number[], destBlockId: number) {
    const cleanIds = (ids ?? [])
      .map(Number)
      .filter((n) => Number.isInteger(n) && n > 0)

    if (!cleanIds.length) {
      throw new BadRequestException('ids vacío')
    }

    const dest = Number(destBlockId)
    if (!Number.isInteger(dest) || dest < 0) {
      throw new BadRequestException('destBlockId inválido')
    }

    await this.prisma.recipient.updateMany({
      where: { id: { in: cleanIds } },
      data: { blockId: dest },
    })

    return { ok: true }
  }
}
