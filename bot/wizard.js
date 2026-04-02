import { config } from './config.js'
import { sendMessage } from './whatsapp.js'
import { addCheckin, updateCheckin, getCheckin } from './checkins.js'

let state = null

const DAYS_MAP = {
  domingo: 0, lunes: 1, martes: 2,
  'miércoles': 3, miercoles: 3,
  jueves: 4, viernes: 5,
  'sábado': 6, sabado: 6,
}

function norm(s) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function parseTime(text) {
  const t = text.trim().toLowerCase()
  const ampm = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/)
  if (ampm) {
    let h = parseInt(ampm[1])
    const m = parseInt(ampm[2] ?? '0')
    if (ampm[3] === 'pm' && h < 12) h += 12
    if (ampm[3] === 'am' && h === 12) h = 0
    return { hour: h, minute: m }
  }
  const hhmm = t.match(/^(\d{1,2}):(\d{2})$/)
  if (hhmm) return { hour: parseInt(hhmm[1]), minute: parseInt(hhmm[2]) }
  const only = t.match(/^(\d{1,2})$/)
  if (only) {
    const n = parseInt(only[1])
    if (n >= 0 && n <= 23) return { hour: n, minute: 0 }
  }
  return null
}

function parseDays(text) {
  const t = norm(text)
  if (['todos los dias', 'diario', 'todos', 'cada dia'].some(p => t.includes(p)))
    return { cron: '*', label: 'todos los días' }
  if (['fines de semana', 'fin de semana', 'sabado y domingo'].some(p => t.includes(p)))
    return { cron: '0,6', label: 'sábados y domingos' }
  if (['lunes a viernes', 'lunes-viernes', 'dias de semana', 'dias habiles'].some(p => t.includes(p)))
    return { cron: '1-5', label: 'lunes a viernes' }

  const found = []
  for (const [name, num] of Object.entries(DAYS_MAP)) {
    if (t.includes(norm(name)) && !found.find(f => f.num === num))
      found.push({ num, name })
  }
  if (found.length > 0) {
    found.sort((a, b) => a.num - b.num)
    return { cron: found.map(f => f.num).join(','), label: found.map(f => f.name).join(' y ') }
  }
  return null
}

function parseOptions(text) {
  if (norm(text.trim()) === 'default')
    return [
      { key: '1', label: 'Sí ✅', outcome: 'done' },
      { key: '2', label: 'No ❌', outcome: 'missed' },
    ]
  const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean)
  const options = []
  for (const line of lines) {
    const isNa = line.endsWith('~')
    const clean = isNa ? line.slice(0, -1).trim() : line
    const m = clean.match(/^(\w+)[.\s):-]\s*(.+)$/)
    if (m) {
      const label = m[2].trim()
      const outcome = isNa ? 'na' : (norm(label).startsWith('no') ? 'missed' : 'done')
      options.push({ key: m[1], label, outcome })
    }
  }
  return options.length >= 1 ? options : null
}

