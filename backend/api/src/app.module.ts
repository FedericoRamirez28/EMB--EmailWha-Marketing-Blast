import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { PrismaModule } from '@/prisma/prisma.module'
import { UsersModule } from '@/users/users.module'
import { AuthModule } from '@/auth/auth.module'
import { BlocksModule } from '@/blocks/blocks.module'
import { RecipientsModule } from '@/recipients/recipients.module'
import { AttachmentsModule } from './attachments/attachments.module'
import { SettingsModule } from './settings/settings.module'
import { MailModule } from './mail/mail.module'
import { WhapiModule } from './whapi/whapi.module'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [`.env.${process.env.NODE_ENV || 'development'}`, '.env'],
    }),
    PrismaModule,
    UsersModule,
    AuthModule,
    BlocksModule,
    RecipientsModule,
    AttachmentsModule,
    SettingsModule,
    MailModule,
    WhapiModule,
  ],
})
export class AppModule {}