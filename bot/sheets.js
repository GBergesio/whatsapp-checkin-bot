import { google } from 'googleapis'
import { config } from './config.js'

const auth = new google.auth.GoogleAuth({
  keyFile: './google-credentials.json',
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
})

export async function appendRow({ timestamp, dia, tarea, estado, respondidoEnMin, respondio, nota }) {
  const client = await auth.getClient()
  const sheets = google.sheets({ version: 'v4', auth: client })

  await sheets.spreadsheets.values.append({
    spreadsheetId: config.sheetId,
    range: 'A:G',
    valueInputOption: 'USER_ENTERED',
    resource: {
      values: [[timestamp, dia, tarea, estado, respondidoEnMin ?? '', respondio ?? '', nota ?? '']],
    },
  })

  console.log(`[sheets] Fila guardada: ${tarea} → ${estado}${nota ? ` | nota: "${nota}"` : ''}`)
}

export async function getTodayRows() {
  const client = await auth.getClient()
  const sheets = google.sheets({ version: 'v4', auth: client })

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.sheetId,
    range: 'A:G',
  })

  const today = new Date().toLocaleDateString('sv-SE', { timeZone: config.timezone })
  const rows = res.data.values ?? []

  return rows.slice(1)
    .filter(row => row[1] === today)
    .map(row => ({
      timestamp: row[0],
      dia: row[1],
      tarea: row[2],
      estado: row[3],
      respondidoEnMin: row[4],
      respondio: row[5],
      nota: row[6],
    }))
}

export async function getTodayAnotaciones() {
  const client = await auth.getClient()
  const sheets = google.sheets({ version: 'v4', auth: client })

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.sheetId,
    range: 'Anotaciones!A:D',
  })

  const today = new Date().toLocaleDateString('sv-SE', { timeZone: config.timezone })
  const rows = res.data.values ?? []

  return rows.slice(1)
    .filter(row => row[1] === today)
    .map(row => ({ timestamp: row[0], dia: row[1], quien: row[2], nota: row[3] }))
}

export async function getLastNDaysRows(n) {
  const client = await auth.getClient()
  const sheets = google.sheets({ version: 'v4', auth: client })

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.sheetId,
    range: 'A:G',
  })

  const days = new Set()
  for (let i = 1; i <= n; i++) {
    days.add(new Date(Date.now() - i * 86400000).toLocaleDateString('sv-SE', { timeZone: config.timezone }))
  }

  const rows = res.data.values ?? []
  return rows.slice(1)
    .filter(row => days.has(row[1]))
    .map(row => ({
      timestamp: row[0],
      dia: row[1],
      tarea: row[2],
      estado: row[3],
      respondidoEnMin: row[4],
      respondio: row[5],
      nota: row[6],
    }))
}

export async function getYesterdayRows() {
  const client = await auth.getClient()
  const sheets = google.sheets({ version: 'v4', auth: client })

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.sheetId,
    range: 'A:G',
  })

  const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('sv-SE', { timeZone: config.timezone })
  const rows = res.data.values ?? []

  return rows.slice(1)
    .filter(row => row[1] === yesterday)
    .map(row => ({
      timestamp: row[0],
      dia: row[1],
      tarea: row[2],
      estado: row[3],
      respondidoEnMin: row[4],
      respondio: row[5],
      nota: row[6],
    }))
}

export async function getYesterdayAnotaciones() {
  const client = await auth.getClient()
  const sheets = google.sheets({ version: 'v4', auth: client })

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.sheetId,
    range: 'Anotaciones!A:D',
  })

  const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('sv-SE', { timeZone: config.timezone })
  const rows = res.data.values ?? []

  return rows.slice(1)
    .filter(row => row[1] === yesterday)
    .map(row => ({ timestamp: row[0], dia: row[1], quien: row[2], nota: row[3] }))
}

export async function appendAnotacion({ timestamp, dia, quien, nota }) {
  const client = await auth.getClient()
  const sheets = google.sheets({ version: 'v4', auth: client })

  await sheets.spreadsheets.values.append({
    spreadsheetId: config.sheetId,
    range: 'Anotaciones!A:D',
    valueInputOption: 'USER_ENTERED',
    resource: {
      values: [[timestamp, dia, quien ?? '', nota]],
    },
  })

  console.log(`[sheets] Anotación guardada: "${nota}"`)
}

export async function initHeaders() {
  const client = await auth.getClient()
  const sheets = google.sheets({ version: 'v4', auth: client })

  // Headers check-ins
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.sheetId,
    range: 'A1:G1',
  })
  if (!res.data.values || res.data.values.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: config.sheetId,
      range: 'A1:G1',
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: [['timestamp', 'dia', 'tarea', 'estado', 'respondido_en_min', 'respondio', 'nota']],
      },
    })
    console.log('[sheets] Headers check-ins creados')
  }

  // Headers anotaciones
  const res2 = await sheets.spreadsheets.values.get({
    spreadsheetId: config.sheetId,
    range: 'Anotaciones!A1:D1',
  })
  if (!res2.data.values || res2.data.values.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: config.sheetId,
      range: 'Anotaciones!A1:D1',
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: [['timestamp', 'dia', 'quien', 'nota']],
      },
    })
    console.log('[sheets] Headers anotaciones creados')
  }
}
