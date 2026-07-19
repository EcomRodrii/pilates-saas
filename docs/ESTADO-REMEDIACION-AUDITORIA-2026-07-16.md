# Estado de la remediación — Auditoría del 15-jul-2026

**Actualizado:** 16 de julio de 2026
**Fuente:** `AUDITORIA-2026-07-15.md` (recorrido de solo lectura de `lib/`, `app/`, `components/`, `supabase/`)

---

## Resumen en una línea

De los hallazgos de la auditoría: **los 5 críticos 🔴 y 12 de los 15 importantes 🟠 están arreglados, mergeados y (los de producción) verificados**. Quedan **3 importantes** (deuda de arquitectura/rendimiento, ninguno de seguridad) y los **10 de "mejora" 🟡** (pulido, sin prisa).

| Severidad | Total | ✅ Hechos | 🟠 Pendientes |
|---|---|---|---|
| 🔴 Crítico | 5 | **5** | 0 |
| 🟠 Importante | 15 | **12** | 3 |
| 🟡 Mejora | 10 | **1** | 9 |

Todo lo crítico está **en producción**. Nada de lo pendiente es un hueco de seguridad ni de dinero.

---

## 🔴 Críticos — TODOS HECHOS ✅

Eran los que bloqueaban una firma de inversión. Todos mergeados en **PR #76** y verificados en producción.

| # | Qué era (en cristiano) | Estado |
|---|---|---|
| **C1** | Dos migraciones con el mismo número (`0014`) hacían que un despliegue limpio pudiera **saltarse la que protege los datos de salud** (GDPR). | ✅ Renumeradas a `0029`/`0030`, aplicadas en prod y registradas en el historial. |
| **C2** | Las tablas de salud (lesiones, embarazo) **nacieron legibles por cualquiera** con la clave pública. | ✅ **Verificado en producción**: un intento de leerlas con la clave anónima devuelve `401 permission denied`. No hay exposición. |
| **C3** | Al dar créditos de fidelidad, se sumaba el saldo **antes** de comprobar el cerrojo anti-duplicados → **créditos duplicados** canjeables. | ✅ El ajuste de saldo va ahora **después** de ganar el cerrojo. |
| **C4** | Al canjear una recompensa, las escrituras iban "a ciegas": si fallaba el cobro de créditos, **la socia se quedaba la recompensa sin pagar**. | ✅ Secuencia atómica con rollback (reservar stock → cobrar → si falla, devolver). |
| **C5** | Al gastar una sesión de bono, se decidía "bono agotado" sobre datos locales viejos → **recibo de renovación perdido o duplicado**. | ✅ Usa la operación atómica del servidor y decide sobre el saldo real. |

> **Evidencia de producción:** `VERIFICACION-RLS-PROD-2026-07-16.md` (prueba de comportamiento contra la API real).

---

## 🟠 Importantes

### Hechos ✅ (12)

| # | Qué era | Dónde |
|---|---|---|
| **I3** | En cada carga en frío la app mostraba "Sin recibos / No hay resultados" y **parecía rota/vacía**. | ✅ **PR #79** — skeleton de carga a nivel de layout. |
| **I15** | La lógica de cobro de recibos estaba **duplicada** en dos funciones (riesgo de que diverjan, p. ej. el guard del bono). | ✅ **PR #80** — extraída a `aplicarRenovacionSuscripcion` + `construirFacturaCobro`. |
| **I10** | En la ficha de socia, el resumen (asistencias, gasto, sparkline…) se **recomputaba en cada tecleo**. | ✅ **PR #81** — extraído a `lib/socio-resumen.ts` y memoizado (con `now` estabilizado). |
| **I11** | En las páginas públicas se montaba el provider completo e **hidrataba datos de staff (incl. salud) en el navegador de un visitante**. | ✅ **Ya remediado** por el "security-proxy Fase 3" (anterior a esta ronda). Verificado 16-jul: en público el provider usa un proxy scopeado (`cargarPublico`), no `fetchCriticalStudioData`; el visitante anónimo recibe solo el catálogo y la socia autenticada solo lo suyo. **`condiciones_salud` ni se consulta** en la ruta pública. |
| **I4** | El envío de recordatorios hacía **miles de consultas** por ejecución (N+1). | ✅ **PR #77** — precarga en lote, consultas constantes. |
| **I6** | Si Stripe cobraba pero fallaba marcar el recibo, **se tragaba el error** y el cobro se descuadraba. | ✅ **PR #76** — se avisa a Sentry para reconciliación. |
| **I7** | Pausar/reanudar una suscripción **no se guardaba** (se perdía al recargar). | ✅ **PR #76** — ahora persiste. |
| **I8** | Guardar preferencias del portal **fallaba en silencio** (columnas mal nombradas). | ✅ **PR #76** — mapeo correcto. |
| **I12** | Se otorgaban logros por reservas que en realidad quedaban en **lista de espera**. | ✅ **PR #77** — se evalúa sobre el estado real. |
| **I13** | Una ruta pública **filtraba datos de socias por email** sin autenticar (enumeración). | ✅ **PR #76** — ruta eliminada. |
| **I14** | **Sin límite de peticiones** en endpoints públicos (fuerza bruta, abuso de coste). | ✅ **PR #78** — rate limiting (Postgres), migración `0031` aplicada y **verificada en vivo**. |
| **I9** | `configuracion/page.tsx` (~2.480 líneas, "God component" con 8 pestañas inline). | ✅ **PRs #84/#85/#86/#87** — las 8 pestañas extraídas a `components/configuracion/`; el page quedó en 303 líneas. Las 8 verificadas renderizando idéntico en producción. |

