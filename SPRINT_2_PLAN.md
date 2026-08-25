# SPRINT 2 — VERCEL API ROUTES → SERVER ACTIONS

**Objetivo:** Reducir cold starts y latencia HTTP eliminando 217 API route wrappers  
**Impacto esperado:** 15-20% reducción en cold starts, ~$200-500/mes en costos  
**Esfuerzo:** 3-4 semanas  
**Riesgo:** MEDIO (refactor de rutas, requiere tests exhaustivos)

---

## 📊 AUDIT RESULTS

| Categoría | Cantidad | Acción |
|-----------|----------|--------|
| Total routes | 247 | - |
| Webhooks/crons (keep as API) | 30 | No tocar |
| Server Action candidates | 217 | Convertir |
| **Conversion potential** | **88%** | **$200-500/mo savings** |

---

## 🎯 FASE 1: PILOTO (1 semana)

### Rutas piloto (20 simples):

1. `emails/send` — enviar email → Server Action
2. `equipo/ausencias` → Server Action
3. `auth/otp/verificar` → Server Action
4. `clases/avisar-cancelada` → Server Action
5. `checkin/pase` → Server Action
6. `backups/create` → Server Action
7. `penalizaciones/aprobar` → Server Action
8. `devoluciones/revertir` → Server Action
9. `citas/import` → Server Action
10. `automatizaciones/run` → Server Action
11. `comunidad/comentarios` → Server Action
12. `cierre/enviar-gestoria` → Server Action
13. `ai/campana-asistente` → Server Action
14. `ai/instructor-note` → Server Action
15. `auth/otp/reenviado` → Server Action
16. `cadena/tipos-clase/aplicar` → Server Action
17. `backups/restore` → Server Action
18. `theme` (GET/PUT) → Server Action
19. `layout` (PUT) → Server Action
20. `cobros/cobrar-online` → Server Action

### Patrón de conversión:

**ANTES (API route):**
```typescript
// app/api/emails/send/route.ts
export async function POST(req: NextRequest) {
  const auth = getAuth(req);
  const data = await req.json();
  const result = await enviarEmail(data);
  return NextResponse.json(result);
}
```

**DESPUÉS (Server Action):**
```typescript
// lib/actions/emails.ts
'use server'
export async function enviarEmailAction(data: EmailData) {
  const auth = getAuth(); // No requiere req
  const result = await enviarEmail(data);
  return result;
}
```

---

## ⚠️ NO TOCAR (quedan como API routes):

- `cron/*` — llamadas desde pg_cron/Inngest
- Webhooks: `billing/webhook`, `stripe/*`, `inngest/*`
- Públicos sin auth: `public/checkout-embebido`, `public/evento`, `public/session`
- Rutas con streaming o custom CORS headers

---

## 📊 MÉTRICAS A MEDIR

**Antes:**
- [ ] Promedio cold start time
- [ ] P95 latencia `/api/*`
- [ ] Bytes/request (overhead HTTP)

**Después Fase 1:**
- [ ] Cold start time vs antes
- [ ] Latencia Server Actions vs rutas HTTP
- [ ] Estimación total de ahorro

---

## ✅ VERIFICACIÓN PRE-MERGE

- [ ] `npm run build` ✅
- [ ] `npm run type-check` ✅
- [ ] `npm test` ✅
- [ ] `npm run e2e` — tests que usan esas rutas ✅
- [ ] Sentry — sin nuevos errores
- [ ] Vercel dashboard — no hay regresión

---

**Inicio:** Hoy  
**Duración:** 1 semana piloto → 2-3 semanas escalar  
**ROI:** ~$200-500/mes + mejor UX
