const mode = (process.env.STORAGE || 'sheets').toLowerCase()

if (mode !== 'sheets' && mode !== 'sqlite') {
  console.warn(`[storage] Valor STORAGE="${mode}" inválido, usando "sheets"`)
}

const impl = mode === 'sqlite'
  ? await import('./sqlite.js')
  : await import('./sheets.js')

console.log(`[storage] Modo: ${mode === 'sqlite' ? 'SQLite (data/bot.db)' : 'Google Sheets'}`)

export const initHeaders         = impl.initHeaders
export const appendRow           = impl.appendRow
export const getTodayRows        = impl.getTodayRows
export const getYesterdayRows    = impl.getYesterdayRows
export const getLastNDaysRows    = impl.getLastNDaysRows
export const getTodayAnotaciones    = impl.getTodayAnotaciones
export const getYesterdayAnotaciones = impl.getYesterdayAnotaciones
export const appendAnotacion        = impl.appendAnotacion
