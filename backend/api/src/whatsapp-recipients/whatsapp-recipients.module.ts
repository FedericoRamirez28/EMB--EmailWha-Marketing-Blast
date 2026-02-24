import { Module } from '@nestjs/common'
import { WhatsappRecipientsController } from './whatsapp-recipients.controller'
import { WhatsappRecipientsService } from './whatsapp-recipients.service'

@Module({
  controllers: [WhatsappRecipientsController],
  providers: [WhatsappRecipientsService],
  exports: [WhatsappRecipientsService],
})
export class WhatsappRecipientsModule {}