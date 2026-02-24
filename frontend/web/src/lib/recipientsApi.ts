// src/lib/recipientsApi.ts
import { api } from './api'

export type Recipient = {
  id: number
  name: string
  email: string
  tags: string
  blockId: number
}

export type BlockCfg = { id: number; name: string; capacity: number }

// Recipients (Email) - queda igual
export const recipientsApi = {
  listRecipients: (token: string) => api.get<Recipient[]>('/recipients', token),
  addRecipients: (token: string, rows: Array<{ name?: string; email: string; tags?: string; blockId?: number }>) =>
    api.post<{ inserted: number }>('/recipients/bulk', { rows }, token),
  removeRecipient: (token: string, id: number) => api.del<{ ok: true }>(`/recipients/${id}`, token),
  bulkRemoveRecipients: (token: string, ids: number[]) => api.post<{ ok: true }>('/recipients/bulk-delete', { ids }, token),
  bulkMoveRecipients: (token: string, ids: number[], destBlockId: number) =>
    api.patch<{ ok: true }>('/recipients/bulk-move', { ids, destBlockId }, token),

  // ✅ Blocks WhatsApp (nuevo contrato)
  listBlocksWhatsapp: (token: string) => api.get<BlockCfg[]>('/blocks', token),
  upsertBlockWhatsapp: (token: string, block: BlockCfg) => api.post<BlockCfg>('/blocks/upsert', block, token),
  removeBlockWhatsapp: (token: string, id: number) => api.del<{ ok: true }>(`/blocks/${id}`, token),

  // ✅ Blocks Email (nuevo contrato)
  listBlocksEmail: (token: string) => api.get<BlockCfg[]>('/email/blocks', token),
  upsertBlockEmail: (token: string, block: BlockCfg) => api.post<BlockCfg>('/email/blocks/upsert', block, token),
  removeBlockEmail: (token: string, id: number) => api.del<{ ok: true }>(`/email/blocks/${id}`, token),
}