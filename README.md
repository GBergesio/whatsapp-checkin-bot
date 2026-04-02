# WhatsApp Check-in Bot

Bot de WhatsApp para hacer seguimiento diario de cualquier rutina o tarea recurrente. Enviá check-ins programados, respondé desde el chat, y llevá el registro automáticamente en Google Sheets.

Casos de uso: cuidado de mascotas, medicación, riego de plantas, tareas del hogar, hábitos diarios, etc.

## Cómo funciona

1. El bot manda un mensaje al grupo (o chat privado) a la hora que configures
2. Respondés con el número de la opción (ej: `1`, `2`, `3`)
3. El bot registra la respuesta en Google Sheets con hora, quién respondió y el resultado
4. A las 23:00 manda un reporte del día automáticamente
5. Si no respondés en 60 minutos, manda un recordatorio

---

## Requisitos

- [Docker](https://docs.docker.com/get-docker/) y Docker Compose
- Una cuenta de Google (para Google Sheets)
- Un número de WhatsApp

---

## Setup paso a paso

### 1. Clonar el repositorio

```bash
git clone <url-del-repo>
cd whatsapp-checkin-bot
```

### 2. Elegir dónde guardar los datos

El bot soporta dos backends configurables con `STORAGE` en el `.env`:

| | `STORAGE=sheets` | `STORAGE=sqlite` |
|---|---|---|
| Requiere cuenta Google | Sí | No |
| Requiere internet | Sí | No |
| Acceso visual | Google Sheets directo | DB Browser / VS Code / CSV export |
| Datos en | Google Drive | `bot/data/bot.db` |

**Con SQLite** (más simple): saltá al paso 3, no necesitás configurar nada más.

**Con Google Sheets** (más visual): seguí los pasos a continuación.

---

#### Configurar Google Sheets

El bot guarda todo en una Google Sheet usando una **Service Account** (una cuenta de servicio de Google, no tu cuenta personal).

**a) Crear la Google Sheet**

1. Ir a [Google Sheets](https://sheets.google.com) y crear una hoja nueva
2. Copiar el ID de la URL: `docs.google.com/spreadsheets/d/**ESTE_ES_EL_ID**/edit`
3. Crear dos pestañas (hojas):
   - `Hoja 1` — para los check-ins
   - `Anotaciones` — para las notas manuales

**b) Crear una Service Account**

1. Ir a [Google Cloud Console](https://console.cloud.google.com/)
2. Crear un proyecto nuevo (o usar uno existente)
3. Activar la **Google Sheets API**: APIs y servicios → Biblioteca → buscar "Google Sheets API" → Habilitar
4. Crear credenciales: APIs y servicios → Credenciales → Crear credenciales → **Cuenta de servicio**
5. Completar nombre y descripción, hacer clic en Crear
6. En la cuenta creada, ir a la pestaña **Claves** → Agregar clave → JSON
7. Se descarga un archivo `.json` — ese es el `google-credentials.json`

**c) Dar acceso a la Sheet**

1. Abrir el archivo `google-credentials.json` y copiar el valor de `client_email` (algo como `nombre@proyecto.iam.gserviceaccount.com`)
2. Abrir tu Google Sheet → Compartir → pegar ese email → dar permiso de **Editor**

**d) Poner el archivo en el proyecto**

```bash
cp /ruta/al/archivo-descargado.json google-credentials.json
```

> El archivo debe quedar en la raíz del proyecto como `google-credentials.json`. Este archivo contiene claves privadas — **nunca lo subas a git**.

---

---

### 3. Configurar el .env

```bash
cp .env.example .env
```

Editar `.env` con tus datos:

```env
MY_NUMBER=5491112345678       # Tu número sin + ni espacios
GROUP_JID=                    # Ver sección siguiente (puede dejarse vacío)
GOOGLE_SHEET_ID=1CSpLW...     # ID de tu Google Sheet
TIMEZONE=America/Argentina/Buenos_Aires
```

---

### 4. Obtener el GROUP_JID (opcional)

Si querés que el bot opere en un **grupo** en lugar de un chat privado, necesitás el JID del grupo (un identificador interno de WhatsApp).

La forma más fácil es arrancarlo sin GROUP_JID, conectarte, y usar el comando `/grupos` en el chat privado con el bot para ver los grupos disponibles y sus IDs. Luego copiar el ID al `.env` y reiniciar.

> Si `GROUP_JID` está vacío, el bot opera directamente en el chat privado con el número `MY_NUMBER`.

---

### 5. Levantar el bot

```bash
docker compose up -d
```

La primera vez, Docker construye la imagen y descarga dependencias (puede tardar unos minutos).

---

### 6. Escanear el QR

```bash
docker compose logs -f
```

Aparece un código QR en la terminal. Abrí WhatsApp en tu celular → tres puntos → **Dispositivos vinculados** → Vincular dispositivo → escanear el QR.

