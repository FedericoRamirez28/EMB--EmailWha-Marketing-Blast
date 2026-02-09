import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '@/prisma/prisma.service'
import path from 'node:path'
import fs from 'node:fs/promises'

const UPLOADS_DIR = path.join(process.cwd(), 'uploads')

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

    // asegurar dir uploads
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

    // borrar archivo (si existe)
    const full = path.join(UPLOADS_DIR, row.filename)
    try {
      await fs.unlink(full)
    } catch {
      // si no está, seguimos igual
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
}
