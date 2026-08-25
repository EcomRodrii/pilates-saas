# 🎯 AUDITORÍA INTEGRAL TENTARE — ROADMAP COMPLETO

**Fecha:** 25-ago-2026  
**Estado:** Auditoría #3 Completada (Inngest). Auditorías #4-6 en Planificación

---

## ✅ AUDITORÍA #3 — INNGEST (COMPLETADA)

### Optimizaciones Ejecutadas

| Job | Cambio | Ahorro/mes | PR |
|-----|--------|-----------|-----|
| conciliar-cobros | 5min → 1h | 26.400 | #1371 ✅ |
| decision-dispatcher | 2x/día → 1x/día | 600 | #1371 ✅ |
| valoraciones-dispatcher | 6h → 12h | 240 | #1374 ✅ |
| penalizaciones-procesar | 30min → 1h | 1.416 | #1374 ✅ |
| confirmación-riesgo-corte | 30min → 1h | 1.440 | #1374 ✅ |

**Total:** 30.096/mes ahorrados (96% reducción)  
**Inngest final:** 1.504/mes (30% límite Free) ✅ **VIABLE SIN PAGAR**

---

## 📋 AUDITORÍA #4 — SUPABASE (NEXT)

### Problemas Identificados

#### P1: SELECT * Queries (163 instancias)
- **Ubicación:** lib/supabase-data.ts, lib/db/supabase-data-admin.ts
- **Impacto:** 5-15% ancho de banda innecesario
- **Dificultad:** BAJO
- **Esfuerzo:** 1-2 semanas
- **ROI:** ⭐⭐⭐⭐⭐ MUY ALTO

```typescript
// ANTES
db.from('studios').select('*')  // trae 30 columnas

// DESPUÉS  
db.from('studios').select('id, nombre, color_primario, logo_url')  // trae 4
```

**Costo estimado:** $50-200/mes

#### P2: RLS Overhead
- **Ubicación:** 9 tablas sin USING/WITH CHECK guards optimizados
- **Impacto:** +5-10% latencia en queries
- **Esfuerzo:** 3-5 días
- **ROI:** ⭐⭐⭐ MEDIO

#### P3: Realtime Subscriptions
- **Ubicación:** 3 conexiones activas simultáneas (promedio)
- **Impacto:** Memoria de Supabase, conexiones
- **Esfuerzo:** 1 semana auditoría + 1-2 sem refactor
- **ROI:** ⭐⭐ BAJO

---

## 🔵 AUDITORÍA #5 — VERCEL (AFTER #4)

### Problemas Identificados

