import { Injectable } from '@nestjs/common';

type WhapiSendTextResponse = {
  id?: string; // suele venir un message id
  message?: any;
  [k: string]: any;
};

@Injectable()
export class WhapiService {
  private baseUrl = (process.env.WHAPI_BASE_URL || 'https://gate.whapi.cloud').replace(/\/+$/, '');
  private token = process.env.WHAPI_TOKEN || '';

  private assertConfigured() {
    if (!this.token) throw new Error('WHAPI_TOKEN no configurado');
  }

  private normPhone(raw: string) {
    // muy simple: deja solo dígitos
    const d = String(raw ?? '').replace(/[^\d]/g, '');
    return d;
  }

  async sendText(toRaw: string, body: string): Promise<WhapiSendTextResponse> {
    this.assertConfigured();

    const to = this.normPhone(toRaw);

    const res = await fetch(`${this.baseUrl}/messages/text`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify({ to, body }),
    });

    const data = (await res.json().catch(() => ({}))) as WhapiSendTextResponse;

    if (!res.ok) {
      const msg = (data as any)?.message || JSON.stringify(data);
      throw new Error(`Whapi sendText failed: ${res.status} ${msg}`);
    }

    return data;
  }
}
