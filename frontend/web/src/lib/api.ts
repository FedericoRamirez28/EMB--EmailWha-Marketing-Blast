// src/lib/api.ts
const API_URL = (import.meta.env.VITE_API_URL as string) || 'http://localhost:3001'

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function joinUrl(base: string, path: string) {
  const b = String(base || '').replace(/\/+$/, '')
  const p = String(path || '')
  return `${b}${p.startsWith('/') ? '' : '/'}${p}`
}

async function parseJsonSafe(res: Response): Promise<unknown> {
  const ct = res.headers.get('content-type') || ''
  if (!ct.includes('application/json')) return null
  try {
    return await res.json()
  } catch {
    return null
  }
}

function errorMessageFromPayload(payload: unknown, status: number): string {
  if (!payload || !isObject(payload)) return `HTTP ${status}`

  const msg = payload.message
  if (typeof msg === 'string') return msg
  if (Array.isArray(msg) && msg.every((x) => typeof x === 'string')) return msg.join(' | ')

  const err = payload.error
  if (typeof err === 'string') return err

  return `HTTP ${status}`
}

async function request<T>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
  token?: string | null,
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(joinUrl(API_URL, path), {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  const payload = await parseJsonSafe(res)

  if (!res.ok) {
    throw new Error(errorMessageFromPayload(payload, res.status))
  }

  if (payload === null) return undefined as unknown as T
  return payload as T
}

export const api = {
  get: <T>(path: string, token?: string | null) => request<T>('GET', path, undefined, token),
  post: <T>(path: string, body: unknown, token?: string | null) => request<T>('POST', path, body, token),
  put: <T>(path: string, body: unknown, token?: string | null) => request<T>('PUT', path, body, token),
  patch: <T>(path: string, body: unknown, token?: string | null) => request<T>('PATCH', path, body, token),
  del: <T>(path: string, token?: string | null) => request<T>('DELETE', path, undefined, token),
}