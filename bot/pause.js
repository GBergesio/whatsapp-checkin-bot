import { readFileSync, writeFileSync, existsSync } from 'fs'

const PAUSE_FILE = './data/pause.json'

function load() {
  if (!existsSync(PAUSE_FILE)) return null
  try {
    const d = JSON.parse(readFileSync(PAUSE_FILE, 'utf8'))
    return d.until ? new Date(d.until) : null
  } catch { return null }
}

function save(until) {
  writeFileSync(PAUSE_FILE, JSON.stringify({ until: until?.toISOString() ?? null }), 'utf8')
}

export function isPaused() {
  const until = load()
  if (!until) return false
  if (Date.now() < until.getTime()) return true
  save(null) // expiró, limpiar
  return false
}

export function pauseUntil(date) {
  save(date)
}

export function resume() {
  save(null)
}

export function pauseUntilDate() {
  return load()
}