#### P1: 247 API Routes (muchas son wrappers)
- **Ubicación:** app/api/**
- **Impacto:** 15-20% invocaciones innecesarias, cold starts
- **Dificultad:** MEDIO-ALTO
- **Esfuerzo:** 2-3 semanas
- **ROI:** ⭐⭐⭐⭐⭐ MUY ALTO

**Estrategia:** Convertir wrappers a Server Actions ('use server')

```typescript
// ANTES: /app/api/reservas/crear/route.ts (65L, HTTP overhead)
export async function POST(req) {
  const auth = getAuth(req);
  return crearReserva({...});
}

// DESPUÉS: lib/acciones.ts ('use server', 10L, directo)
'use server'
export async function crearReservaAction(...) {
  const auth = getAuth();
  return crearReserva({...});
}
// Consumido desde componentes sin HTTP round-trip
```

**Costo estimado:** $200-500/mes

#### P2: Client Components Innecesarios
- **Ubicación:** 28 useEffect hooks en lib/**
- **Impacto:** 10-20% JS cliente innecesario
- **Esfuerzo:** 2 semanas
- **ROI:** ⭐⭐⭐⭐ MEDIO-ALTO

#### P3: Context Global Masivo
- **Ubicación:** auth-context.tsx (25.293 líneas)
- **Impacto:** 5-10% re-renders en cascada
- **Esfuerzo:** 2 semanas
- **ROI:** ⭐⭐⭐ MEDIO

---

## 📊 AUDITORÍA #6 — GITHUB ACTIONS (OPTIONAL)

### Observaciones

**CI Time:** 15-27 min/run (ya optimizado)
- ✅ Node modules caché (4s vs 19s)
- ✅ TypeScript incremental build
- ✅ ESLint caché
- ✅ Build compartido E2E
- ✅ Timeouts configurados (15min limits)

**Oportunidades Menores:**
- E2E shard strategy (medir paralelización real)
- Cancelled builds análisis (~30% con "Ignored Build Step")

**Costo estimado:** $10-50/mes  
**ROI:** ⭐⭐ BAJO (ya optimizado)

---

## 🎯 ROADMAP RECOMENDADO

### Sprint 1: Supabase SELECT * (2-3 semanas)
**Prioridad:** 🔴 ALTA  
**Impacto:** 5-15% latencia/BW reduction  
**Pasos:**
1. Auditar queries SELECT * más frecuentes (via logs)
2. Cambiar a columnas específicas (bajo riesgo)
3. Actualizar mappers si es necesario
4. Test e2e cambios
5. Deploy y monitorear latencia

**Riesgo:** BAJO  
**Reversibility:** ALTA

---

### Sprint 2: Vercel API Routes (3-4 semanas)
**Prioridad:** 🔴 ALTA  
**Impacto:** 15-20% cold starts reduction  
**Pasos:**
1. Auditar 247 API routes para identificar wrappers
2. Convertir wrappers a Server Actions (piloto: top 20)
3. Actualizar llamadas en componentes
4. Tests exhaustivos (E2E + unitarios)
5. Deploy gradual (feature flags) y monitorear

**Riesgo:** MEDIO (refactor)  
**Reversibility:** MEDIA

---

### Sprint 3: GitHub Actions E2E (Optional, 3-5 días)
**Prioridad:** 🟡 BAJA  
**Impacto:** 5-10% CI time (marginal)  
**Pasos:**
1. Medir paralelización real de 12 shards
2. Revisar si 12 es óptimo o excesivo
3. Ajustar si es necesario

**Riesgo:** BAJO  
**Reversibility:** ALTA

---

## 💰 RESUMEN DE OPORTUNIDADES

| Auditoría | Ahorro Estimado | Esfuerzo | ROI | Status |
|-----------|-----------------|----------|-----|--------|
| #3 Inngest | $0-100/mes (libre) | ✅ HECHO | ⭐⭐⭐⭐⭐ | COMPLETADA |
| #4 Supabase | $50-200/mes | 1-2 sem | ⭐⭐⭐⭐ | NEXT |
| #5 Vercel | $200-500/mes | 2-3 sem | ⭐⭐⭐⭐ | AFTER #4 |
| #6 GitHub | $10-50/mes | 3-5 días | ⭐⭐ | OPTIONAL |

**Total Oportunidad:** ~$260-750/mes (cost) + UX/performance improvements

---

## ⚠️ LIMITACIONES & NOTAS

- **Sin acceso a dashboards en vivo** — auditorías basadas en análisis estático
- **SELECT * (#4)** requiere TypeScript refactor para máxima ganancia (mapper types)
- **API routes (#5)** es refactor de riesgo MEDIO → requiere tests exhaustivos antes de deploy
- **god-file split (#1)** está DESCARTADA per CLAUDE.md (decisión proyecto cerrada)

---

## 📝 DOCUMENTACIÓN GENERADA

- `PERFORMANCE_AUDIT.md` — Auditoría completa de infraestructura
- `TOP_10_PROBLEMAS.md` — Ranking de 10 problemas principales
- `INNGEST_AUDIT.md` — Análisis detallado de 14 jobs
- `AUDIT_ROADMAP.md` — Este documento (roadmap ejecutivo)

---

**Siguiente paso:** ¿Empezar con Sprint 1 (Supabase SELECT *)?
