// src/lib/attachmentApi.ts

const API_URL = String(import.meta.env.VITE_API_URL ?? '')

export type Attachment = {
  id: number
  originalName: string
  filename: string
  mimeType: string
  size: number
  createdAt: string
  url: string // /attachments/:id/download
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function asStringArray(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null
  if (!v.every((x) => typeof x === 'string')) return null
  return v
}

function extractMessage(payload: unknown): string | null {
  if (!isRecord(payload)) return null

  const raw = payload.message
  const arr = asStringArray(raw)
  if (arr) return arr.join(' | ')
  if (typeof raw === 'string') return raw

  const rawError = payload.error
  if (typeof rawError === 'string') return rawError

  return null
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return (await res.json()) as unknown
  } catch {
    return null
  }
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `HTTP ${res.status}`

    const payload = await safeJson(res)
    const extracted = extractMessage(payload)
    if (extracted) msg = extracted

    throw new Error(msg)
  }

  const payload = await safeJson(res)
  if (payload === null) {
    throw new Error('Respuesta inválida: el servidor no devolvió JSON.')
  }

  return payload as T
}

export const attachmentsApi = {
  list: async (token: string) => {
    const res = await fetch(`${API_URL}/attachments`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    return jsonOrThrow<Attachment[]>(res)
  },

  uploadMany: async (token: string, files: File[]) => {
    const fd = new FormData()
    for (const f of files) fd.append('files', f)

    const res = await fetch(`${API_URL}/attachments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    })
    return jsonOrThrow<{ inserted: number }>(res)
  },

  remove: async (token: string, id: number) => {
    const res = await fetch(`${API_URL}/attachments/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    return jsonOrThrow<{ ok: true }>(res)
  },

  downloadUrl: (att: Attachment) => `${API_URL}${att.url}`,
}
