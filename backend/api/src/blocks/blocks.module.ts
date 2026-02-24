import { Module } from '@nestjs/common'
import { BlocksService } from './blocks.service'
import { BlocksController } from './blocks.controller'
import { EmailBlocksController } from './email-blocks.controller'

@Module({
  controllers: [BlocksController, EmailBlocksController],
  providers: [BlocksService],
  exports: [BlocksService],
})
export class BlocksModule {}