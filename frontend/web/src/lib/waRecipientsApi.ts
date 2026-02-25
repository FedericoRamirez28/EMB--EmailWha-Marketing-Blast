// src/lib/waRecipientsApi.ts
import { api } from './api'

export type BlockCfg = { id: number; name: string; capacity: number }

export type WaRecipient = {
  id: number
  name?: string
  phone: string
  tags?: string
  blockId: number
}

export type AddWaRow = { phone: string; name?: string; tags?: string; blockId?: number }

export const waRecipientsApi = {
  // Bloques WA (si usás /blocks para whatsapp)
  listBlocks: (token: string) => api.get<BlockCfg[]>('/blocks', token),
  upsertBlock: (token: string, b: BlockCfg) => api.post<BlockCfg>('/blocks/upsert', b, token),
  removeBlock: (token: string, id: number) => api.del<{ ok: true }>(`/blocks/${id}`, token),

  // Recipients WA
  listWaRecipients: (token: string) => api.get<WaRecipient[]>('/whatsapp/recipients', token),

  addWaRecipients: (token: string, recipients: AddWaRow[]) =>
    api.post<{ ok: true; created: number }>('/whatsapp/recipients/create-many', { recipients }, token),

  removeWaRecipient: (token: string, id: number) => api.del<{ ok: true }>(`/whatsapp/recipients/${id}`, token),

  bulkRemoveWaRecipients: (token: string, ids: number[]) =>
    api.post<{ ok: true }>('/whatsapp/recipients/bulk-remove', { ids }, token),

  bulkMoveWaRecipients: (token: string, ids: number[], blockId: number) =>
    api.post<{ ok: true }>('/whatsapp/recipients/bulk-move', { ids, blockId }, token),
}