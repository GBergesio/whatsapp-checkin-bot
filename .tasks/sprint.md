# Sprint: Cat Bot v1

## Tareas

T1  Levantar Evolution API con Docker y conectar WhatsApp via QR
      Deps: ninguna
      Output: Evolution API corriendo en Docker, sesión de WhatsApp activa, podés enviar un mensaje de prueba via HTTP

T2  Configurar Cloudflare Tunnel para exponer el webhook
      Deps: ninguna (paralela a T1)
      Output: URL pública tipo `https://catbot.tunombre.com` apuntando a localhost:3000

T3  Crear proyecto Node.js base con Express + endpoint /webhook
      Deps: ninguna (paralela a T1 y T2)
      Output: Servidor corriendo en puerto 3000, recibe POST de Evolution API y loguea el body

T4  Integrar Evolution API en el script: enviar mensajes por HTTP
      Deps: T1, T3
      Output: El script puede enviar un mensaje de WhatsApp a tu número desde código

T5  Configurar Google Sheets API y función para escribir filas
      Deps: T3
      Output: El script puede agregar una fila al Sheet con timestamp, tarea y estado

T6  Implementar lógica de estado del día (qué pregunta está activa, respuestas pendientes)
      Deps: T3
      Output: Objeto de estado en memoria que sabe si hay una pregunta activa y desde cuándo

T7  Implementar los 3 crons diarios + lógica de envío secuencial
      Deps: T4, T6
      Output: A las 08:00, 14:00 y 21:00 se envía el mensaje correcto. No manda el siguiente hasta cerrar el anterior.

T8  Implementar normalización de respuestas + procesamiento del webhook
      Deps: T4, T6
      Output: Respuestas como "siii", "LISTO", "dale" se mapean a `true`. El estado se actualiza y se avanza.

T9  Implementar recordatorio a los 60 minutos
      Deps: T7, T8
      Output: Si pasan 60 min sin respuesta, se manda un mensaje de recordatorio. El bot sigue esperando.

T10 Implementar reset diario a medianoche
      Deps: T6, T8
      Output: Cron a las 00:00 limpia el estado del día. El día siguiente empieza desde cero.

T11 Empaquetar en Docker y agregar al docker-compose del home server
      Deps: T1, T2, T3, T7, T8, T9, T10
      Output: `docker-compose up -d` levanta todo. El bot funciona end-to-end.

## Dependencias

```
T1 ──┐
T2 ──┤
T3 ──┼──> T4 ──> T7 ──> T9 ──> T11
     │           │
     └──> T5     └──> T8 ──> T10
     │
     └──> T6 ──> T7
               └──> T8
```

## Siguiente paso

**Empezar por T1, T2 y T3 en paralelo** — son independientes entre sí y desbloquean todo lo demás.

- T1 (Evolution API) es la más crítica: si la sesión de WhatsApp no funciona, nada funciona. Conviene validarla primero.
- T2 (Cloudflare Tunnel) se puede dejar para después de T3 si querés testear localmente primero.
- T3 (proyecto Node.js base) es la base de todo el código.

Cuando T1 y T3 estén listos, T4 (enviar mensajes) es el primer smoke test real del sistema.
