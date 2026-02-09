import { Injectable } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'

type JwtPayload = { sub: string; email: string }

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v || !v.trim()) {
    throw new Error(`Missing env var: ${name}`)
  }
  return v
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: requireEnv('JWT_SECRET'), // ✅ ahora SIEMPRE string
    })
  }

  async validate(payload: JwtPayload) {
    return { id: payload.sub, email: payload.email }
  }
}