Una vez escaneado, el bot manda un mensaje confirmando que está online y empieza a funcionar.

> **Importante:** la sesión se guarda en `bot/auth_info/`. No borres esa carpeta o tendrás que escanear el QR de nuevo. Esta carpeta **no debe subirse a git** (ya está en `.gitignore`).

---

## Comandos disponibles

| Comando | Descripción |
|---|---|
| `/ayuda` | Lista todos los comandos |
| `/checkins` | Ver los check-ins configurados |
| `/nuevo-checkin` | Crear un check-in nuevo (wizard paso a paso) |
| `/editar-checkin` | Editar un check-in existente |
| `/borrar-checkin` | Eliminar un check-in |
| `/estado` | Ver qué check-ins están pendientes de respuesta |
| `/cancelar` | Cancelar el wizard en curso |
| `/reporte` | Ver el reporte del día en cualquier momento |
| `/anotar <texto>` | Guardar una anotación libre en la Sheet |
| `/recordar <texto> <hora>` | Crear un recordatorio puntual |
| `/recordar <texto> diario <hora>` | Recordatorio que se repite todos los días |
| `/recordatorios` | Ver recordatorios activos |
| `/borrar-tarea <id>` | Eliminar un recordatorio |

---

## Crear un check-in

Usá `/nuevo-checkin` y el bot te guía paso a paso:

1. **Nombre** — ej: `Comida del gato`, `Medicación`, `Riego`
2. **Hora** — ej: `8:00`, `20:30`, `8 pm`
3. **Días** — ej: `todos los días`, `lunes a viernes`, `fines de semana`, `solo los martes`, `lunes y jueves`
4. **Descripción** — texto opcional que aparece en el mensaje
5. **Opciones** — una por línea con número, ej:
   ```
   1 Sí, hecho
   2 No pude
   3 No hizo falta ~
   ```
   El `~` al final marca la opción como neutral (no cuenta como fallo en el reporte)

---

## Estructura del proyecto

```
.
├── docker-compose.yml
├── .env                        # Tu configuración (no subir a git)
├── .env.example                # Plantilla de configuración
├── google-credentials.json     # Credenciales de Google (no subir a git)
└── bot/
    ├── auth_info/              # Sesión de WhatsApp (no subir a git)
    ├── data/
    │   ├── checkins.json       # Check-ins configurados
    │   ├── queue.json          # Cola de check-ins pendientes
    │   └── reminders.json      # Recordatorios activos
    ├── index.js
    ├── config.js
    ├── whatsapp.js
    ├── scheduler.js
    ├── checkins.js
    ├── wizard.js
    ├── commands.js
    ├── sheets.js
    ├── report.js
    ├── reminders.js
    └── state.js
```

---

## Comandos útiles

```bash
# Ver logs en tiempo real
docker compose logs -f

# Reiniciar el bot
docker compose restart

# Detener el bot
docker compose down

# Reconstruir la imagen (tras cambios en el código)
docker compose up -d --build
```

## Local vs VPS

### Correr en local (recomendado para empezar)

La forma más simple: correlo en tu propia PC o notebook. El bot funciona mientras la máquina esté encendida.

- Accedé al dashboard en `http://localhost:3000`
- El QR se escanea una vez y la sesión persiste
- Ideal para probar, iterar, y ver si el bot se adapta a tu rutina

Limitación: si apagás la PC, el bot deja de funcionar hasta que lo volvés a encender.

### Deploy en VPS (para uso 24/7)

Si querés que el bot corra todo el tiempo sin depender de tu PC, podés deployarlo en cualquier servidor con Docker. El proceso es el mismo:

```bash
# En el servidor
git clone <url-del-repo>
cd whatsapp-checkin-bot
cp .env.example .env
nano .env  # completar con tus datos
# copiar google-credentials.json al servidor
docker compose up -d
docker compose logs -f  # escanear el QR
```

Con `restart: unless-stopped` en el `docker-compose.yml`, el bot se reinicia automáticamente si el servidor se reinicia.

**Acceder al dashboard desde afuera:**

Tenés varias opciones para exponer el puerto 3000:

- **Cloudflare Tunnel** — recomendado, no requiere IP pública ni abrir puertos:
  ```bash
  cloudflared tunnel --url http://localhost:3000
  ```
- **Nginx como reverse proxy** — si ya tenés un dominio apuntando al servidor
- **Abrir el puerto 3000** directamente — solo para uso interno, no recomendado sin autenticación

> **Nota de seguridad:** el dashboard no tiene autenticación. Si lo exponés públicamente, poné algo delante (Cloudflare Access, basic auth en nginx, etc.).

---

## Cerrar sesión / resetear WhatsApp

Si necesitás vincular otro número o el QR ya no funciona:

```bash
docker compose down
rm -rf bot/auth_info/
docker compose up -d
# Escanear QR de nuevo
```
