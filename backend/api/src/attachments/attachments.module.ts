import { Module } from '@nestjs/common'
import { PrismaService } from '@/prisma/prisma.service'
import { AttachmentsController } from './attachments.controller'
import { AttachmentsService } from './attachments.service'

@Module({
  controllers: [AttachmentsController],
  providers: [PrismaService, AttachmentsService],
  exports: [AttachmentsService], // ✅ CLAVE: export para otros módulos (Whapi)
})
export class AttachmentsModule {}