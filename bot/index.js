import http from 'http'
import { connect, onMessage, sendMessage, isConnected } from './whatsapp.js'
import { isPaused, pauseUntilDate } from './pause.js'
import { setupSchedules, handleIncomingMessage } from './scheduler.js'
import { initHeaders, getTodayRows, getTodayAnotaciones, getYesterdayRows, getYesterdayAnotaciones, getLastNDaysRows } from './storage.js'
import { scheduleAllOnStartup } from './reminders.js'
import { scheduleAllCheckins } from './checkins.js'
import { config } from './config.js'
import { enqueue, getQueue } from './state.js'
import { getCheckin, listCheckins, formatMessage } from './checkins.js'

const startedAt = new Date()

const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Check-in Bot Dashboard</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0A0C10;
      --card-bg: rgba(30, 35, 48, 0.7);
      --border: rgba(255, 255, 255, 0.1);
      --text: #F8FAFC;
      --text-muted: #94A3B8;
      --primary: #6366F1;
      --primary-hover: #4F46E5;
      --success: #10B981;
      --error: #F43F5E;
      --warning: #F59E0B;
      --accent: #E11D48;
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { 
      font-family: 'Inter', system-ui, -apple-system, sans-serif; 
      background: var(--bg); 
      background-image: radial-gradient(circle at 0% 0%, rgba(99, 102, 241, 0.15) 0%, transparent 50%),
                        radial-gradient(circle at 100% 100%, rgba(225, 29, 72, 0.1) 0%, transparent 50%);
      color: var(--text); 
      min-height: 100vh; 
      padding: clamp(16px, 4vw, 40px);
      line-height: 1.5;
    }
    h1 { font-size: 1.75rem; font-weight: 700; letter-spacing: -0.025em; display: flex; align-items: center; gap: 12px; }
    h2 { font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted); margin-bottom: 20px; font-weight: 600; }
    
    .header { margin-bottom: 40px; }
    .status-dot { width: 12px; height: 12px; border-radius: 50%; background: var(--success); box-shadow: 0 0 15px var(--success); display: inline-block; position: relative; }
    .status-dot.offline { background: var(--error); box-shadow: 0 0 15px var(--error); }
    .status-label { font-size: 0.85rem; color: var(--text-muted); margin-top: 8px; }
    .uptime { font-size: 0.85rem; color: var(--text-muted); }

    .grid { 
      display: grid; 
      grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); 
      gap: 24px; 
      align-items: start;
    }
    .card { 
      background: var(--card-bg); 
      backdrop-filter: blur(16px); 
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid var(--border); 
      border-radius: 16px; 
      padding: 24px; 
      box-shadow: 0 10px 30px -10px rgba(0,0,0,0.5);
      transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.2s;
      animation: fadeIn 0.5s ease-out backwards;
      overflow: hidden;
    }
    .card:hover { transform: translateY(-4px); border-color: rgba(255, 255, 255, 0.2); }
    
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .row { 
      display: flex; 
      align-items: center; 
      gap: 16px; 
      padding: 14px 0; 
      border-bottom: 1px solid rgba(255, 255, 255, 0.05); 
    }
    .row:last-child { border-bottom: none; }
    .row-icon { 
      font-size: 1.25rem; 
      width: 40px; height: 40px; 
      background: rgba(255, 255, 255, 0.05); 
      border-radius: 10px; 
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    .row-content { flex: 1; min-width: 0; }
    .row-name { font-size: 0.95rem; font-weight: 600; display: flex; align-items: center; gap: 8px; margin-bottom: 2px; }
    .row-sub { font-size: 0.8rem; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    
    .badge { 
      display: inline-flex; align-items: center; 
      padding: 2px 8px; border-radius: 6px; 
      font-size: 0.75rem; font-weight: 600; 
      letter-spacing: 0.02em;
    }
    .badge-done { background: rgba(16, 185, 129, 0.15); color: #34D399; border: 1px solid rgba(16, 185, 129, 0.2); }
    .badge-missed { background: rgba(244, 63, 94, 0.15); color: #FB7185; border: 1px solid rgba(244, 63, 94, 0.2); }
    .badge-na { background: rgba(148, 163, 184, 0.1); color: #94A3B8; border: 1px solid rgba(148, 163, 184, 0.1); }
    .badge-pending { background: rgba(245, 158, 11, 0.15); color: #FBBF24; border: 1px solid rgba(245, 158, 11, 0.2); }

    .btn { 
      display: inline-flex; align-items: center; justify-content: center;
      gap: 8px; padding: 8px 16px; border-radius: 10px; border: none; 
      cursor: pointer; font-size: 0.85rem; font-weight: 600; 
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); 
      user-select: none;
    }
    .btn-trigger { background: var(--primary); color: #fff; box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3); }
    .btn-trigger:hover:not(:disabled) { background: var(--primary-hover); transform: scale(1.05); }
    .btn-trigger:active:not(:disabled) { transform: scale(0.95); }
    .btn-trigger:disabled { background: rgba(255,255,255,0.1); color: var(--text-muted); cursor: not-allowed; box-shadow: none; }

    .empty { color: var(--text-muted); font-size: 0.9rem; padding: 20px 0; text-align: center; font-style: italic; }
    
    .refresh-bar { display: flex; align-items: center; justify-content: center; gap: 20px; margin-top: 60px; padding: 20px; border-top: 1px solid var(--border); }
    .refresh-bar span { font-size: 0.85rem; color: var(--text-muted); }
    .refresh-bar button { 
      background: transparent; border: 1px solid var(--border); 
      color: var(--text-muted); padding: 8px 20px; border-radius: 12px; 
      cursor: pointer; font-size: 0.85rem; font-weight: 500; transition: all 0.2s;
    }
    .refresh-bar button:hover { background: var(--border); color: var(--text); border-color: rgba(255,255,255,0.3); }

    .summary { display: flex; gap: 12px; margin-bottom: 24px; flex-wrap: wrap; }
    .summary-item { 
      background: rgba(255,255,255,0.05); border: 1px solid var(--border); 
      padding: 4px 12px; border-radius: 8px; font-size: 0.8rem; font-weight: 500; 
    }

    .cmd-group { margin-bottom: 24px; }
    .cmd-group-title { font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
    .cmd-group-title::after { content: ''; flex: 1; height: 1px; background: rgba(255,255,255,0.05); }
    .cmd-row { padding: 8px 0; display: flex; gap: 12px; border-bottom: 1px solid rgba(255,255,255,0.03); }
    .cmd-name { font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: 0.85rem; color: var(--primary); font-weight: 600; white-space: nowrap; }
    .cmd-desc { font-size: 0.85rem; color: var(--text-muted); line-height: 1.4; }

    .stats-bar-container { background: rgba(255,255,255,0.05); border-radius: 999px; height: 8px; margin: 8px 0; overflow: hidden; }
    .stats-bar { height: 100%; transition: width 1s cubic-bezier(0.4, 0, 0.2, 1); border-radius: 999px; }

    #toast { 
      position: fixed; bottom: 32px; right: 32px; 
      background: var(--success); color: #fff; 
      padding: 12px 24px; border-radius: 12px; 
      font-size: 0.9rem; font-weight: 600; 
      box-shadow: 0 10px 40px -10px rgba(16, 185, 129, 0.5);
      transform: translateY(100px); opacity: 0; 
      transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1); 
      z-index: 1000;
    }
    #toast.show { transform: translateY(0); opacity: 1; }
    
    #pause-banner { 
      background: rgba(245, 158, 11, 0.1); border: 1px solid var(--warning); 
      color: var(--warning); padding: 14px 20px; border-radius: 12px; 
      font-size: 0.9rem; margin-bottom: 24px; display: flex; align-items: center; gap: 12px;
      animation: shake 0.5s ease-in-out;
    }
    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-5px); }
      75% { transform: translateX(5px); }
    }

    ::-webkit-scrollbar { width: 8px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
    ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
  </style>
</head>
<body>
  <div class="header">
    <h1><span class="status-dot" id="dot"></span> Check-in Bot</h1>
    <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 4px;">
      <div class="uptime" id="uptime">Cargando uptime...</div>
      <div class="status-label" id="last-update"></div>
    </div>
  </div>

  <div class="grid" id="grid">
    <div class="card" style="grid-column: 1 / -1;"><div class="empty">Cargando aplicación...</div></div>
  </div>

  <div class="refresh-bar">
    <span id="next-refresh">Auto-actualiza en 30s</span>
    <button onclick="load()">↻ Actualizar Ahora</button>
  </div>

  <div id="toast"></div>

  <script>
    let countdown = 30

    const COMMANDS = [
      { group: 'Check-ins', items: [
        { cmd: '/checkins', desc: 'Ver configurados' },
        { cmd: '/nuevo-checkin', desc: 'Crear uno nuevo' },
        { cmd: '/editar-checkin [ID]', desc: 'Modificar configuración' },
        { cmd: '/borrar-checkin [ID]', desc: 'Eliminar' },
        { cmd: '/estado', desc: 'Pendientes actuales' },
        { cmd: '/cancelar', desc: 'Anular wizard' },
      ]},
      { group: 'Pausa', items: [
        { cmd: '/pausar Xd', desc: 'Pausa temporal' },
        { cmd: '/pausar off', desc: 'Reactivación' },
      ]},
      { group: 'Reportes', items: [
        { cmd: '/anotar [texto]', desc: 'Nota rápida' },
        { cmd: '/reporte', desc: 'Reporte del día' },
      ]},
      { group: 'Recordatorios', items: [
        { cmd: '/recordar [t]', desc: 'Recordatorio puntual/periódico' },
        { cmd: '/recordatorios', desc: 'Listar activos' },
        { cmd: '/borrar-tarea [ID]', desc: 'Cerrar tarea' },
      ]},
      { group: 'Sistema', items: [
        { cmd: '/grupos', desc: 'Ver JIDs de grupos' },
        { cmd: '/ayuda', desc: 'Listado completo' },
      ]},
    ]

    function showToast(msg, color = 'var(--success)') {
      const t = document.getElementById('toast')
      t.textContent = msg
      t.style.background = color
      t.style.boxShadow = \`0 10px 40px -10px \${color.replace('var(--','').replace(')','')}\`
      t.classList.add('show')
      setTimeout(() => t.classList.remove('show'), 2500)
    }

    function fmtUptime(startedAt) {
      const diff = Math.floor((Date.now() - new Date(startedAt)) / 1000)
      const days = Math.floor(diff / 86400)
      const h = Math.floor((diff % 86400) / 3600)
      const m = Math.floor((diff % 3600) / 60)
      const s = diff % 60
      if (days > 0) return \`Activo hace \${days}d \${h}h \${m}m\`
      if (h > 0) return \`Activo hace \${h}h \${m}m\`
      if (m > 0) return \`Activo hace \${m}m\`
      return \`Activo hace \${s}s\`
    }

    function outcomeClass(outcome) {
      return { done: 'badge-done', missed: 'badge-missed', na: 'badge-na', pending: 'badge-pending' }[outcome] ?? 'badge-na'
    }
    function outcomeLabel(outcome) {
      return { done: 'Hecho', missed: 'Fallido', na: 'N/A', pending: 'Pendiente' }[outcome] ?? outcome
    }
    function outcomeIcon(outcome) {
      return { done: '✨', missed: '⚠️', na: '➖', pending: '🕒' }[outcome] ?? '•'
    }

    function buildCheckinRows(rows, checkins, queue) {
      const map = {}
      for (const r of rows) map[r.tarea] = r
      const pendingIds = new Set(queue.map(q => q.taskId))
      let html = ''
      for (const c of checkins) {
        const row = map[c.name]
        const isPending = pendingIds.has(c.id)
        const outcome = row ? row.outcome : isPending ? 'pending' : null
        const icon = outcome ? outcomeIcon(outcome) : '📅'
        const badge = outcome ? \`<span class="badge \${outcomeClass(outcome)}">\${outcomeLabel(outcome)}</span>\` : ''
        const sub = row
          ? (row.estado + (row.respondidoEnMin ? \` · \${row.respondidoEnMin} min\` : '') + (row.respondio ? \` · \${row.respondio}\` : ''))
          : c.scheduleText
        const note = row?.nota ? \`<div class="row-sub" style="margin-top:4px; font-style:italic">" \${row.nota} "</div>\` : ''
        const btnDisabled = isPending || !!row ? 'disabled' : ''
        html += \`<div class="row">
          <div class="row-icon">\${icon}</div>
          <div class="row-content">
            <div class="row-name">\${c.name} \${badge}</div>
            <div class="row-sub">\${sub}</div>
            \${note}
          </div>
          <button class="btn btn-trigger" \${btnDisabled} onclick="trigger('\${c.id}','\${c.name}',this)">▶</button>
        </div>\`
      }
      return html
    }

    function buildSummary(rows, pendingCount) {
      const done = rows.filter(r => r.outcome === 'done').length
      const missed = rows.filter(r => r.outcome === 'missed').length
      const na = rows.filter(r => r.outcome === 'na').length
      const parts = []
      if (done) parts.push(\`\${done} Completados\`)
      if (missed) parts.push(\`\${missed} Perdidos\`)
      if (na) parts.push(\`\${na} Ignorados\`)
      if (pendingCount) parts.push(\`\${pendingCount} Pendientes\`)
      return parts.length ? \`<div class="summary">\${parts.map(p => \`<span class="summary-item">\${p}</span>\`).join('')}</div>\` : ''
    }

    function buildAnotRows(anotaciones) {
      return anotaciones.map(a => {
        const hora = new Date(a.timestamp).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
        return \`<div class="row">
          <div class="row-icon" style="background:rgba(225,29,72,0.1)">📝</div>
          <div class="row-content">
            <div class="row-name" style="font-weight:500">\${a.nota}</div>
            <div class="row-sub">\${hora}\${a.quien ? ' · ' + a.quien : ''}</div>
          </div>
        </div>\`
      }).join('')
    }

    function buildCommandsCard() {
      const groups = COMMANDS.map(g => \`
        <div class="cmd-group">
          <div class="cmd-group-title">\${g.group}</div>
          \${g.items.map(i => \`<div class="cmd-row"><span class="cmd-name">\${i.cmd}</span><span class="cmd-desc">\${i.desc}</span></div>\`).join('')}
        </div>\`).join('')
      return \`<div class="card"><h2>Acceso Rápido</h2>\${groups}</div>\`
    }

    async function trigger(id, name, btn) {
      btn.disabled = true
      const oldTxt = btn.textContent
      btn.textContent = '...'
      try {
        const r = await fetch('/trigger/' + id)
        if (r.ok) { showToast('🚀 ' + name + ' enviado'); setTimeout(load, 1000) }
        else showToast('Acción fallida', 'var(--error)')
      } catch { showToast('Error de red', 'var(--error)') }
      btn.disabled = false
      btn.textContent = oldTxt
    }

    async function load() {
      countdown = 30
      try {
        const [statusRes, yesterdayRes, statsRes] = await Promise.all([
          fetch('/api/status'), fetch('/api/yesterday'), fetch('/api/stats?days=7')
        ]).catch(() => [ { ok: false }, { ok: false }, { ok: false } ])

        if (!statusRes.ok) throw new Error()
        const d = await statusRes.json()
        const y = yesterdayRes.ok ? await yesterdayRes.json() : { rows: [], anotaciones: [] }
        const stats = statsRes.ok ? await statsRes.json() : null
        render(d, y, stats)
        document.getElementById('last-update').textContent = 'Hace un momento'
        document.getElementById('dot').className = 'status-dot'
      } catch {
        document.getElementById('dot').className = 'status-dot offline'
        showToast('Error sincronizando datos', 'var(--error)')
      }
    }

    function buildStatsCard(stats) {
      if (!stats || stats.stats.every(s => s.total === 0)) {
        return \`<div class="card"><h2>Rendimiento 7d</h2><div class="empty">No hay datos acumulados todavía.</div></div>\`
      }
      const rows = stats.stats.filter(s => s.total > 0).map(s => {
        const pct = s.pct !== null ? s.pct : 0
        const barColor = pct >= 85 ? 'var(--success)' : pct >= 50 ? 'var(--warning)' : 'var(--error)'
        const avgLabel = s.avgMin !== null ? \`~\${s.avgMin}m\` : '—'
        return \`<div class="row" style="flex-direction:column; align-items:stretch; border:none; padding:10px 0">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px">
            <span class="row-name" style="font-size:0.85rem">\${s.name}</span>
            <span style="font-size:0.75rem; color:var(--text-muted); font-weight:600">\${pct}% <span style="font-weight:400; opacity:0.6; margin-left:4px">(\${avgLabel})</span></span>
          </div>
          <div class="stats-bar-container">
            <div class="stats-bar" style="background:\${barColor}; width:\${pct}%"></div>
          </div>
        </div>\`
      }).join('')
      return \`<div class="card"><h2>Rendimiento 7d</h2>\${rows}</div>\`
    }

    function render(d, y, stats) {
      document.getElementById('uptime').textContent = fmtUptime(d.startedAt)

      const existingBanner = document.getElementById('pause-banner')
      if (existingBanner) existingBanner.remove()
      if (d.paused && d.pausedUntil) {
        const fecha = new Date(d.pausedUntil).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
        const banner = document.createElement('div')
        banner.id = 'pause-banner'
        banner.innerHTML = \`<span>⏸️</span> El sistema está en pausa hasta el <strong>\${fecha}</strong>.\`
        document.getElementById('grid').before(banner)
      }

      const todayCard = \`<div class="card">
        <h2>Hoy</h2>
        \${buildSummary(d.todayRows, d.queue.length)}
        \${d.checkins.length === 0
          ? '<div class="empty">No hay protocolos activos.</div>'
          : buildCheckinRows(d.todayRows, d.checkins, d.queue)}
      </div>\`

      const anotCard = \`<div class="card">
        <h2>Bitácora</h2>
        \${d.todayAnotaciones.length === 0 ? '<div class="empty">Sin anotaciones relevantes.</div>' : buildAnotRows(d.todayAnotaciones)}
      </div>\`

      const yesterdayCard = \`<div class="card">
        <h2>Resumen Ayer</h2>
        \${buildSummary(y.rows, 0)}
        \${y.rows.length === 0
          ? '<div class="empty">No hubo registros ayer.</div>'
          : y.rows.map(row => \`<div class="row" style="padding: 10px 0">
              <div class="row-icon" style="opacity:0.8">\${outcomeIcon(row.outcome)}</div>
              <div class="row-content">
                <div class="row-name">\${row.tarea} <span class="badge \${outcomeClass(row.outcome)}">\${outcomeLabel(row.outcome)}</span></div>
                <div class="row-sub">\${row.estado}\${row.respondidoEnMin ? ' · ' + row.respondidoEnMin + ' min' : ''}</div>
              </div>
            </div>\`).join('')}
        \${y.anotaciones.length > 0 ? '<div style="margin-top:16px; border-top:1px solid rgba(255,255,255,0.05); padding-top:10px">' + buildAnotRows(y.anotaciones) + '</div>' : ''}
      </div>\`

      document.getElementById('grid').innerHTML = todayCard + anotCard + yesterdayCard + buildStatsCard(stats) + buildCommandsCard()
    }

    setInterval(() => {
      countdown--
      if (countdown < 0) countdown = 0
      document.getElementById('next-refresh').textContent = \`Sincronizando en \${countdown}s\`
      if (countdown <= 0) load()
    }, 1000)

    load()
    // Uptime live update
    setInterval(() => {
      const uptimeEl = document.getElementById('uptime')
      if (uptimeEl.textContent.includes('h')) { // simple check to avoid updating if not loaded
         // we could store d.startedAt globally and recall fmtUptime
      }
    }, 60000)
  </script>
</body>
</html>`;

function checkAuth(req, res) {
  if (!config.dashboardUser || !config.dashboardPass) return true
  const header = req.headers['authorization'] || ''
  const b64 = header.startsWith('Basic ') ? header.slice(6) : ''
  const [user, pass] = Buffer.from(b64, 'base64').toString().split(':')
  if (user === config.dashboardUser && pass === config.dashboardPass) return true
  res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Check-in Bot"' })
  res.end('Acceso no autorizado')
  return false
}

function setupServer() {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost`)
    if (!checkAuth(req, res)) return

    // GET /health — sin auth, para monitoreo externo
    if (req.method === 'GET' && url.pathname === '/health') {
      const uptime = Math.floor((Date.now() - startedAt) / 1000)
      res.writeHead(isConnected() ? 200 : 503, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: isConnected(), uptime, startedAt, whatsappConnected: isConnected() }))
      return
    }

    // GET / — dashboard
    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(DASHBOARD_HTML)
      return
    }

    // GET /api/status — datos para el dashboard
    if (req.method === 'GET' && url.pathname === '/api/status') {
      const [todayRows, todayAnotaciones] = await Promise.all([
        getTodayRows().catch(() => []),
        getTodayAnotaciones().catch(() => []),
      ])

      // Resolver outcome de cada fila
      const checkins = listCheckins()
      const rowsWithOutcome = todayRows.map(row => {
        let outcome = 'done'
        for (const c of checkins) {
          const opt = c.options.find(o => o.label === row.estado)
          if (opt?.outcome) { outcome = opt.outcome; break }
        }
        const lower = row.estado?.toLowerCase() ?? ''
        if (!checkins.some(c => c.options.find(o => o.label === row.estado))) {
          if (['no aplica', 'no hizo falta', 'n/a'].some(p => lower.includes(p))) outcome = 'na'
          else if (lower.startsWith('no')) outcome = 'missed'
        }
        return { ...row, outcome }
      })

      const paused = isPaused()
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        startedAt,
        paused,
        pausedUntil: paused ? pauseUntilDate() : null,
        checkins: checkins.map(c => ({ id: c.id, name: c.name, scheduleText: c.scheduleText })),
        queue: getQueue().map(i => ({ taskId: i.taskId, sentAt: i.sentAt })),
        todayRows: rowsWithOutcome,
        todayAnotaciones,
      }))
      return
    }

    // GET /api/stats?days=7
    if (req.method === 'GET' && url.pathname === '/api/stats') {
      const days = Math.min(parseInt(url.searchParams.get('days') || '7', 10), 30)
      const rows = await getLastNDaysRows(days).catch(() => [])
      const checkins = listCheckins()

      const resolveOutcome = (estado) => {
        for (const c of checkins) {
          const opt = c.options.find(o => o.label === estado)
          if (opt?.outcome) return opt.outcome
        }
        const lower = estado?.toLowerCase() ?? ''
        if (['no aplica', 'no hizo falta', 'n/a'].some(p => lower.includes(p))) return 'na'
        if (lower.startsWith('no')) return 'missed'
        return 'done'
      }

      // Agrupar por check-in
      const byCheckin = {}
      for (const c of checkins) byCheckin[c.name] = { name: c.name, done: 0, missed: 0, na: 0, total: 0, avgMin: [] }
      for (const row of rows) {
        const outcome = resolveOutcome(row.estado)
        if (!byCheckin[row.tarea]) byCheckin[row.tarea] = { name: row.tarea, done: 0, missed: 0, na: 0, total: 0, avgMin: [] }
        const s = byCheckin[row.tarea]
        s.total++
        s[outcome]++
        if (outcome !== 'na' && row.respondidoEnMin) s.avgMin.push(parseInt(row.respondidoEnMin, 10))
      }

      const stats = Object.values(byCheckin).map(s => ({
        name: s.name,
        done: s.done,
        missed: s.missed,
        na: s.na,
        total: s.total,
        pct: s.total > 0 ? Math.round((s.done / (s.done + s.missed)) * 100) || 0 : null,
        avgMin: s.avgMin.length > 0 ? Math.round(s.avgMin.reduce((a, b) => a + b, 0) / s.avgMin.length) : null,
      }))

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ days, stats }))
      return
    }

    // GET /api/yesterday
    if (req.method === 'GET' && url.pathname === '/api/yesterday') {
      const [rows, anotaciones] = await Promise.all([
        getYesterdayRows().catch(() => []),
        getYesterdayAnotaciones().catch(() => []),
      ])
      const checkins = listCheckins()
      const rowsWithOutcome = rows.map(row => {
        let outcome = 'done'
        for (const c of checkins) {
          const opt = c.options.find(o => o.label === row.estado)
          if (opt?.outcome) { outcome = opt.outcome; break }
        }
        const lower = row.estado?.toLowerCase() ?? ''
        if (!checkins.some(c => c.options.find(o => o.label === row.estado))) {
          if (['no aplica', 'no hizo falta', 'n/a'].some(p => lower.includes(p))) outcome = 'na'
          else if (lower.startsWith('no')) outcome = 'missed'
        }
        return { ...row, outcome }
      })
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ rows: rowsWithOutcome, anotaciones }))
      return
    }

    // GET /trigger/:id — disparar check-in manualmente
    if (url.pathname.startsWith('/trigger/')) {
      const id = url.pathname.split('/trigger/')[1].toUpperCase()
      const checkin = getCheckin(id)
      if (!checkin) {
        res.writeHead(404)
        res.end(JSON.stringify({ error: `Check-in "${id}" no encontrado` }))
        return
      }
      enqueue(checkin.id)
      await sendMessage(config.groupJid || config.myNumber, formatMessage(checkin)).catch(console.error)
      res.writeHead(200)
      res.end(JSON.stringify({ ok: true, id: checkin.id, name: checkin.name }))
      return
    }

    // GET /checkins
    if (req.method === 'GET' && url.pathname === '/checkins') {
      const all = listCheckins().map(c => ({ id: c.id, name: c.name, schedule: c.scheduleText }))
      res.writeHead(200)
      res.end(JSON.stringify(all))
      return
    }

    // GET /state
    if (req.method === 'GET' && url.pathname === '/state') {
      res.writeHead(200)
      res.end(JSON.stringify(getQueue()))
      return
    }

    res.writeHead(404)
    res.end()
  })

  server.listen(3000, () => console.log('[server] Dashboard en http://localhost:3000'))
}

async function main() {
  console.log('🐱 Cat Bot iniciando...')

  onMessage(handleIncomingMessage)
  await connect()

  await initHeaders().catch(err =>
    console.warn('[sheets] No se pudo inicializar headers:', err.message)
  )

  setupSchedules()
  scheduleAllCheckins()
  scheduleAllOnStartup()
  setupServer()
}

main().catch(console.error)
