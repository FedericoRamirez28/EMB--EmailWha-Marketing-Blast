import { Injectable } from '@nestjs/common'
import { PrismaService } from '@/prisma/prisma.service'

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  async get(key: string): Promise<{ key: string; value: string } | null> {
    const row = await this.prisma.setting.findUnique({ where: { key } })
    if (!row) return null
    return { key: row.key, value: row.value }
  }

  async set(key: string, value: string): Promise<{ key: string; value: string }> {
    const row = await this.prisma.setting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    })
    return { key: row.key, value: row.value }
  }
}
