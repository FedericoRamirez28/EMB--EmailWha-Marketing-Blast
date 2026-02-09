import { Module } from '@nestjs/common'
import { PrismaService } from '@/prisma/prisma.service'
import { MailController } from './mail.controller'
import { MailService } from './mail.service'

@Module({
  controllers: [MailController],
  providers: [MailService, PrismaService],
})
export class MailModule {}
