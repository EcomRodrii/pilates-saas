# R3 — Re-plataformado de la capa de datos · Plan por fases

**Origen:** revisión del Executive Board (14 jul 2026). Hallazgo R3 = BLOCKER de escalabilidad.
**Estado:** plan aprobado como referencia; sin ejecutar. Es un programa de ~6-12 meses, incremental.

---

## El problema

Toda la BD del tenant se descarga al navegador y vive en memoria en un god-context:

- `lib/supabase-data.ts` → `fetchCriticalStudioData` carga **42 tablas en un solo `Promise.all`** (`:963-1104`). Seis de alto crecimiento van sin acotar: `sesiones, reservas, recibos, facturas, citas, ventas_pos` (`select('*').eq('studio_id', …)`, sin `.limit()`). Solo los feeds (`actividad_reciente`, `notificaciones`) están capados a 500.
- `lib/studio-context.tsx` (123 KB) mantiene el resultado en **43 `useState`** y expone un value object **sin memoizar** (`:~2449`) → cualquier mutación re-renderiza toda la app.
- **91 componentes cliente, 0 server actions, 0 caché** (salvo un `cache()` en `studio-seo.ts`).

**Consecuencia:** el payload y la memoria crecen con la vida del estudio. Los estudios grandes y valiosos —los que justifican 100M ARR— son los que rompen la app. Techo de escala.

## Restricción de diseño INNEGOCIABLE

`fetchCriticalStudioData` es **dual-use**: corre en navegador (anon key + RLS) **y** en servidor (Inngest/crons con service-role, ver `supabase-data.ts:955-961`). El Decision OS (`construirSnapshot`) y el motor de automatizaciones dependen del path servidor. **Cualquier fase debe preservar el path servidor** o rompe el cerebro de IA y las automatizaciones.

## Principio rector

Incremental, nunca big-bang. Cada fase es desplegable, reversible y **medida**. Se puede pausar entre fases sin dejar el árbol roto.

---

## Fases

### Fase 0 — Medir (1-2 sem) · desbloquea todo
No se optimiza lo que no se mide.
- **Qué:** payload real de `fetchCriticalStudioData` por tenant, JS de primera carga, TTI. Identificar el **estudio más grande** (peor caso) y su volumen por tabla.
- **Cómo:** evento de perf sobre `lib/analytics.ts` (R4) + `count(*)` por tabla del tenant top.
- **Checkpoint:** tabla "tamaño de carga por tenant" + **objetivo numérico** (p.ej. primera carga < 1,5 MB, TTI < 2,5 s).
- **Riesgo:** ninguno (solo medición). **Determina la urgencia real de R3.**

### Fase 1 — Cortar la carga no acotada (2-4 sem) · mayor ROI, menor churn
Ataca el BLOCKER sin tocar el rendering. El inventario de consumidores (abajo) ya está hecho.
- **Ventana reciente/filtrada** (`sesiones`, `citas`, y el slice "hoy" de `ventas_pos`): cambiar `select('*')` por query acotada (`.gte(fecha)` / `.range()`). Cambio mecánico.
- **Agregación histórica** (`recibos`, `reservas`, y totales de `ventas_pos`/`facturas`): crear **endpoint/vista/RPC de agregado en servidor** ANTES de acotar, y que la página llame a eso en vez de iterar el array.
- **`automation_logs`:** unbounded a propósito (índice de dedup, `supabase-data.ts:1028-1032`). Acotarlo reintroduce cobros/emails duplicados → dedup-por-query, no `.limit()`.
- **Checkpoint:** payload del tenant top baja de X a Y MB (Fase 0); cero regresión en informes contra datos reales.
- **Riesgo:** MEDIO — un `.limit()` naïve trunca en silencio. El inventario de abajo es obligatorio antes de tocar cada array.

### Fase 2 — Romper el god-context + memoizar (2-3 sem)
- Partir los 43 `useState` en slices de dominio (reservas, socias, billing, catálogo, gamificación…), cada uno con su provider/hook, y memoizar los value objects. **Ya hay patrón**: el proyecto extrajo `use-team-chat-store`, `use-content-store`, notas de progreso.
- **Checkpoint:** una mutación en una pantalla no re-renderiza las demás (React Profiler).
- **Riesgo:** MEDIO — se hace slice a slice, con tests de que los consumidores siguen leyendo.

### Fase 3 — Páginas read-heavy a Server Components + paginación (6-10 sem) · el re-plataformado de verdad
- Convertir las pantallas de solo-lectura más pesadas a Server Components con paginación/agregación en servidor. Orden por peso (ver ranking abajo): **informes → transacciones → pagos → dashboard charts → calendario → marketing**.
- **Checkpoint:** esas páginas no dependen de los arrays del context; TTI medido por página.
- **Riesgo:** ALTO en esfuerzo, BAJO en reversibilidad (página a página).

