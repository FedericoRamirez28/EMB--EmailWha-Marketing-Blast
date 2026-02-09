import { BadRequestException, Injectable } from '@nestjs/common'
import { PrismaService } from '@/prisma/prisma.service'
import nodemailer from 'nodemailer'
import path from 'node:path'

type SMTP = {
  host: string
  port: number
  secure: boolean
  user?: string
  pass?: string
  fromName?: string
  fromEmail?: string
  throttleMs?: number
}

type SendRecipient = { name?: string; email: string }

type SendBulkBody = {
  smtp: SMTP
  selected: SendRecipient[]
  subject: string
  html: string
  attachmentIds?: number[]
  throttleMs?: number
}

type Job = {
  jobId: string
  sent: number
  total: number
  to: string
  done: boolean
  error?: string | null
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function renderTemplate(html: string, r: SendRecipient) {
  const name = (r.name ?? '').trim() || 'Hola'
  const email = (r.email ?? '').trim()
  return html.replaceAll('{{nombre}}', name).replaceAll('{{email}}', email)
}

function mkId() {
  return `${Date.now().toString(16)}_${Math.random().toString(16).slice(2)}`
}

@Injectable()
export class MailService {
  constructor(private prisma: PrismaService) {}

  private jobs = new Map<string, Job>()

  async testSmtp(body: { smtp?: SMTP }) {
    const smtp = body?.smtp
    if (!smtp?.host || !smtp?.port) throw new BadRequestException('smtp inválido')

    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: Number(smtp.port),
      secure: !!smtp.secure,
      auth: smtp.user ? { user: smtp.user, pass: smtp.pass ?? '' } : undefined,
    })

    await transporter.verify()
    return { ok: true }
  }

  startSendBulk(body: SendBulkBody) {
    const smtp = body?.smtp
    const selected = Array.isArray(body?.selected) ? body.selected : []
    const subject = String(body?.subject ?? '').trim()
    const html = String(body?.html ?? '').trim()

    if (!smtp?.host || !smtp?.port) throw new BadRequestException('smtp inválido')
    if (!selected.length) throw new BadRequestException('selected vacío')
    if (!subject) throw new BadRequestException('subject vacío')
    if (!html) throw new BadRequestException('html vacío')

    const throttleMs = Number.isFinite(Number(body?.throttleMs)) ? Number(body.throttleMs) : 1500
    const attachmentIds = (body?.attachmentIds ?? []).map(Number).filter((n) => Number.isInteger(n) && n > 0)

    const jobId = mkId()
    const job: Job = { jobId, sent: 0, total: selected.length, to: '', done: false, error: null }
    this.jobs.set(jobId, job)

    // fire-and-forget
    void this.runJob(jobId, { smtp, selected, subject, html, attachmentIds, throttleMs })

    return { jobId }
  }

  getJob(jobId: string) {
    const job = this.jobs.get(jobId)
    if (!job) throw new BadRequestException('jobId inválido')
    return job
  }

  private async runJob(
    jobId: string,
    payload: {
      smtp: SMTP
      selected: SendRecipient[]
      subject: string
      html: string
      attachmentIds: number[]
      throttleMs: number
    },
  ) {
    const job = this.jobs.get(jobId)
    if (!job) return

    try {
      const transporter = nodemailer.createTransport({
        host: payload.smtp.host,
        port: Number(payload.smtp.port),
        secure: !!payload.smtp.secure,
        auth: payload.smtp.user ? { user: payload.smtp.user, pass: payload.smtp.pass ?? '' } : undefined,
      })

      // adjuntos: resolvemos desde DB
      const atts =
        payload.attachmentIds.length > 0
          ? await this.prisma.attachment.findMany({
              where: { id: { in: payload.attachmentIds } },
            })
          : []

      const nodemailerAtts = atts.map((a: any) => {
        // soporta modelos distintos: filepath o storedName
        const fp = String(a.filepath ?? a.storedPath ?? a.path ?? '')
        const full = path.isAbsolute(fp) ? fp : path.join(process.cwd(), fp)
        return {
          filename: String(a.originalName ?? path.basename(full)),
          path: full,
        }
      })

      // from
      const fromEmail = (payload.smtp.fromEmail ?? payload.smtp.user ?? '').trim()
      const fromName = (payload.smtp.fromName ?? '').trim()
      const from = fromName && fromEmail ? `"${fromName.replaceAll('"', '')}" <${fromEmail}>` : fromEmail || undefined

      for (const r of payload.selected) {
        job.to = r.email
        const rendered = renderTemplate(payload.html, r)

        await transporter.sendMail({
          from,
          to: r.email,
          subject: payload.subject,
          html: rendered,
          attachments: nodemailerAtts,
        })

        job.sent += 1
        await sleep(Math.max(0, payload.throttleMs))
      }

      job.done = true
      job.to = ''
      job.error = null
    } catch (e: any) {
      job.done = true
      job.error = e?.message ? String(e.message) : String(e)
    }
  }
}
