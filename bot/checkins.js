import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import cron from 'node-cron'
import { config } from './config.js'
import { enqueue } from './state.js'
import { sendMessage } from './whatsapp.js'
import { isPaused } from './pause.js'

const DATA_DIR = './data'
const FILE = `${DATA_DIR}/checkins.json`
mkdirSync(DATA_DIR, { recursive: true })

const jobs = new Map()

function load() {
  if (!existsSync(FILE)) return []
  try { return JSON.parse(readFileSync(FILE, 'utf8')) } catch { return [] }
}

function save(data) {
  writeFileSync(FILE, JSON.stringify(data, null, 2))
}

function genId() {
  return Math.random().toString(36).slice(2, 7).toUpperCase()
}

const destination = () => config.groupJid || config.myNumber

export function formatMessage(checkin) {
  const opts = checkin.options.map(o => `${o.key}️⃣ ${o.label}`).join('\n')
  return `${checkin.description}\n\n${opts}\n\n_(agregá texto después del número para una nota)_`
}

function scheduleOne(checkin) {
  return cron.schedule(checkin.cronExpr, async () => {
    if (isPaused()) {
      console.log(`[checkins] Pausado, omitiendo: ${checkin.name}`)
      return
    }
    console.log(`[checkins] Enviando: ${checkin.name}`)
    enqueue(checkin.id)
    await sendMessage(destination(), formatMessage(checkin)).catch(console.error)
  }, { timezone: config.timezone })
}

export function scheduleAllCheckins() {
  const all = load()
  for (const c of all) {
    jobs.set(c.id, scheduleOne(c))
  }
  console.log(`[checkins] ${all.length} check-in(s) programado(s)`)
}

export function listCheckins() { return load() }

export function getCheckin(id) { return load().find(c => c.id === id) }

export function addCheckin(data) {
  const id = genId()
  const checkin = { id, ...data, createdAt: new Date().toISOString() }
  const all = load()
  all.push(checkin)
  save(all)
  jobs.set(id, scheduleOne(checkin))
  return checkin
}

export function updateCheckin(id, data) {
  const all = load()
  const idx = all.findIndex(c => c.id === id)
  if (idx === -1) return null
  const updated = { ...all[idx], ...data }
  all[idx] = updated
  save(all)
  const job = jobs.get(id)
  if (job) job.stop()
  jobs.set(id, scheduleOne(updated))
  return updated
}

export function deleteCheckin(id) {
  const all = load()
  if (!all.find(c => c.id === id)) return false
  const job = jobs.get(id)
  if (job) { job.stop(); jobs.delete(id) }
  save(all.filter(c => c.id !== id))
  return true
}
