import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import cron from 'node-cron'
import { sendMessage } from './whatsapp.js'
import { config } from './config.js'

const DATA_DIR = './data'
const TASKS_FILE = `${DATA_DIR}/reminders.json`

mkdirSync(DATA_DIR, { recursive: true })

const DAYS = {
  domingo: 0, lunes: 1, martes: 2,
  'miércoles': 3, miercoles: 3,
  jueves: 4, viernes: 5,
  'sábado': 6, sabado: 6,
}

function stripAccents(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function load() {
  if (!existsSync(TASKS_FILE)) return []
  try { return JSON.parse(readFileSync(TASKS_FILE, 'utf8')) } catch { return [] }
}

function save(reminders) {
  writeFileSync(TASKS_FILE, JSON.stringify(reminders, null, 2))
}

function genId() {
  return Math.random().toString(36).slice(2, 7).toUpperCase()
}

const destination = () => config.groupJid || config.myNumber

// jobs en memoria para poder cancelarlos
const jobs = new Map()

function scheduleOne(reminder) {
  const dest = destination()

  if (reminder.type === 'once') {
    const ms = new Date(reminder.fireAt) - Date.now()
    if (ms <= 0) return null
    return setTimeout(async () => {
      await sendMessage(dest, `⏰ Recordatorio: ${reminder.text}`).catch(console.error)
      save(load().filter(r => r.id !== reminder.id))
      jobs.delete(reminder.id)
    }, ms)
  }

  if (reminder.type === 'daily' || reminder.type === 'weekly') {
    return cron.schedule(reminder.cronExpr, async () => {
      await sendMessage(dest, `⏰ Recordatorio: ${reminder.text}`).catch(console.error)
    }, { timezone: config.timezone })
  }

  return null
}

export function scheduleAllOnStartup() {
  const reminders = load()
  const valid = []

  for (const r of reminders) {
    if (r.type === 'once' && new Date(r.fireAt) <= new Date()) continue // expirado
    const job = scheduleOne(r)
    if (job) {
      jobs.set(r.id, job)
      valid.push(r)
    }
  }

  if (valid.length !== reminders.length) save(valid) // limpia expirados
  console.log(`[reminders] ${valid.length} recordatorio(s) cargado(s)`)
}

export function listReminders() {
  return load()
}

export function deleteReminder(id) {
  const all = load()
  if (!all.find(r => r.id === id)) return false

  const job = jobs.get(id)
  if (job) {
    typeof job.stop === 'function' ? job.stop() : clearTimeout(job)
    jobs.delete(id)
  }

  save(all.filter(r => r.id !== id))
  return true
}

function parseTime(str) {
  const m = str.match(/^(\d{1,2})(?::(\d{2}))?$/)
  if (!m) return null
  return { hour: parseInt(m[1]), minute: parseInt(m[2] ?? '0') }
}

export function createReminder({ raw, createdBy }) {
  const id = genId()
  const now = new Date()
  let reminder = null

  // "en 2hs texto" / "en 30min texto"
  const relMatch = raw.match(/^(en\s+\d+\s*(?:hs?|horas?|min(?:utos?)?))\s+(.+)/i)
  if (relMatch) {
    const hoursM = relMatch[1].match(/(\d+)\s*(?:hs?|horas?)/i)
    const minsM  = relMatch[1].match(/(\d+)\s*min/i)
    const ms = hoursM ? parseInt(hoursM[1]) * 3600000 : minsM ? parseInt(minsM[1]) * 60000 : null
    if (!ms) return null
    reminder = {
      id, type: 'once',
      text: relMatch[2].trim(),
      fireAt: new Date(Date.now() + ms).toISOString(),
      createdBy, createdAt: now.toISOString(),
    }
  }

  // "a las HH:MM texto"
  if (!reminder) {
    const m = raw.match(/^a las\s+([\d:]+)\s+(.+)/i)
    if (m) {
      const t = parseTime(m[1])
      if (!t) return null
      const fireAt = new Date(now)
      fireAt.setHours(t.hour, t.minute, 0, 0)
      if (fireAt <= now) return { error: 'Esa hora ya pasó hoy.' }
      reminder = { id, type: 'once', text: m[2].trim(), fireAt: fireAt.toISOString(), createdBy, createdAt: now.toISOString() }
    }
  }

  // "todos los días a las HH:MM texto"
  if (!reminder) {
    const m = raw.match(/^todos los d[íi]as?\s+a las\s+([\d:]+)\s+(.+)/i)
    if (m) {
      const t = parseTime(m[1])
      if (!t) return null
      reminder = {
        id, type: 'daily',
        text: m[2].trim(),
        cronExpr: `${t.minute} ${t.hour} * * *`,
        createdBy, createdAt: now.toISOString(),
      }
    }
  }

  // "los martes a las 22hs texto"
  if (!reminder) {
    const m = raw.match(/^los\s+(\w+)\s+a las\s+([\d:]+)\s+(.+)/i)
    if (m) {
      const dayKey = stripAccents(m[1].toLowerCase())
      const dayNum = DAYS[dayKey] ?? DAYS[m[1].toLowerCase()]
      if (dayNum === undefined) return { error: `No reconozco el día "${m[1]}". Usá: lunes, martes, miércoles, jueves, viernes, sábado, domingo.` }
      const t = parseTime(m[2])
      if (!t) return null
      reminder = {
        id, type: 'weekly',
        text: m[3].trim(),
        cronExpr: `${t.minute} ${t.hour} * * ${dayNum}`,
        dayName: m[1],
        createdBy, createdAt: now.toISOString(),
      }
    }
  }

  if (!reminder) return null

  const all = load()
  all.push(reminder)
  save(all)

  const job = scheduleOne(reminder)
  if (job) jobs.set(id, job)

  return reminder
}
