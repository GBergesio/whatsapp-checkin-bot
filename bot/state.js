import { readFileSync, writeFileSync, existsSync } from 'fs'

const QUEUE_FILE = './data/queue.json'

function todayString() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: process.env.TIMEZONE || 'America/Argentina/Buenos_Aires' })
}

function loadQueue() {
  if (!existsSync(QUEUE_FILE)) return []
  try {
    const raw = JSON.parse(readFileSync(QUEUE_FILE, 'utf8'))
    const today = todayString()
    return raw
      .map(i => ({ ...i, sentAt: new Date(i.sentAt) }))
      .filter(i => i.sentAt.toLocaleDateString('sv-SE', { timeZone: process.env.TIMEZONE || 'America/Argentina/Buenos_Aires' }) === today)
  } catch {
    return []
  }
}

function saveQueue() {
  writeFileSync(QUEUE_FILE, JSON.stringify(queue), 'utf8')
}

// Cola de check-ins pendientes: [{ taskId, sentAt, reminderSent }]
let queue = loadQueue()

export const getQueue = () => queue

export function enqueue(taskId) {
  queue.push({ taskId, sentAt: new Date(), reminderSent: false })
  saveQueue()
  console.log(`[state] Encolado: ${taskId} (pendientes: ${queue.length})`)
}

export function dequeue() {
  const item = queue.shift()
  if (item) {
    saveQueue()
    console.log(`[state] Respondido: ${item.taskId} (pendientes: ${queue.length})`)
  }
  return item
}

export function markReminderSent(taskId) {
  const item = queue.find(i => i.taskId === taskId)
  if (item) {
    item.reminderSent = true
    saveQueue()
  }
}

export function resetDay() {
  queue = []
  saveQueue()
  console.log('[state] Día reseteado')
}
