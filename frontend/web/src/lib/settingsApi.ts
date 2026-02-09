import { api } from '@/lib/api'

export type SMTP = {
  host: string
  port: number
  secure: boolean
  user?: string
  pass?: string
  fromName?: string
  fromEmail?: string
  throttleMs?: number
}

type SettingDTO = { key: string; value: string }

export const settingsApi = {
  async getSetting(token: string, key: string): Promise<string | null> {
    const res = await api.get<{ key: string; value: string } | null>(`/settings/${encodeURIComponent(key)}`, token)
    return res?.value ?? null
  },

  async saveSetting(token: string, key: string, value: string): Promise<SettingDTO> {
    return api.put<SettingDTO>(`/settings/${encodeURIComponent(key)}`, { value }, token)
  },
}