### Fase 4 — Caché (1-2 sem)
- `unstable_cache`/`revalidate` para los agregados de Fase 1 y las lecturas públicas. Hoy solo hay un `cache()` (`studio-seo.ts`).

### Fase 5 — Mutaciones a Server Actions (continuo)
- Mover escrituras de "browser-direct + fetch" a Server Actions. **Bonus:** cierra el bypass de RLS del path servidor (hallazgo R8) y desacopla la reserva del navegador (prerrequisito del "estudio autónomo", Fase 4 de la visión de producto).

---

## Secuencia y racional

`0 → 1` primero: **Fase 1 compra el máximo aire con el mínimo riesgo arquitectónico**. `2` arregla la percepción de lentitud. `3` es la estructura grande. **No invertir el orden**: hacer Server Components (Fase 3) antes de acotar datos (Fase 1) sería reescribir páginas que siguen tirando de años de historia.

**Primer paso a aprobar:** Fase 0. Barata, sin riesgo, da el criterio de éxito y dice si R3 es urgente (hay estudios grandes sufriendo) o hay margen para hacerlo con calma mientras se prioriza negocio.

---

## Inventario de consumidores (Fase 1 — punto de partida)

Solo las rutas `(dashboard)` consumen los arrays completos. `portal/**`, `reservar/**`, `kiosk/**` corren en modo `publicSlug` (`studio-context.tsx:506-546`), cargan solo el catálogo + la socia autenticada → **no** son consumidores del dataset no acotado.

### Veredicto por array

| Array | Veredicto | Acción |
|---|---|---|
| **recibos** | 🔴 Necesita agregados en servidor ANTES de acotar | `informes`, `transacciones`, `pagos`, `dashboard` (pendientes), `marketing` (donut), `configuracion` (export CSV) agregan/escanean todo el histórico (sumas, conteos por estado). Crear agregados: ingresos-por-periodo, MRR, total pendiente + conteo por estado. Lista paginada (estado+fecha) para `pagos`. Query por-socia para `socios/[id]`. Export en servidor. |
| **reservas** | 🔴 Necesita agregados en servidor ANTES de acotar | `informes` (ocupación/cohortes/top-5), `calendario` (enriquecido), `socios` (última visita), `marketing` (top clases), `custom-charts` hacen agregación all-time. Exponer conteos de ocupación por sesión y agregados por-socia/periodo en servidor; query acotada "reservas por sesión/ventana" para calendario y ficha. |
| **facturas** | 🟠 Mayormente acotable + un agregado | Consumidores reales: página `facturas` (lista + `.length` + `totalGeneral`) y joins `.find(reciboId)`. Paginar la lista (ya ordenada por fecha), añadir count + total en servidor, joins como lookups puntuales. |
| **ventas_pos** | 🟠 Split por vista | Caja solo necesita **hoy** (`ventasHoy`, acotable). Historial POS (`sortedVentas`) y ledger `transacciones` son full-scan → paginación por día + agregado de totales en servidor. |
| **sesiones** | 🟢 Acotable a rango de fechas | Ningún consumidor necesita el histórico completo sin paginar: todo es ventana de fecha (calendario/dashboard/equipo/citas/search) o `sesionById` (join). Servir por rango (semana/mes visible ± buffer) + lookup ligero por id. |
| **citas** | 🟢 Acotable a próximas/rango | Ambos consumidores (`citas`, `equipo`) van sobre próximas / este-mes / próximos-7-días. Query "citas próximas (+ filtro mes)". Sin histórico en cliente. |

### Páginas más pesadas (prioridad de Fase 3)

1. `app/(dashboard)/informes/page.tsx` — recibos + sesiones + reservas con reduce/cohortes. **El mayor consumidor all-time.**
2. `app/(dashboard)/transacciones/page.tsx` — ledger unificado recibos + ventas_pos + facturas con totales all-time.
3. `app/(dashboard)/pagos/page.tsx` — total pendiente y conteos por estado all-time sobre recibos.
4. `components/dashboard/custom-charts.tsx` + `lib/dashboard-chart-engine.ts` — buckets por periodo; los charts definidos por el usuario multiplican los escaneos.
5. `app/(dashboard)/dashboard/page.tsx` — muchos arrays, casi todo hoy/semana salvo `pendientesTotal` (all-time).
6. `app/(dashboard)/calendario/page.tsx` — mapea todas las sesiones + one-pass sobre todas las reservas.
7. `app/(dashboard)/marketing/page.tsx` — top-clases y revenue-by-plan all-time.

**Los dos bloqueadores duros son `recibos` y `reservas`:** sus consumidores pesados necesitan agregados en servidor (sumas, conteos, retención de cohortes, desgloses por plan/clase) antes de poder soltar los arrays cliente. `sesiones`, `citas` y el slice de caja de `ventas_pos` se mueven a queries acotadas con cambios mecánicos.
