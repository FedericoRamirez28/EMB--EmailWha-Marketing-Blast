import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { AppModule } from './app.module'

function parseOrigins(v: string | undefined): string[] | true {
  const s = String(v ?? '').trim()
  if (!s) return true // si no hay env, permitimos todo (mejor para debug)
  return s
    .split(',')
    .map(x => x.trim())
    .filter(Boolean)
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  app.enableCors({
    origin: parseOrigins(process.env.FRONTEND_ORIGIN),
    credentials: true,
  })

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  )

  const port = Number(process.env.PORT || 3001)
  await app.listen(port, '0.0.0.0') // ✅ importante en Render
  console.log(`API running on port ${port}`)
}

void bootstrap()
