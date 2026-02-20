import { Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcrypt'
import { UsersService } from '@/users/users.service'

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string): Promise<{ access_token: string }> {
    const user = await this.users.findByEmail(email)
    if (!user) throw new UnauthorizedException('Credenciales inválidas')

    const ok = await bcrypt.compare(password, user.passwordHash)
    if (!ok) throw new UnauthorizedException('Credenciales inválidas')

    const access_token = await this.jwt.signAsync({
      sub: user.id,
      email: user.email,
    })

    return { access_token }
  }

  async me(userId: string): Promise<{ id: string; email: string; name: string | null }> {
    const u = await this.users.findById(userId)
    if (!u) throw new UnauthorizedException('Token inválido')
    return { id: u.id, email: u.email, name: u.name ?? null }
  }
}