import { Module } from '@nestjs/common'
import { PrismaService } from '@/prisma/prisma.service'
import { WhapiController } from './whapi.controller'
import { WhapiService } from './whapi.service'
import { WhapiCampaignService } from './whapi.campaign.service'
import { WhapiRecipientsService } from './whapi.recipients.service'
import { WhapiRecipientsController } from './whapi.recipients.controller'
import { AttachmentsModule } from '@/attachments/attachments.module' // ✅ IMPORT

@Module({
  imports: [AttachmentsModule], // ✅ CLAVE: trae AttachmentsService al contexto
  controllers: [WhapiController, WhapiRecipientsController],
  providers: [PrismaService, WhapiService, WhapiCampaignService, WhapiRecipientsService],
})
export class WhapiModule {}