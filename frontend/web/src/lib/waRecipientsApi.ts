// src/lib/waRecipientsApi.ts
import { recipientsApi, type BlockCfg, type Recipient } from '@/lib/recipientsApi'

export type WaRecipient = {
  id: number
  name?: string
  phone: string
  tags?: string
  blockId: number
}

const WA_DOMAIN = '@wa.local'

function isWaEmail(email: string): boolean {
  return typeof email === 'string' && email.toLowerCase().endsWith(WA_DOMAIN)
}

function phoneFromWaEmail(email: string): string {
  const idx = email.toLowerCase().lastIndexOf(WA_DOMAIN)
  if (idx <= 0) return ''
  return email.slice(0, idx)
}

function toWaEmail(phone: string): string {
  return `${phone}${WA_DOMAIN}`
}

export type AddWaRow = { phone: string; name?: string; tags?: string; blockId?: number }

export const waRecipientsApi = {
  // ✅ Bloques WA separados (nuevo backend)
  listBlocks: (token: string): Promise<BlockCfg[]> => recipientsApi.listBlocksWhatsapp(token),
  upsertBlock: (token: string, b: BlockCfg): Promise<BlockCfg> => recipientsApi.upsertBlockWhatsapp(token, b),
  removeBlock: (token: string, id: number): Promise<{ ok: true }> => recipientsApi.removeBlockWhatsapp(token, id),

  async listWaRecipients(token: string): Promise<WaRecipient[]> {
    const all: Recipient[] = await recipientsApi.listRecipients(token)
    const wa = all
      .filter((r) => isWaEmail(r.email))
      .map((r) => ({
        id: r.id,
        name: r.name ?? undefined,
        phone: phoneFromWaEmail(r.email),
        tags: r.tags ?? undefined,
        blockId: r.blockId ?? 0,
      }))
      .filter((r) => !!r.phone)

    return wa
  },

  async addWaRecipients(token: string, rows: AddWaRow[]): Promise<void> {
    const payload = rows
      .map((r) => ({
        name: r.name,
        email: toWaEmail(r.phone),
        tags: r.tags,
        blockId: r.blockId ?? 0,
      }))
      .filter((r) => typeof r.email === 'string' && r.email.length > WA_DOMAIN.length)

    await recipientsApi.addRecipients(token, payload)
  },

  removeWaRecipient: (token: string, id: number): Promise<{ ok: true }> => recipientsApi.removeRecipient(token, id),
  bulkRemoveWaRecipients: (token: string, ids: number[]): Promise<{ ok: true }> => recipientsApi.bulkRemoveRecipients(token, ids),
  bulkMoveWaRecipients: (token: string, ids: number[], destBlockId: number): Promise<{ ok: true }> =>
    recipientsApi.bulkMoveRecipients(token, ids, destBlockId),
}