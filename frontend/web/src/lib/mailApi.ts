import { api } from '@/lib/api'
import type { SMTP } from '@/lib/settingsApi'

export type SendRecipient = { name?: string; email: string }
export type SendAttachment = { id: number } // usamos IDs del backend /attachments

export type TestSmtpPayload = { smtp: SMTP }
export type SendBulkPayload = {
  smtp: SMTP
  selected: SendRecipient[]
  subject: string
  html: string
  attachmentIds: number[]
  throttleMs: number
}

export type JobProgress = {
  jobId: string
  sent: number
  total: number
  to: string
  done: boolean
  error?: string | null
}

export const mailApi = {
  testSmtp(token: string, smtp: SMTP) {
    return api.post<{ ok: true }>(`/mail/test-smtp`, { smtp } satisfies TestSmtpPayload, token)
  },

  startSendBulk(token: string, payload: SendBulkPayload) {
    return api.post<{ jobId: string }>(`/mail/send-bulk`, payload, token)
  },

  getJob(token: string, jobId: string) {
    return api.get<JobProgress>(`/mail/jobs/${encodeURIComponent(jobId)}`, token)
  },

  clearJob(token: string, jobId: string) {
    return api.del<{ ok: true }>(`/mail/jobs/${encodeURIComponent(jobId)}`, token)
  },
}
