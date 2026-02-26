import { api } from './api'

export type WaRecipient = {
  id: number
  name: string
  phone: string | null
  tags: string
  blockId: number
}

export type BlockCfg = { id: number; name: string; capacity: number }

type ApiOk<T> = { ok: true; data: T }

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function unwrapArray<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[]
  if (isRecord(v) && Array.isArray(v.data)) return v.data as T[]
  return []
}

export const waRecipientsApi = {
  // ✅ Blocks WhatsApp
  listBlocks: async (token: string) => {
    const r = await api.get<ApiOk<BlockCfg[]> | BlockCfg[]>('/blocks', token)
    return unwrapArray<BlockCfg>(r)
  },

  upsertBlock: (token: string, block: BlockCfg) => api.post('/blocks/upsert', block, token),

  removeBlock: (token: string, id: number) => api.del(`/blocks/${id}`, token),

  // ✅ Recipients WhatsApp
  listWaRecipients: async (token: string, params?: { blockId?: number; q?: string }) => {
    const qs = new URLSearchParams()
    if (typeof params?.blockId === 'number') qs.set('blockId', String(params.blockId))
    if (params?.q) qs.set('q', params.q)
    const s = qs.toString()
    const url = `/whapi/recipients${s ? `?${s}` : ''}`

    const r = await api.get<ApiOk<WaRecipient[]> | WaRecipient[]>(url, token)
    return unwrapArray<WaRecipient>(r)
  },

  // ✅ Import por bloque (capacidad)
  importPhones: (
    token: string,
    input: { blockId: number; tags?: string; rows: Array<{ phone: string; name?: string }> },
  ) => api.post<{ ok: true; inserted: number; updated: number; skipped: number }>(
    '/whapi/recipients/import-phones',
    input,
    token,
  ),

  removeWaRecipient: (token: string, id: number) => api.del(`/whapi/recipients/${id}`, token),

  bulkRemoveWaRecipients: (token: string, ids: number[]) => api.post('/whapi/recipients/bulk-delete', { ids }, token),

  bulkMoveWaRecipients: (token: string, ids: number[], destBlockId: number) =>
    api.patch('/whapi/recipients/bulk-move', { ids, destBlockId }, token),
}