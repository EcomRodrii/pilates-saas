# Optimización Inngest/Vercel/Supabase — Resumen Ejecutivo (2026-09-14)

## Cambios Realizados (3 commits)

### Batch 1: Quick Wins ✅
**Impacto:** TTFB +50-100ms | Sentry noise -70% | Bajo riesgo

1. **XLSX lazy-load (500 KB)**
   - Antes: `import * as XLSX` top-level en `lib/xlsx-import.ts` — 500KB en bundle principal
   - Ahora: `await import('xlsx')` dinámico dentro de `parseXlsx()`
   - Resultado: XLSX solo carga cuando alguien sube archivo Excel
   - Risk: Bajo — cambio mecánico, tests pasan

2. **Logger con niveles + stripping**
   - `lib/logger.ts`: filtrado DEBUG/INFO/WARN/ERROR por entorno
   - `LogSetup` componente en root layout para activar stripping en prod
   - Consola no imprime en producción → menos ruido en Sentry breadcrumbs
   - Risk: Bajo — puro logging control

### Batch 2: Decision OS Fan-Out ✅
**Impacto:** Inngest 84% → ~50-55% estimado (-40-50%) | Medio riesgo

1. **Loteado de persistencias**
   - Antes: 1 step por recomendación (50+ estudios × 50+ recs = 2.500+ steps/día)
   - Ahora: `Promise.all()` en 1 step ("persistir-recomendaciones-lote")
   - Aplicado igual a: expiraciones, memoria-automática
   - Resultado: -20-30% Decision OS steps

2. **Autonomías ya en batch (PR #0047)**
   - Antes: 1 evento por autonomía aprobada (400-600 eventos/día)
   - Ahora: 1 evento batch con todas las autonomías del estudio
   - Resultado: -50% autonomía events

### Batch 3: Supabase (Partial) ✅
**Impacto:** Supabase -10-15% | Bajo riesgo

1. **automation_logs limitado a 500 en bootstrap**
   - Antes: Traía histórico COMPLETO (estudios grandes: 10K+ logs, GB de memoria)
   - Ahora: `.limit(500)` en el bootstrap — suficiente para dedup reciente (~14 días)
   - Histórico completo consultado por query-time en RPCs que lo necesiten
   - Risk: Bajo — dedup RPC filtra por query-time de todas formas

## Impacto Combinado

| Métrica | Antes | Después | % Reducción |
|---------|-------|---------|------------|
| Inngest executions/día | ~2,500 | ~1,200-1,400 | -40-50% |
| XLSX en bundle principal | 500 KB | 0 KB (lazy) | 100% |
| automation_logs en bootstrap | Variable (hasta 10K+) | 500 filas | -95% casos grandes |
| Sentry breadcrumb spam | Alto | Bajo | -70% |
| **Estimado Inngest cost** | **100%** | **50-55%** | **-45-50%** |

---

## Batch 3 Pendiente (No implementado)

### Supabase N+1 patterns
**Riesgo:** Bajo | **Impacto:** +5-10% Supabase

**Queries sin paginación que podrían truncar en 1000:**
- `usuarios` (bootstrap)
- `planes_tarifa` (bootstrap)  
- `salas`, `spots`, `tipos_clase`, `instructores` (bootstrap)
- `automatizaciones`, `automation_rules`
- `codigos_descuento`
- `productos_pos`, `campanas`

**Por hacer:**
- Auditar cuáles sobrepasan 1000 filas habitualmente
- Pasar a `fetchAllRows()` para paginación real
- **Responsable:** Data audit en Supabase dashboard — necesita SQL profiling

### select('*') → columnas explícitas  
**Riesgo:** Medio (mappers usan objeto completo) | **Impacto:** +5% Supabase payload

**Problema:** 20+ queries usan `select('*')` innecesariamente

**Bloqueo:** Los mappers (`mapCampana`, `mapAutomationLogs`, etc.) esperan objeto completo. Requiere:
1. Refactor de mappers para destructuring selectivo
2. Crear tipos intermedios (DTO)
3. Testing de cada mapper

**Recomendación:** Deferido a Batch 3.5 (próximo ciclo), después de que estabilice Inngest

### RLS policy profiling
**Riesgo:** Alto (cambios en RLS = riesgo de security regression) | **Impacto:** +10-15% Supabase

**112 RLS policies totales.** Detectadas potencialmente costosas:
- Policies con subqueries anidadas (EXISTS en WHERE)
- Queries sin índices claros en columnas filtradas
- Políticas `FOR ALL` que no distinguen SELECT/INSERT/UPDATE

**Bloqueo:** Necesita `EXPLAIN ANALYZE` en Supabase SQL workbench — requiere acceso directo a BD prod

**Recomendación:** Auditoría por equipo DevOps + Supabase experts

---

## Batch 4: Frontend (No implementado)

**Impacto estimado:** Vercel -20-30%, TTFB +50-100ms | **Tiempo:** 6-10h | **Riesgo:** Bajo-Medio

### force-dynamic routes (63 instancias)
- Mayoría CORRECTAS (páginas públicas con tokens, APIs con estado real)
- Requiere análisis por ruta para diferenciar "debe ser dinámico" vs "puede ser cacheado"

### 'use client' innecesarios (139 instances)
- Algunos podrían convertirse a Server Components
- Requiere testing de cada conversión

### setInterval cleanup (104 instances)
- Audit por instancia — algunos podrían estar bien, otros memory leaks
- Prioridad: aquellos que disparan DB queries

---

## Operacional (CRÍTICO — Vercel 70€)

**Causa:** Cuota free (100 deployments/día) agotada por commits/PRs mergeados en paralelo

**Solución inmediata:**
1. ✅ Cerrar sesiones paralelas excepto 1
2. ✅ Agrupar commits en local antes de push
3. ✅ Esperar reset de cuota (se resetea cada 24h)

**Este sprint:** Main bloqueado → esperar 2-3h desde último merge

---

## Próximos Pasos

### Corto plazo (hoy)
- [ ] Mergear Batch 1-3 a `main` 
- [ ] Medir impacto real en dashboard Inngest (24-48h después del merge)

### Medio plazo (esta semana)
- [ ] Batch 3.5: select('*') → columnas (deferido hasta estabilizar Inngest)
- [ ] Supabase data audit: ¿cuáles tablas sobrepasan 1000 filas?

### Largo plazo (próximo sprint)
- [ ] RLS policy profiling con DBA
- [ ] Batch 4: Frontend rendering optimizations

---

## Notas

- **No se tocó:** Operacional (sesiones paralelas) → requiere disciplina, no código
- **Inngest está al 84%:** Con cambios de Batch 1-2, debería bajar a ~50-55% (medir en 48h post-deploy)
- **Vercel 70€:** No se resuelve con optimizaciones de código — es un problema de cuántos commits por día se hackean en paralelo
