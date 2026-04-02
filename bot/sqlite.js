import Database from 'better-sqlite3'
import { mkdirSync } from 'fs'
import { config } from './config.js'

mkdirSync('./db', { recursive: true })

const db = new Database('./db/bot.db')

function today() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: config.timezone })
}

function nDaysAgo(n) {
  return new Date(Date.now() - n * 86400000).toLocaleDateString('sv-SE', { timeZone: config.timezone })
}

function mapCheckin(row) {
  return {
    timestamp: row.timestamp,
    dia: row.dia,
    tarea: row.tarea,
    estado: row.estado,
    respondidoEnMin: row.respondido_en_min,
    respondio: row.respondio,
    nota: row.nota,
  }
}

function mapAnotacion(row) {
  return { timestamp: row.timestamp, dia: row.dia, quien: row.quien, nota: row.nota }
}

export async function initHeaders() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS checkins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT,
      dia TEXT,
      tarea TEXT,
      estado TEXT,
      respondido_en_min TEXT,
      respondio TEXT,
      nota TEXT
    );
    CREATE TABLE IF NOT EXISTS anotaciones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT,
      dia TEXT,
      quien TEXT,
      nota TEXT
    );
  `)
  console.log('[sqlite] Tablas listas en data/bot.db')
}

export async function appendRow({ timestamp, dia, tarea, estado, respondidoEnMin, respondio, nota }) {
  db.prepare(
    `INSERT INTO checkins (timestamp, dia, tarea, estado, respondido_en_min, respondio, nota) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(timestamp, dia, tarea, estado, respondidoEnMin ?? '', respondio ?? '', nota ?? '')
  console.log(`[sqlite] Fila guardada: ${tarea} → ${estado}${nota ? ` | nota: "${nota}"` : ''}`)
}

export async function getTodayRows() {
  return db.prepare(`SELECT * FROM checkins WHERE dia = ? ORDER BY id`).all(today()).map(mapCheckin)
}

export async function getYesterdayRows() {
  return db.prepare(`SELECT * FROM checkins WHERE dia = ? ORDER BY id`).all(nDaysAgo(1)).map(mapCheckin)
}

export async function getLastNDaysRows(n) {
  const days = []
  for (let i = 1; i <= n; i++) days.push(nDaysAgo(i))
  const placeholders = days.map(() => '?').join(',')
  return db.prepare(`SELECT * FROM checkins WHERE dia IN (${placeholders}) ORDER BY dia, id`).all(...days).map(mapCheckin)
}

export async function getTodayAnotaciones() {
  return db.prepare(`SELECT * FROM anotaciones WHERE dia = ? ORDER BY id`).all(today()).map(mapAnotacion)
}

export async function getYesterdayAnotaciones() {
  return db.prepare(`SELECT * FROM anotaciones WHERE dia = ? ORDER BY id`).all(nDaysAgo(1)).map(mapAnotacion)
}

export async function appendAnotacion({ timestamp, dia, quien, nota }) {
  db.prepare(
    `INSERT INTO anotaciones (timestamp, dia, quien, nota) VALUES (?, ?, ?, ?)`
  ).run(timestamp, dia, quien ?? '', nota)
  console.log(`[sqlite] Anotación guardada: "${nota}"`)
}
