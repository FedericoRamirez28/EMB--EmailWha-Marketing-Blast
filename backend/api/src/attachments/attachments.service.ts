import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '@/prisma/prisma.service'
import path from 'node:path'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'

const UPLOADS_DIR = path.join(process.cwd(), 'uploads')

function safeInt(v: any): number | null {
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  const x = Math.trunc(n)
  return x > 0 ? x : null
}

@Injectable()
export class AttachmentsService {
  constructor(private prisma: PrismaService) {}

  async list() {
    const rows = await this.prisma.attachment.findMany({ orderBy: { id: 'asc' } })
    return rows.map((a) => ({
      id: a.id,
      originalName: a.originalName,
      filename: a.filename,
      mimeType: a.mimeType,
      size: a.size,
      createdAt: a.createdAt,
      url: `/attachments/${a.id}/download`,
    }))
  }

  async addMany(files: Array<Express.Multer.File>) {
    if (!Array.isArray(files) || files.length === 0) throw new BadRequestException('No files')

    await fs.mkdir(UPLOADS_DIR, { recursive: true })

    const data = files.map((f) => ({
      originalName: f.originalname,
      filename: f.filename,
      mimeType: f.mimetype,
      size: f.size,
    }))

    await this.prisma.attachment.createMany({ data })
    return { inserted: data.length }
  }

  async removeOne(id: number) {
    if (!Number.isInteger(id) || id <= 0) throw new BadRequestException('id inválido')

    const row = await this.prisma.attachment.findUnique({ where: { id } })
    if (!row) throw new NotFoundException('Adjunto no encontrado')

    const full = path.join(UPLOADS_DIR, row.filename)
    try {
      await fs.unlink(full)
    } catch {
      // ignore
    }

    await this.prisma.attachment.delete({ where: { id } })
    return { ok: true }
  }

  async getFilePath(id: number) {
    if (!Number.isInteger(id) || id <= 0) throw new BadRequestException('id inválido')
    const row = await this.prisma.attachment.findUnique({ where: { id } })
    if (!row) throw new NotFoundException('Adjunto no encontrado')

    return {
      row,
      fullpath: path.join(UPLOADS_DIR, row.filename),
    }
  }

  private publicBase(): string {
    const base = String(process.env.PUBLIC_API_BASE || '').trim()
    if (!base) throw new BadRequestException('PUBLIC_API_BASE no configurado (Render env)')
    return base.replace(/\/+$/, '')
  }

  private publicSecret(): string {
    // ✅ podés setear ATTACHMENTS_PUBLIC_SECRET,
    // y si no existe, usa WHAPI_WEBHOOK_SECRET como fallback
    const s = String(process.env.ATTACHMENTS_PUBLIC_SECRET || process.env.WHAPI_WEBHOOK_SECRET || '').trim()
    if (!s) throw new BadRequestException('ATTACHMENTS_PUBLIC_SECRET missing (o WHAPI_WEBHOOK_SECRET fallback)')
    return s
  }

  private sign(id: number, exp: number): string {
    const secret = this.publicSecret()
    const msg = `${id}:${exp}`
    return crypto.createHmac('sha256', secret).update(msg).digest('hex')
  }

  verifyPublicSignature(id: number, expRaw: any, sigRaw: any) {
    const exp = safeInt(expRaw)
    const sig = String(sigRaw ?? '').trim()
    if (!exp || !sig) throw new BadRequestException('firma inválida (exp/sig)')

    const now = Math.floor(Date.now() / 1000)
    if (exp < now) throw new BadRequestException('firma expirada')

    const expected = this.sign(id, exp)

    // timing-safe compare
    const a = Buffer.from(expected, 'hex')
    const b = Buffer.from(sig, 'hex')
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      throw new BadRequestException('firma inválida')
    }
  }

  /**
   * ✅ URL pública firmada (para que Whapi descargue el archivo)
   */
  async getPublicSignedUrl(id: number, ttlSeconds = 3600) {
    if (!Number.isInteger(id) || id <= 0) throw new BadRequestException('id inválido')

    const row = await this.prisma.attachment.findUnique({ where: { id } })
    if (!row) throw new NotFoundException('Adjunto no encontrado')

    const exp = Math.floor(Date.now() / 1000) + Math.max(60, Math.trunc(ttlSeconds))
    const sig = this.sign(id, exp)
    const base = this.publicBase()

    const url = `${base}/attachments/${id}/public?exp=${exp}&sig=${sig}`
    return { url, exp, sig, row }
  }
}