### Pendientes 🟠 (3) — deuda de arquitectura/rendimiento, no urgente

| # | Qué es | Por qué no se ha hecho aún | Riesgo de arreglarlo |
|---|---|---|---|
| **I1** | Casi toda mutación de la UI escribe "a ciegas" sin revertir en caso de error (patrón sistémico). | Es transversal a toda la app. Los casos que mueven dinero ya se cerraron (C3/C4/C5/I12). | Alto (toca muchísimos sitios). |
| **I2** | El "provider Dios" reconstruye su valor en cada render → **re-renderiza las 38 páginas** ante cualquier cambio. | Es el de mayor impacto de rendimiento, pero también el **más delicado**. | Alto (memoizar mal introduce bugs sutiles de estado). |
| **I5** | Se cargan tablas enteras sin límite. **PARCIAL ✅ (PR #83):** acotados 3 historiales append-only sin consumidor de staff. **Falta:** paginar/agregar socios/reservas/recibos/sesiones y automation_logs (la UI los itera/filtra completos → requiere rediseño en servidor, no un límite naïf). | Medio-alto (truncado). |

---

## 🟡 Mejora — 3/10 resueltos, resto pulido de baja prioridad

**M10 ✅** (PR #82): idempotencia de webhooks por `event.id` (migr. `0032` **aplicada en prod**). **M9 ✅ (ya estaba)**: los `catch` con `err` sin tipar ya se estrecharon en trabajo intermedio (terminal routes, stripe-cobros, inngest/decision) — 0 errores reales de tsc. **M8 ✅ (ya estaba)**: sin `_wtest.tmp`, sin migraciones duplicadas ni colisiones de número, sin `.patch` suelto. Solo queda de M8 mover docs a `docs/` (subjetivo, se deja).

Todos **pendientes**, ninguno urgente. Resumen: helpers de fecha/color/formato duplicados en 6+ páginas (M1), componente `Toast` copiado por página (M2), fetches de IA sin cancelar (M3), datos de estudio hardcodeados como fallback (M4), estados de carga inconsistentes (M5), módulos "Dios" con mappers a mano (M6), hex crudo junto a tokens de tema rompiendo dark-mode (M7), higiene de repo —ficheros temporales y docs sueltos— (M8), `err` sin tipar en `catch` (M9), webhooks sin tabla de dedup por `event.id` (M10).

---

## Cómo se desplegó cada cosa (trazabilidad)

| PR | Contenido | Estado |
|---|---|---|
| **#76** | 🔴 C1-C5 + 🟠 I6/I7/I8/I13 | Mergeado (`2f2a5f4`) |
| **#77** | 🟠 I4 + I12 | Mergeado (`13e097a`) |
| **#78** | 🟠 I14 (rate limiting) + migración `0031` | Mergeado (`466b76f`) + migración aplicada en prod |
| **#79** | 🟠 I3 (skeleton de carga) | Mergeado (`ae1bf98`) |
| **#80** | 🟠 I15 (deduplicar cobro de recibos) | Mergeado (`2f0c18a`) |
| **#81** | 🟠 I10 (memoizar ficha de socia) | Mergeado (`54cf836`) |
| **#82** | 🟡 M10 (idempotencia webhooks) + migración `0032` | Mergeado (`2d0419e`) — **`0032` aplicada y verificada en prod** |
| **#83** | 🟠 I5 parcial (acotar 3 historiales) | Mergeado (`d1d0a16`) |
| **#84** | 🟠 I9 (TabCamposPersonalizados) | Mergeado (`2ae2aa9`) — **verificado en navegador** |
| **#85** | 🟠 I9 (TabPlantillasEmail) | Mergeado (`8fa233f`) |
| **#86** | 🟠 I9 (TabClases + TabSalas) | Mergeado (`298aa8e`) |
| **#87** | 🟠 I9 (TabPlanes + TabIntegraciones + TabEstudio + TabPerfil) — **I9 completo** | Mergeado (`28d81af`) — **verificado en navegador** |

**Aplicado directamente en producción** (vía SQL editor del dashboard, autorizado): historial de migraciones `0029`/`0030`/`0031` + verificación de RLS de salud y del rate limiter.

**Documentos de apoyo:** `DD-TECNICA-TENTARE-2026-07-16.docx` (para el comité) · `VERIFICACION-RLS-PROD-2026-07-16.md` (evidencia de seguridad en prod).

---

## Recomendación de qué hacer después

Ya no queda ningún pendiente de **seguridad/privacidad** (I11 estaba ya resuelto). Lo que queda es rendimiento y mantenibilidad:

1. **I5** (paginación) e **I2** (memoización/splitting del context) — mayor impacto de rendimiento, pero delicados: mejor como esfuerzos dedicados y bien verificados.
2. **I1** y los 🟡 — cuando haya hueco; transversales o de pulido.

Nada de esto bloquea el producto: **toda la remediación crítica e importante-de-seguridad ya está en producción.**
