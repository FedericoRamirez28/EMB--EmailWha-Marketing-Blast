import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common'
import { JwtGuard } from '@/auth/jwt.guard'
import { SettingsService } from './setings.service'

@Controller('settings')
@UseGuards(JwtGuard)
export class SettingsController {
  constructor(private readonly service: SettingsService) {}

  @Get(':key')
  getOne(@Param('key') key: string) {
    return this.service.get(key)
  }

  @Put(':key')
  setOne(@Param('key') key: string, @Body() body: { value: string }) {
    return this.service.set(key, String(body?.value ?? ''))
  }
}
