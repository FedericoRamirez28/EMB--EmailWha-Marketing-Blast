import { Injectable } from '@nestjs/common'

export type WhapiSendResponse = {
  id?: string
  message?: unknown
  [k: string]: unknown
}

type SendMediaArgs = {
  toRaw: string
  mediaUrl: string
  caption?: string
  filename?: string
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
    if (!this.baseUrl) throw new Error('WHAPI_BASE_URL no configurado')
  }

  private normPhone(raw: string) {
    return String(raw ?? '').replace(/[^\d]/g, '')
  }

  private async fetchJson(path: string, init: RequestInit, timeoutMs = 20000): Promise<{ res: Response; data: any }> {
    this.assertConfigured()

    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const res = await fetch(`${this.baseUrl}${path.startsWith('/') ? '' : '/'}${path}`, {
        ...init,
        signal: controller.signal,
      })

      const parsed: unknown = await res.json().catch(() => ({}))
      const data = parsed && typeof parsed === 'object' ? parsed : {}

      return { res, data }
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') {
        throw new Error(`Whapi request timeout (${timeoutMs}ms)`)
      }
      throw e instanceof Error ? e : new Error('Whapi request failed')
    } finally {
      clearTimeout(t)
    }
  }

  async getLimits(): Promise<unknown> {
    const { res, data } = await this.fetchJson(
      '/limits',
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
      },
      15000,
    )

    if (!res.ok) {
      const msg = (data as any)?.message || JSON.stringify(data)
      throw new Error(`Whapi getLimits failed: ${res.status} ${msg}`)
    }

    return data
  }

  async sendText(toRaw: string, body: string): Promise<WhapiSendResponse> {
    const to = this.normPhone(toRaw)

    const { res, data } = await this.fetchJson(
      '/messages/text',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify({ to, body }),
      },
      20000,
    )

    if (!res.ok) {
      const msg = (data as any)?.message || JSON.stringify(data)
      throw new Error(`Whapi sendText failed: ${res.status} ${msg}`)
    }

    return data as WhapiSendResponse
  }

  async sendImage(args: SendMediaArgs): Promise<WhapiSendResponse> {
    const to = this.normPhone(args.toRaw)

    const { res, data } = await this.fetchJson(
      '/messages/image',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify({
          to,
          media: args.mediaUrl,
          caption: args.caption || '',
        }),
      },
      30000,
    )

    if (!res.ok) {
      const msg = (data as any)?.message || JSON.stringify(data)
      throw new Error(`Whapi sendImage failed: ${res.status} ${msg}`)
    }

    return data as WhapiSendResponse
  }

  async sendVideo(args: SendMediaArgs): Promise<WhapiSendResponse> {
    const to = this.normPhone(args.toRaw)

    const { res, data } = await this.fetchJson(
      '/messages/video',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify({
          to,
          media: args.mediaUrl,
          caption: args.caption || '',
        }),
      },
      60000,
    )

    if (!res.ok) {
      const msg = (data as any)?.message || JSON.stringify(data)
      throw new Error(`Whapi sendVideo failed: ${res.status} ${msg}`)
    }

    return data as WhapiSendResponse
  }

  async sendDocument(args: SendMediaArgs): Promise<WhapiSendResponse> {
    const to = this.normPhone(args.toRaw)

    const { res, data } = await this.fetchJson(
      '/messages/document',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify({
          to,
          media: args.mediaUrl,
          caption: args.caption || '',
          filename: args.filename || 'documento.pdf',
        }),
      },
      60000,
    )

    if (!res.ok) {
      const msg = (data as any)?.message || JSON.stringify(data)
      throw new Error(`Whapi sendDocument failed: ${res.status} ${msg}`)
    }

    return data as WhapiSendResponse
  }
}