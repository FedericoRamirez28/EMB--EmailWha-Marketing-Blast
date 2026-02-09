import { Module } from '@nestjs/common';
import { WhapiController } from './whapi.controller';
import { WhapiService } from './whapi.service';

@Module({
  controllers: [WhapiController],
  providers: [WhapiService],
})
export class WhapiModule {}
