import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import type { Request } from 'express'

@Injectable()
export class WhapiWebhookGuard implements CanActivate {
  canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<Request>()
    const secret = (process.env.WHAPI_WEBHOOK_SECRET || '').trim()
    if (!secret) throw new UnauthorizedException('WHAPI_WEBHOOK_SECRET missing')

    const h = String(req.headers['x-whapi-secret'] ?? '').trim()
    const q = String((req.query as any)?.secret ?? '').trim()

    if (h === secret || q === secret) return true
    throw new UnauthorizedException('Invalid webhook secret')
  }
}