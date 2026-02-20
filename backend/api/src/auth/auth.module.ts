import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { ConfigModule, ConfigService } from '@nestjs/config'

import { UsersModule } from '@/users/users.module'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { JwtStrategy } from './jwt.strategy'

@Module({
  imports: [
    UsersModule,
    PassportModule,
    ConfigModule, // ✅ IMPORTANTE
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => {
        const secret = cfg.get<string>('JWT_SECRET')
        if (!secret) {
          // ✅ Error claro si no está cargando el .env
          throw new Error('JWT_SECRET missing. Revisá .env.development y NODE_ENV.')
        }
        return {
          secret,
          signOptions: { expiresIn: '7d' },
        }
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService, JwtModule], // ✅ útil si lo usás en otros módulos
})
export class AuthModule {}