import cron from 'node-cron'
import { config } from './config.js'
import { getQueue, enqueue, dequeue, resetDay, markReminderSent } from './state.js'
import { sendMessage } from './whatsapp.js'
import { appendRow } from './storage.js'
import { handleCommand } from './commands.js'
import { isWizardActive, handleWizardInput } from './wizard.js'
import { getCheckin } from './checkins.js'
import { sendReport } from './report.js'
import { isPaused } from './pause.js'

function extractNumber(jid) {
  return jid ? jid.split('@')[0] : 'desconocido'
}

const destination = () => config.groupJid || config.myNumber

function parseResponse(text, checkin) {
  if (!checkin) return null
  const t = text.trim()
  for (const option of checkin.options) {
    if (t.startsWith(option.key)) {
      return { optionKey: option.key, optionLabel: option.label, nota: t.slice(option.key.length).trim() }
    }
  }
  return null
}

export function handleIncomingMessage({ text, from, participant }) {
  const t = text.trim()

  // Comandos
  if (t.startsWith('/')) {
    handleCommand(text, participant).catch(console.error)
    return
  }

  // Wizard toma prioridad sobre todo lo demás
  if (isWizardActive()) {
    handleWizardInput(text).catch(console.error)
    return
  }

  const isGroup = from?.endsWith('@g.us')
  if (isGroup) {
    if (from !== config.groupJid) return
  } else {
    if (from !== `${config.myNumber}@s.whatsapp.net`) return
  }

  const queue = getQueue()
  if (queue.length === 0) return

  // Buscar la primera opción válida en la cola
  const item = queue[0]
  const checkin = getCheckin(item.taskId)
  const parsed = parseResponse(t, checkin)
  if (!parsed) return

  dequeue()
  const respondio = isGroup ? extractNumber(participant) : config.myNumber
  const minutesTaken = Math.round((Date.now() - item.sentAt.getTime()) / 60000)
  const now = new Date()

  appendRow({
    timestamp: now.toISOString(),
    dia: now.toISOString().split('T')[0],
    tarea: checkin?.name ?? item.taskId,
    estado: parsed.optionLabel,
    respondidoEnMin: minutesTaken,
    respondio,
    nota: parsed.nota,
  }).catch(err => console.error('[sheets] Error guardando:', err.message))

  let msg = `✅ *${checkin?.name ?? item.taskId}* — ${parsed.optionLabel}`

  const remaining = getQueue()
  if (remaining.length > 0) {
    const names = remaining.map(i => {
      const c = getCheckin(i.taskId)
      return `• ${c?.name ?? i.taskId}`
    }).join('\n')
    msg += `\n\n⏳ Todavía pendiente:\n${names}`
  }

  sendMessage(destination(), msg).catch(console.error)
}

export function setupSchedules() {
  const tz = config.timezone

  cron.schedule('0 0 * * *', () => resetDay(), { timezone: tz })

  cron.schedule('* * * * *', async () => {
    if (isPaused()) return
    const now = Date.now()
    for (const item of getQueue()) {
      if (item.reminderSent) continue
      const mins = (now - item.sentAt.getTime()) / 60000
      if (mins < config.reminderMinutes) continue
      markReminderSent(item.taskId)
      const checkin = getCheckin(item.taskId)
      await sendMessage(destination(),
        `⏰ Sin respuesta hace más de ${config.reminderMinutes} min:\n\n${checkin?.description ?? item.taskId}`
      ).catch(console.error)
    }
  }, { timezone: tz })

  cron.schedule('0 23 * * *', () => sendReport().catch(console.error), { timezone: tz })

  console.log(`[scheduler] Reset diario, recordatorios y reporte 23:00 activos (${tz})`)
}
