import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common'
import { FilesInterceptor } from '@nestjs/platform-express'
import { diskStorage } from 'multer'
import path from 'node:path'
import fs from 'node:fs'
import type { Response } from 'express'
import { AttachmentsService } from './attachments.service'
import { JwtGuard } from '@/auth/jwt.guard'
import { Public } from '@/auth/public.decorator'

const UPLOADS_DIR = path.join(process.cwd(), 'uploads')

function safeName(name: string) {
  return name.replace(/[^\w.\-]+/g, '_')
}

@Controller('attachments')
@UseGuards(JwtGuard)
export class AttachmentsController {
  constructor(private readonly service: AttachmentsService) {
    if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true })
  }

  @Get()
  list() {
    return this.service.list()
  }

  @Post()
  @UseInterceptors(
    FilesInterceptor('files', 20, {
      storage: diskStorage({
        destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
        filename: (_req, file, cb) => {
          const ext = path.extname(file.originalname || '')
          const base = safeName(path.basename(file.originalname || 'file', ext))
          const uniq = `${Date.now()}_${Math.random().toString(16).slice(2)}`
          cb(null, `${base}_${uniq}${ext}`)
        },
      }),
      // ✅ subimos a 50MB para videos
      limits: { fileSize: 50 * 1024 * 1024 },
    }),
  )
  add(@UploadedFiles() files: Express.Multer.File[]) {
    return this.service.addMany(files)
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.removeOne(id)
  }

  @Get(':id/download')
  async download(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const { row, fullpath } = await this.service.getFilePath(id)
    return res.download(fullpath, row.originalName)
  }

  /**
   * ✅ PUBLIC: descarga firmada (Whapi puede acceder)
   * URL: /attachments/:id/public?exp=...&sig=...
   */
  @Public()
  @Get(':id/public')
  @HttpCode(200)
  async publicDownload(
    @Param('id', ParseIntPipe) id: number,
    @Query('exp') exp: string,
    @Query('sig') sig: string,
    @Query('dl') dl: string | undefined,
    @Res() res: Response,
  ) {
    this.service.verifyPublicSignature(id, exp, sig)

    const { row, fullpath } = await this.service.getFilePath(id)

    res.setHeader('Content-Type', row.mimeType || 'application/octet-stream')
    const isDownload = String(dl ?? '').trim() === '1'
    const disp = isDownload ? 'attachment' : 'inline'
    res.setHeader('Content-Disposition', `${disp}; filename="${row.originalName}"`)

    return res.sendFile(fullpath)
  }
}