import { config } from './config.js'
import { getQueue, dequeue } from './state.js'
import { sendMessage, listGroups } from './whatsapp.js'
import { createReminder, listReminders, deleteReminder } from './reminders.js'
import { appendAnotacion } from './storage.js'
import { sendReport } from './report.js'
import { getLastNDaysRows } from './storage.js'
import { listCheckins, deleteCheckin, getCheckin } from './checkins.js'
import { isWizardActive, cancelWizard, startCreate, startEdit } from './wizard.js'
import { isPaused, pauseUntil, resume, pauseUntilDate } from './pause.js'

const destination = () => config.groupJid || config.myNumber

function formatReminder(r) {
  const icon = { once: '🔔', daily: '🔁', weekly: '📅' }[r.type] ?? '📌'
  let when = ''
  if (r.type === 'once') {
    when = new Date(r.fireAt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short', timeZone: config.timezone })
  } else if (r.type === 'daily') {
    const [min, hour] = r.cronExpr.split(' ')
    when = `todos los días a las ${hour.padStart(2, '0')}:${min.padStart(2, '0')}`
  } else {
    const [min, hour] = r.cronExpr.split(' ')
    when = `los ${r.dayName} a las ${hour.padStart(2, '0')}:${min.padStart(2, '0')}`
  }
  return `${icon} *[${r.id}]* ${r.text}\n   ↳ ${when}`
}

export async function handleCommand(text, participant) {
  const raw = text.trim()
  const lower = raw.toLowerCase()
  const d = destination()

  // ── /cancelar ────────────────────────────────────────
  if (lower === '/cancelar') {
    if (isWizardActive()) {
      cancelWizard()
      return sendMessage(d, '🚫 Operación cancelada.')
    }
    const queue = getQueue()
    if (queue.length === 0) return sendMessage(d, '❌ No hay check-ins pendientes.')
    const item = dequeue()
    const remaining = getQueue().length
    let msg = `🚫 Check-in cancelado: *${item.taskId}*`
    if (remaining > 0) msg += `\n⏳ Quedan ${remaining} pendiente(s).`
    return sendMessage(d, msg)
  }

  // ── /ayuda ──────────────────────────────────────────
  if (lower === '/ayuda') {
    return sendMessage(d,
      `🤖 *Comandos disponibles:*

🐱 *Check-ins*
/checkins — ver todos los check-ins
/nuevo-checkin — crear uno nuevo (paso a paso)
/editar-checkin [ID] — editar uno existente
/borrar-checkin [ID] — eliminar uno
/estado — ver check-ins pendientes ahora
/cancelar — cancelar el check-in más antiguo pendiente
/grupos — ver grupos disponibles y sus IDs
/pausar Xd — pausar el bot por X días (ej: /pausar 3d)
/pausar off — reactivar el bot antes de tiempo

📝 *Anotaciones*
/anotar [texto] — guarda una nota libre en el Sheet
/reporte — reporte del día (también se envía automático a las 23:00)
/reporte semanal — estadísticas de los últimos 7 días
/reporte mensual — estadísticas de los últimos 30 días

📌 *Recordatorios puntuales*
/recordar en 2hs [texto]
/recordar a las 20:00 [texto]
/recordar todos los días a las 9:00 [texto]
/recordar los martes a las 22hs [texto]
/recordatorios — ver todos
/borrar-tarea [ID] — eliminar uno`)
  }

  // ── /checkins ────────────────────────────────────────
  if (lower === '/checkins') {
    const all = listCheckins()
    if (all.length === 0) return sendMessage(d, '📋 No hay check-ins creados.\n\nUsá /nuevo-checkin para crear uno.')
    const lines = all.map(c => {
      const opts = c.options.map(o => `${o.key}. ${o.label}`).join(' | ')
      return `🐱 *[${c.id}]* ${c.name}\n   ↳ ${c.scheduleText}\n   ↳ ${opts}`
    }).join('\n\n')
    return sendMessage(d, `🐱 *Check-ins activos (${all.length}):*\n\n${lines}`)
  }

  // ── /nuevo-checkin ───────────────────────────────────
  if (lower === '/nuevo-checkin') {
    return startCreate()
  }

  // ── /editar-checkin ──────────────────────────────────
  if (lower.startsWith('/editar-checkin ')) {
    const id = raw.slice('/editar-checkin '.length).trim().toUpperCase()
    return startEdit(id)
  }

  // ── /borrar-checkin ──────────────────────────────────
  if (lower.startsWith('/borrar-checkin ')) {
    const id = raw.slice('/borrar-checkin '.length).trim().toUpperCase()
    const ok = deleteCheckin(id)
    return sendMessage(d, ok
      ? `✅ Check-in *${id}* eliminado.`
      : `❌ No encontré el check-in *${id}*. Usá /checkins para ver los IDs.`)
  }

  // ── /estado ──────────────────────────────────────────
  if (lower === '/estado') {
    let msg = ''
    if (isPaused()) {
      const until = pauseUntilDate()
      const fecha = until.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: config.timezone })
      msg += `⏸️ _Bot pausado hasta el ${fecha}_ (*/pausar off* para reactivar)\n\n`
    }
    const queue = getQueue()
    if (queue.length === 0) return sendMessage(d, msg + '✅ No hay check-ins pendientes.')
    const lines = queue.map(item => {
      const checkin = getCheckin(item.taskId)
      const mins = Math.round((Date.now() - item.sentAt.getTime()) / 60000)
      return `• *${checkin?.name ?? item.taskId}* _(hace ${mins} min)_`
    }).join('\n')
    return sendMessage(d, `${msg}⏳ *Check-ins pendientes (${queue.length}):*\n${lines}\n\n_Tu próxima respuesta va al primero de la lista._`)
  }

  // ── /recordatorios ───────────────────────────────────
  if (lower === '/recordatorios' || lower === '/listar-tareas' || lower === '/listar') {
    const all = listReminders()
    if (all.length === 0) return sendMessage(d, '📋 No hay recordatorios activos.')
    return sendMessage(d, `📋 *Recordatorios activos (${all.length}):*\n\n${all.map(formatReminder).join('\n\n')}`)
  }

  // ── /borrar-tarea ────────────────────────────────────
  if (lower.startsWith('/borrar-tarea ')) {
    const id = raw.slice('/borrar-tarea '.length).trim().toUpperCase()
    const ok = deleteReminder(id)
    return sendMessage(d, ok
      ? `✅ Recordatorio *${id}* eliminado.`
      : `❌ No encontré el recordatorio *${id}*.`)
  }

  // ── /recordar ────────────────────────────────────────
  if (lower.startsWith('/recordar ')) {
    const args = raw.slice('/recordar '.length).trim()
    const result = createReminder({ raw: args, createdBy: participant })
    if (!result) return sendMessage(d,
      `❌ No entendí el formato. Ejemplos:\n/recordar en 2hs llamar al vet\n/recordar a las 20:00 darle la medicina\n/recordar todos los días a las 9:00 tomar pastillas\n/recordar los martes a las 22hs llamar a mamá`)
    if (result.error) return sendMessage(d, `❌ ${result.error}`)
    let msg = ''
    if (result.type === 'once') {
      const hora = new Date(result.fireAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: config.timezone })
      msg = `🔔 Recordatorio para las *${hora}*: "${result.text}"`
    } else if (result.type === 'daily') {
      msg = `🔁 Recordatorio diario: "${result.text}"`
    } else {
      msg = `📅 Recordatorio semanal (${result.dayName}): "${result.text}"`
    }
    return sendMessage(d, `${msg}\nID: *${result.id}*`)
  }

  // ── /pausar ──────────────────────────────────────────
  if (lower === '/pausar off' || lower === '/reanudar') {
    if (!isPaused()) return sendMessage(d, '▶️ El bot no está pausado.')
    resume()
    return sendMessage(d, '▶️ Bot reactivado. Los check-ins vuelven a funcionar.')
  }

  if (lower === '/pausar') {
    if (isPaused()) {
      const until = pauseUntilDate()
      const fecha = until.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', timeZone: config.timezone })
      return sendMessage(d, `⏸️ El bot ya está pausado hasta el ${fecha}.\n\nUsá */pausar off* para reactivarlo antes.`)
    }
    return sendMessage(d, `❌ Indicá cuánto tiempo: /pausar 1d, /pausar 3d, etc.`)
  }

  if (lower.startsWith('/pausar ')) {
    const arg = raw.slice('/pausar '.length).trim().toLowerCase()
    const match = arg.match(/^(\d+)d$/)
    if (!match) return sendMessage(d, `❌ Formato inválido. Usá /pausar 1d, /pausar 3d, etc.\nPara desactivar: /pausar off`)
    const days = parseInt(match[1], 10)
    if (days < 1 || days > 365) return sendMessage(d, '❌ El valor debe ser entre 1 y 365 días.')
    const until = new Date(Date.now() + days * 86400000)
    pauseUntil(until)
    const fecha = until.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: config.timezone })
    return sendMessage(d, `⏸️ Bot pausado por ${days} día${days > 1 ? 's' : ''} (hasta el ${fecha}).\n\nUsá */pausar off* para reactivar antes.`)
  }

  // ── /grupos ──────────────────────────────────────────
  if (lower === '/grupos') {
    const groups = await listGroups()
    if (groups.length === 0) return sendMessage(d, '📋 No estás en ningún grupo.')
    const lines = groups.map(g => `*${g.name}*\n\`${g.jid}\``).join('\n\n')
    return sendMessage(d, `📋 *Grupos disponibles:*\n\n${lines}\n\n_Copiá el JID que querés en GROUP_JID del .env_`)
  }

  // ── /reporte ─────────────────────────────────────────
  if (lower === '/reporte') {
    await sendReport()
    return
  }

  if (lower === '/reporte semanal' || lower === '/reporte mensual') {
    const days = lower.includes('mensual') ? 30 : 7
    const label = days === 7 ? 'últimos 7 días' : 'últimos 30 días'
    const rows = await getLastNDaysRows(days).catch(() => [])
    const checkins = listCheckins()

    const resolveOutcome = (estado) => {
      for (const c of checkins) {
        const opt = c.options.find(o => o.label === estado)
        if (opt?.outcome) return opt.outcome
      }
      const l = estado?.toLowerCase() ?? ''
      if (['no aplica', 'no hizo falta', 'n/a'].some(p => l.includes(p))) return 'na'
      if (l.startsWith('no')) return 'missed'
      return 'done'
    }

    if (rows.length === 0) return sendMessage(d, `📊 Sin registros en los ${label}.`)

    const byCheckin = {}
    for (const row of rows) {
      const outcome = resolveOutcome(row.estado)
      if (!byCheckin[row.tarea]) byCheckin[row.tarea] = { done: 0, missed: 0, na: 0 }
      byCheckin[row.tarea][outcome]++
    }

    let msg = `📊 *Estadísticas — ${label}*\n\n`
    for (const [name, s] of Object.entries(byCheckin)) {
      const countable = s.done + s.missed
      const pct = countable > 0 ? Math.round((s.done / countable) * 100) : null
      const bar = pct !== null ? `${pct}%` : '—'
      const parts = []
      if (s.done) parts.push(`${s.done} ✅`)
      if (s.missed) parts.push(`${s.missed} ❌`)
      if (s.na) parts.push(`${s.na} ➖`)
      msg += `*${name}*\n   ${bar} · ${parts.join('  ')}\n\n`
    }
    return sendMessage(d, msg.trim())
  }

  // ── /anotar ──────────────────────────────────────────
  if (lower === '/anotar' || lower.startsWith('/anotar ')) {
    const texto = raw.slice('/anotar'.length).trim()
    if (!texto) return sendMessage(d, '❌ Escribí algo después de /anotar. Ejemplo: /anotar le di el medicamento')
    const now = new Date()
    const quien = participant ? participant.split('@')[0] : ''
    await appendAnotacion({
      timestamp: now.toISOString(),
      dia: now.toLocaleDateString('sv-SE', { timeZone: config.timezone }),
      quien,
      nota: texto,
    })
    return sendMessage(d, `📝 Anotado!`)
  }

  return sendMessage(d, `❓ Comando no reconocido. Escribí */ayuda* para ver las opciones.`)
}
