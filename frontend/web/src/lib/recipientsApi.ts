import { api } from './api'

export type Recipient = {
  id: number
  name: string
  email: string
  tags: string
  blockId: number
}

export type BlockCfg = { id: number; name: string; capacity: number }

export const recipientsApi = {
  listRecipients: (token: string) => api.get<Recipient[]>('/recipients', token),
  addRecipients: (token: string, rows: Array<{ name?: string; email: string; tags?: string; blockId?: number }>) =>
    api.post<{ inserted: number }>('/recipients/bulk', { rows }, token),
  removeRecipient: (token: string, id: number) => api.del<{ ok: true }>(`/recipients/${id}`, token),
  bulkRemoveRecipients: (token: string, ids: number[]) => api.post<{ ok: true }>('/recipients/bulk-delete', { ids }, token),
  bulkMoveRecipients: (token: string, ids: number[], destBlockId: number) =>
    api.patch<{ ok: true }>('/recipients/bulk-move', { ids, destBlockId }, token),

  listBlocks: (token: string) => api.get<BlockCfg[]>('/blocks', token),
  upsertBlock: (token: string, block: { id: number; name: string; capacity: number }) =>
    api.put<BlockCfg>('/blocks', block, token),
  removeBlock: (token: string, id: number) => api.del<{ ok: true }>(`/blocks/${id}`, token),
}
