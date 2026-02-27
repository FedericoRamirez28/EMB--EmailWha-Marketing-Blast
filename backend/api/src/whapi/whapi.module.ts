import { Module } from '@nestjs/common'
import { PrismaService } from '@/prisma/prisma.service'
import { WhapiController } from './whapi.controller'
import { WhapiService } from './whapi.service'
import { WhapiCampaignService } from './whapi.campaign.service'
import { WhapiRecipientsService } from './whapi.recipients.service'
import { WhapiRecipientsController } from './whapi.recipients.controller'
import { AttachmentsModule } from '@/attachments/attachments.module'
import { WhapiAutoReplyService } from './whapi.autoreply.service'

@Module({
  imports: [AttachmentsModule],
  controllers: [WhapiController, WhapiRecipientsController],
  providers: [PrismaService, WhapiService, WhapiCampaignService, WhapiRecipientsService, WhapiAutoReplyService],
})
export class WhapiModule {}