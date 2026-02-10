import { Injectable } from '@nestjs/common'

export type WhapiSendTextResponse = {
  id?: string
  message?: unknown
  [k: string]: unknown
}

@Injectable()
export class WhapiService {
  private baseUrl = (process.env.WHAPI_BASE_URL || 'https://gate.whapi.cloud').replace(/\/+$/, '')
  private token = (process.env.WHAPI_TOKEN || '').replace(/^Bearer\s+/i, '')

  isConfigured(): boolean {
    return Boolean(this.token && this.baseUrl)
  }

  private assertConfigured() {
    if (!this.token) throw new Error('WHAPI_TOKEN no configurado')
  }

  private normPhone(raw: string) {
    return String(raw ?? '').replace(/[^\d]/g, '')
  }

  async sendText(toRaw: string, body: string): Promise<WhapiSendTextResponse> {
    this.assertConfigured()
    const to = this.normPhone(toRaw)

    const res = await fetch(`${this.baseUrl}/messages/text`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify({ to, body }),
    })

    const parsed: unknown = await res.json().catch(() => ({}))
    const data = parsed && typeof parsed === 'object' ? (parsed as WhapiSendTextResponse) : ({} as WhapiSendTextResponse)

    if (!res.ok) {
      const msg = (data as any)?.message || JSON.stringify(data)
      throw new Error(`Whapi sendText failed: ${res.status} ${msg}`)
    }

    return data
  }
}
