import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import qrcode from 'qrcode-terminal'
import pino from 'pino'
import { config } from './config.js'

let sock = null
let messageHandler = null
let startupNotified = false
let connected = false

export function onMessage(handler) {
  messageHandler = handler
}

export async function connect() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info')
  const { version } = await fetchLatestBaileysVersion()

  sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log('\n📱 Escaneá este QR con WhatsApp:\n')
      qrcode.generate(qr, { small: true })
      console.log('\nEsperando escaneo...\n')
    }

    if (connection === 'close') {
      connected = false
      const code = new Boom(lastDisconnect?.error)?.output?.statusCode
      if (code === DisconnectReason.loggedOut) {
        console.log('❌ Sesión cerrada. Borrá la carpeta auth_info y reiniciá el bot.')
      } else {
        console.log('🔄 Desconectado, reconectando...')
        connect()
      }
    }

    if (connection === 'open') {
      connected = true
      console.log('✅ WhatsApp conectado!')
      if (!startupNotified) {
        startupNotified = true
        const hora = new Date().toLocaleTimeString('es-AR', {
          hour: '2-digit', minute: '2-digit', timeZone: config.timezone,
        })
        const dest = config.groupJid || `${config.myNumber}@s.whatsapp.net`
        setTimeout(() => {
          sock.sendMessage(dest, { text: `🤖 Bot online — ${hora}` }).catch(console.error)
        }, 2000)
      }
    }
  })

  sock.ev.on('messages.upsert', ({ messages, type }) => {
    if (type !== 'notify') return
    const msg = messages[0]
    if (!msg) return

    const text =
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      ''

    if (text && messageHandler) {
      messageHandler({ text, from: msg.key.remoteJid, participant: msg.key.participant })
    }
  })
}

export async function sendMessage(number, text) {
  if (!sock) throw new Error('WhatsApp no conectado')
  const jid = number.includes('@') ? number : `${number}@s.whatsapp.net`
  await sock.sendMessage(jid, { text })
}

export function isConnected() { return connected }

export async function listGroups() {
  if (!sock) throw new Error('WhatsApp no conectado')
  const groups = await sock.groupFetchAllParticipating()
  return Object.values(groups).map(g => ({ jid: g.id, name: g.subject }))
}
