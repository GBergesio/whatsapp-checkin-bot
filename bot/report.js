import { getTodayRows, getTodayAnotaciones } from './storage.js'
import { getQueue } from './state.js'
import { listCheckins, getCheckin } from './checkins.js'
import { sendMessage } from './whatsapp.js'
import { config } from './config.js'

const destination = () => config.groupJid || config.myNumber

function resolveOutcome(estado) {
  // Busca el outcome en todos los check-ins por label
  for (const checkin of listCheckins()) {
    const option = checkin.options.find(o => o.label === estado)
    if (option?.outcome) return option.outcome
  }
  // Fallback por texto
  const lower = estado?.toLowerCase() ?? ''
  if (['no aplica', 'no hizo falta', 'n/a', 'na'].some(p => lower.includes(p))) return 'na'
  if (lower.startsWith('no') || lower.startsWith('false')) return 'missed'
  return 'done'
}

const ICONS = { done: '✅', missed: '❌', na: '➖' }

export async function sendReport() {
  const [rows, queue, anotaciones] = await Promise.all([getTodayRows(), Promise.resolve(getQueue()), getTodayAnotaciones()])

  const today = new Date().toLocaleDateString('es-AR', {
    timeZone: config.timezone,
    day: '2-digit', month: '2-digit', year: 'numeric',
  })

  let msg = `📊 *Reporte del ${today}*\n`

  if (rows.length === 0 && queue.length === 0) {
    msg += '\n_Sin actividad registrada hoy._'
    return sendMessage(destination(), msg)
  }

  msg += '\n'

  for (const row of rows) {
    const outcome = resolveOutcome(row.estado)
    const icon = ICONS[outcome]
    msg += `${icon} *${row.tarea}*\n`
    msg += `    ${row.estado}`
    if (row.respondidoEnMin) msg += `  ·  ${row.respondidoEnMin} min`
    msg += '\n'
    if (row.nota) msg += `    📝 _${row.nota}_\n`
    msg += '\n'
  }

  if (queue.length > 0) {
    for (const item of queue) {
      const checkin = getCheckin(item.taskId)
      msg += `⏳ *${checkin?.name ?? item.taskId}*\n    Sin respuesta\n\n`
    }
  }

  const countable = rows.filter(r => resolveOutcome(r.estado) !== 'na')
  const done = countable.filter(r => resolveOutcome(r.estado) === 'done').length
  const missed = countable.filter(r => resolveOutcome(r.estado) === 'missed').length
  const na = rows.length - countable.length
  const pending = queue.length

  const parts = []
  if (done > 0) parts.push(`${done} completado(s) ✅`)
  if (missed > 0) parts.push(`${missed} sin hacer ❌`)
  if (na > 0) parts.push(`${na} no aplicó ➖`)
  if (pending > 0) parts.push(`${pending} pendiente(s) ⏳`)

  const allGood = missed === 0 && pending === 0
  msg += `${allGood ? '✅' : '⚠️'} _${parts.join('  ·  ')}_`

  if (anotaciones.length > 0) {
    msg += `\n\n📝 *Anotaciones del día*\n`
    for (const a of anotaciones) {
      const hora = new Date(a.timestamp).toLocaleTimeString('es-AR', {
        hour: '2-digit', minute: '2-digit', timeZone: config.timezone,
      })
      msg += `\n    ${hora} — ${a.nota}`
    }
  }

  return sendMessage(destination(), msg)
}
