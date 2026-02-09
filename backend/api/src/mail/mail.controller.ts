import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { JwtGuard } from '@/auth/jwt.guard'
import { MailService } from './mail.service'

@Controller('mail')
@UseGuards(JwtGuard)
export class MailController {
  constructor(private readonly service: MailService) {}

  @Post('test-smtp')
  testSmtp(@Body() body: any) {
    return this.service.testSmtp(body)
  }

  @Post('send-bulk')
  sendBulk(@Body() body: any) {
    return this.service.startSendBulk(body)
  }

  @Get('jobs/:jobId')
  getJob(@Param('jobId') jobId: string) {
    return this.service.getJob(jobId)
  }
}