function timeStr(h, m) {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function formatSummary(data) {
  const opts = data.options.map(o => `${o.key}. ${o.label}`).join(' | ')
  return `📋 *Resumen:*\n` +
    `• Nombre: ${data.name}\n` +
    `• Horario: ${data.scheduleText}\n` +
    `• Pregunta: ${data.description}\n` +
    `• Opciones: ${opts}\n\n` +
    `Confirmar? Respondé *sí* para guardar o *no* para cancelar.`
}

const dest = () => config.groupJid || config.myNumber

export const isWizardActive = () => state !== null
export const cancelWizard = () => { state = null }

export async function startCreate() {
  state = { mode: 'create', step: 'name', data: {} }
  return sendMessage(dest(),
    `📝 *Nuevo check-in — Paso 1/5*\n\nCómo se llama?\n_(ej: Medicina, Ejercicio, Vitaminas)_\n\n_Escribí /cancelar para abortar en cualquier momento._`
  )
}

export async function startEdit(id) {
  const checkin = getCheckin(id)
  if (!checkin) return sendMessage(dest(), `❌ No encontré el check-in *${id}*.`)
  state = { mode: 'edit', editId: id, step: 'field', data: { ...checkin } }
  const opts = checkin.options.map(o => `${o.key}. ${o.label}`).join(' | ')
  return sendMessage(dest(),
    `✏️ *Editando: ${checkin.name}*\n\n` +
    `Qué querés editar?\n\n` +
    `1️⃣ Nombre — _${checkin.name}_\n` +
    `2️⃣ Horario — _${checkin.scheduleText}_\n` +
    `3️⃣ Pregunta — _${checkin.description}_\n` +
    `4️⃣ Opciones — _${opts}_\n\n` +
    `_/cancelar para abortar_`
  )
}

export async function handleWizardInput(text) {
  if (!state) return
  if (state.mode === 'create') return handleCreate(text)
  if (state.mode === 'edit') return handleEdit(text)
}

async function handleCreate(text) {
  const t = text.trim()
  const d = dest()

  switch (state.step) {
    case 'name': {
      if (t.length < 2) return sendMessage(d, '❌ Nombre muy corto.')
      state.data.name = t
      state.step = 'time'
      return sendMessage(d, `✅ Nombre: *${t}*\n\n📝 *Paso 2/5* — A qué hora?\n_(ej: 8:00, 20:30, 8 pm, 8 am)_`)
    }
    case 'time': {
      const parsed = parseTime(t)
      if (!parsed) return sendMessage(d, '❌ No entendí la hora. Usá: 8:00, 20:30, 8 am, 8 pm')
      state.data.hour = parsed.hour
      state.data.minute = parsed.minute
      state.data.timeStr = timeStr(parsed.hour, parsed.minute)
      state.step = 'days'
      return sendMessage(d,
        `✅ Hora: *${state.data.timeStr}*\n\n📝 *Paso 3/5* — Qué días?\n\n` +
        `_Ejemplos:_\n• todos los días\n• lunes y jueves\n• de lunes a viernes\n• fines de semana\n• solo los martes`
      )
    }
    case 'days': {
      const parsed = parseDays(t)
      if (!parsed) return sendMessage(d, '❌ No entendí los días. Ejemplos: "todos los días", "lunes y jueves", "solo los martes"')
      state.data.cronExpr = `${state.data.minute} ${state.data.hour} * * ${parsed.cron}`
      state.data.scheduleText = `${parsed.label} a las ${state.data.timeStr}`
      state.step = 'description'
      return sendMessage(d, `✅ Días: *${parsed.label}*\n\n📝 *Paso 4/5* — Cuál es la pregunta que debe hacer el bot?`)
    }
    case 'description': {
      if (t.length < 3) return sendMessage(d, '❌ La pregunta parece muy corta.')
      state.data.description = t
      state.step = 'options'
      return sendMessage(d,
        `✅ Pregunta guardada.\n\n📝 *Paso 5/5* — Opciones de respuesta.\n\n` +
        `Mandá una por línea:\n_1 Sí_\n_2 No_\n_3 No hizo falta ~_\n\n` +
        `Agregá *~* al final para opciones que no cuentan como completado ni fallido.\n\n` +
        `O escribí *default* para Sí ✅ / No ❌`
      )
    }
    case 'options': {
      const options = parseOptions(t)
      if (!options) return sendMessage(d, '❌ No pude parsear las opciones. Mandá una por línea (ej: "1 Sí") o escribí "default".')
      state.data.options = options
      state.step = 'confirm'
      return sendMessage(d, formatSummary(state.data))
    }
    case 'confirm': {
      const n = norm(t)
      if (['si', 'yes', 'dale', 'ok', 'confirmar'].some(p => n.includes(p))) {
        const { name, cronExpr, scheduleText, description, options } = state.data
        const checkin = addCheckin({ name, cronExpr, scheduleText, description, options })
        state = null
        return sendMessage(d, `✅ Check-in *${checkin.name}* creado! ID: *${checkin.id}*\nEmpezará según el horario configurado.`)
      }
      if (['no', 'cancelar'].some(p => n.includes(p))) {
        state = null
        return sendMessage(d, '🚫 Creación cancelada.')
      }
      return sendMessage(d, 'Respondé *sí* para confirmar o *no* para cancelar.')
    }
  }
}

async function handleEdit(text) {
  const t = text.trim()
  const d = dest()

  if (state.step === 'field') {
    const steps = { '1': 'edit_name', '2': 'edit_schedule', '3': 'edit_description', '4': 'edit_options' }
    const next = steps[t]
    if (!next) return sendMessage(d, '❌ Ingresá 1, 2, 3 o 4.')
    state.step = next
    const prompts = {
      edit_name:        `Nuevo nombre:\n_(actual: ${state.data.name})_`,
      edit_schedule:    `Nuevo horario — hora y días en una línea:\n_(ej: "8:00 todos los días" o "20:30 lunes y jueves")_\n_(actual: ${state.data.scheduleText})_`,
      edit_description: `Nueva pregunta:\n_(actual: ${state.data.description})_`,
      edit_options:     `Nuevas opciones (una por línea) o *default*.\nAgregá *~* al final para neutrales:\n_(actual: ${state.data.options.map(o => `${o.key}. ${o.label}${o.outcome === 'na' ? ' ~' : ''}`).join(' | ')})_`,
    }
    return sendMessage(d, prompts[state.step])
  }

  if (state.step === 'edit_name') {
    if (t.length < 2) return sendMessage(d, '❌ Nombre muy corto.')
    state.data.name = t
    state.step = 'confirm'
    return sendMessage(d, formatSummary(state.data))
  }

  if (state.step === 'edit_schedule') {
    const m = t.match(/^([\d:]+(?:\s*[ap]m)?)\s+(.+)$/i)
    if (!m) return sendMessage(d, '❌ Formato: "hora días" — ej: "8:00 todos los días"')
    const pt = parseTime(m[1].trim())
    const pd = parseDays(m[2].trim())
    if (!pt) return sendMessage(d, '❌ No entendí la hora.')
    if (!pd) return sendMessage(d, '❌ No entendí los días.')
    const ts = timeStr(pt.hour, pt.minute)
    state.data.cronExpr = `${pt.minute} ${pt.hour} * * ${pd.cron}`
    state.data.scheduleText = `${pd.label} a las ${ts}`
    state.step = 'confirm'
    return sendMessage(d, formatSummary(state.data))
  }

  if (state.step === 'edit_description') {
    if (t.length < 3) return sendMessage(d, '❌ Pregunta muy corta.')
    state.data.description = t
    state.step = 'confirm'
    return sendMessage(d, formatSummary(state.data))
  }

  if (state.step === 'edit_options') {
    const options = parseOptions(t)
    if (!options) return sendMessage(d, '❌ No pude parsear las opciones.')
    state.data.options = options
    state.step = 'confirm'
    return sendMessage(d, formatSummary(state.data))
  }

  if (state.step === 'confirm') {
    const n = norm(t)
    if (['si', 'yes', 'dale', 'ok'].some(p => n.includes(p))) {
      const { name, cronExpr, scheduleText, description, options } = state.data
      updateCheckin(state.editId, { name, cronExpr, scheduleText, description, options })
      state = null
      return sendMessage(d, `✅ Check-in actualizado!`)
    }
    if (['no', 'cancelar'].some(p => n.includes(p))) {
      state = null
      return sendMessage(d, '🚫 Edición cancelada.')
    }
    return sendMessage(d, 'Respondé *sí* para guardar o *no* para cancelar.')
  }
}
