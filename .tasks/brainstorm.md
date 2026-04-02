# Brainstorm: Bot WhatsApp de check-in para cuidado del gato

**Fecha**: 2026-04-02
**Objetivo**: Bot personal que manda 3 preguntas diarias por WhatsApp para registrar el cuidado del gato (comida, piedritas, agua/comida nocturna), espera respuesta, manda recordatorio si no hay respuesta en 60 min, y registra todo en Google Sheets.

## Decisiones tomadas

| Pregunta | Decisión | Razón |
|---|---|---|
| ¿n8n o código propio? | Script Node.js propio | Más liviano, más fácil de entender y mantener para un caso de uso simple |
| ¿Dónde se deploya? | Home server (PC hogareña) + Docker Compose | Ya va a existir para Home Assistant, siempre encendida, cero costo extra |
| ¿URL pública? | Cloudflare Tunnel | Gratis, sin abrir puertos del router, confiable |
| ¿WhatsApp? | Evolution API (Web/QR, sin API oficial de Meta) | Sin costo, sin aprobación de Meta |
| ¿Persistencia? | Google Sheets | Visual, fácil para ver estadísticas semanales |
| ¿Sesiones paralelas? | Modelo bloqueante/secuencial | Si no respondiste la pregunta anterior, el bot espera. Más simple, sin bugs de concurrencia |
| ¿Reset diario? | Sí, al inicio de cada día empieza desde cero | Si el día anterior quedaron tareas sin responder, no se arrastran |

## Arquitectura elegida

```
[node-cron]
    │
    ├─ 08:00 → Envia "¿le diste de comer?" via Evolution API (WhatsApp)
    ├─ 14:00 → Envia "¿limpiaste las piedritas?"
    └─ 21:00 → Envia "¿agua y comida de noche?"

[Express Webhook /webhook]
    │
    └─ Recibe respuesta de WhatsApp desde Evolution API
         │
         ├─ Normaliza ("siii", "LISTO", "si" → "true")
         ├─ Guarda en Google Sheets (timestamp, tarea, estado)
         └─ Avanza al siguiente estado

[Timer de recordatorio]
    └─ Si pasan 60 min sin respuesta → manda mensaje insistente
       Sigue esperando hasta recibir respuesta

[Estado en memoria / archivo JSON simple]
    └─ Qué pregunta está pendiente, desde cuándo, si ya se respondió
```

```
Docker Compose (home server)
├── evolution-api      (puerto interno, conecta a WhatsApp via QR)
├── cat-bot            (Node.js, puerto 3000, webhook público via Cloudflare)
└── cloudflare-tunnel  (expone cat-bot:3000 a internet)
```

## Estructura Google Sheet

| timestamp | dia | tarea | estado | respondido_en_min |
|---|---|---|---|---|
| 2026-04-02 08:03 | 2026-04-02 | comida_manana | true | 3 |
| 2026-04-02 14:00 | 2026-04-02 | piedritas | false | - |
| 2026-04-02 21:15 | 2026-04-02 | agua_noche | true | 15 |

Esto permite:
- Ver tasa de completado por semana
- Ver tiempo promedio de respuesta
- Filtrar por tarea específica

## Principios clave

1. **Un estado a la vez**: el bot solo tiene una pregunta "activa" en cada momento. No manda la siguiente hasta que la anterior está respondida o el día terminó.
2. **Reset duro a medianoche**: un cron a las 00:00 limpia el estado del día anterior. Sin deuda acumulada.
3. **Normalización antes de guardar**: un paso de limpieza convierte cualquier variante de "si"/"listo" a `true` antes de escribir al Sheet.
