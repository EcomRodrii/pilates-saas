# Auditoría semanal de Tentare — 29 jul 2026

> Segunda pasada de auditoría automatizada. No se ha programado ninguna funcionalidad nueva.
> **Alcance:** 752 archivos TS/TSX · ~117.600 líneas en `app/`, `components/`, `lib/`. Stack: Next.js 16.2.9 · React 19 · Supabase (Postgres + RLS) · Stripe Connect/Billing/Terminal · Inngest · Resend · Sentry.
> **Método:** `tsc` (verificación por lotes), 1.102 tests unitarios, Sentry (14 d) y una pasada de lectura profunda de bugs/seguridad sobre el estado ACTUAL del código.

---

## 0. Contexto: el código avanzó mucho desde la última auditoría

El repositorio pasó del commit #384 al #509 (~125 commits). Buena parte de los hallazgos de la pasada anterior **ya están resueltos por el equipo**: el flujo "asignar plan" ahora espera cada escritura y comprueba resultados, la página pública de reservas se rediseñó, se endureció la seguridad (RLS, anon, extensiones — #508), y la mayoría de rutas API validan JWT + **rol** (`puedeMoverDinero`, `puedeGestionarClientas`) además de autenticación. La suite de tests creció de 850 a **1.102**. Crédito donde toca.

### Salud objetiva (hoy)

| Señal | Resultado |
|-------|-----------|
| Tests unitarios | ✅ 1.102/1.102 pasan |
| `tsc` (archivos tocados) | ✅ 0 errores |
| Errores en Sentry (14 d) | 🟢 2 issues, 1 evento cada uno (ver §2.1 y §3) |
| God-files | ⚠️ crecieron: `supabase-data.ts` 5.557, `studio-context.tsx` 3.475, `calendario` 2.786 |

---

## 1. Correcciones aplicadas en esta pasada (verificadas)

Seis fixes quirúrgicos, todos verificados con `tsc` + los 1.102 tests en verde. Cambios *estrictamente aditivos*: no pueden impedir una acción legítima, sólo su repetición accidental.

| # | Archivo | Qué se arregló |
|---|---------|----------------|
| 1 | `lib/studio-context.tsx` | **🔴 Doble cobro / doble factura fiscal (raíz).** `marcarCobrado` no era reentrante: dos clics en "Cobrar" del mismo recibo capturaban estado obsoleto y **sellaban dos facturas con número fiscal** para un único cobro. Añadido **cerrojo de re-entrada por `reciboId`** (`Set` en `useRef`): bloquea el segundo disparo del mismo recibo y deja pasar ids distintos (cobro masivo) en paralelo. Corrige de raíz el botón del dashboard **y** el del panel de cobros a la vez. |
| 2 | `components/cobros/panel-pendientes.tsx` | **🔴 Doble cobro masivo.** El guard `masivoProgress === 'running'` lee estado async y un doble clic lo pasaba dos veces. Cerrojo síncrono `useRef` + `try/finally`. |
| 3 | `app/reservar/[slug]/page.tsx` | **🔴 Doble reserva pública.** `handleConfirm` (alta de walk-in + reserva) sin bloqueo. Cerrojo `useRef` + botón `disabled` con feedback "Confirmando…". |
| 4 | `app/(dashboard)/calendario/page.tsx` | **🟠 Doble aviso a las alumnas.** `editarSesion`/`editarSerie` nunca activaban `guardandoSesion`, así que el `disabled` del botón era inútil: un doble clic reescribía dos veces y **reenviaba el email de "clase modificada" a todas las apuntadas** (en una serie, a toda la serie). Añadido el flag + `try/finally` como en `crearSesion`. |
| 5 | `app/api/public/migracion-concierge/route.ts` | **🟡 Inyección HTML** en el email interno de leads: `email` se incrustaba sin escapar (la regex admite `<`/`>`/`"`). Añadido `esc()` sobre `email` y `software`. |

> Nota de diseño: el cerrojo #1 cubre el doble clic humano (el vector reportado). Un doble cobro entre **dos pestañas/dispositivos** distintos necesitaría además una escritura condicional en BD (`UPDATE … WHERE estado = 'PENDIENTE'`); queda recomendado en §4.

---

## 2. 🔴 Crítico (pendiente — recomendado priorizar)

### 2.1 Recibo cobrado que viola FK y queda perdido — **visto en producción**
Sentry `dbInsertRecibo` **23503**: `insert on "recibos" violates foreign key "recibos_suscripcion_id_fkey"` (ruta `/clientas/:id`, 1 evento hace 1 día). Varias inserciones de recibo se lanzan **fire-and-forget** referenciando un `suscripcion_id` que no está garantizado en BD — p. ej. `lib/studio-context.tsx:1859` (renovación por bono agotado) hace `dbInsertRecibo(reciboRenovacion)` sin `await` ni comprobación, con `suscripcionId: sus.id` tomado del estado local. Si esa suscripción no está persistida (creada optimista y fallida, o carrera), el insert del recibo **falla en silencio** y el cobro no queda registrado. **Acción:** persistir la suscripción antes que el recibo (o transaccional), y **await + manejo de error** en todos los `dbInsertRecibo`. Es la misma raíz que el estado optimista sin rollback.

### 2.2 Bono cobrado que queda en una ficha huérfana (webhook de compra)
`lib/billing/entregar-plan-comprado.ts:86-133`. Los ids de suscripción/recibo son deterministas por `sessionId`, pero el `socioId` se resuelve dinámicamente. Si Stripe reenvía el webhook después de que la socia se registre por su cuenta (mismo email, id distinto), la 2ª entrega choca por PK (`23505`) y se ignora → **la suscripción/bono ya cobrado sigue apuntando a la ficha huérfana** que la socia nunca ve. Dinero cobrado, bono inaccesible. **Acción:** reconciliar la ficha huérfana con la socia real por email al registrarse, o resolver el `socioId` de forma estable antes de generar los ids.

### 2.3 Informes/KPIs sobre datos truncados a 1000 filas *(persiste)*
`lib/supabase-data.ts`: la carga global sigue con `select('*')` sin `.range()`/`.limit()` (~155 ocurrencias). PostgREST **trunca en silencio a 1000 filas**: con un estudio de >1 año, informes y dashboards se calculan sobre una muestra parcial **sin error**. No es lentitud, es incorrección. **Acción:** paginar o bajar la agregación a Postgres (RPC/vistas), empezando por los informes de dinero.

---

## 3. 🟠 Importante

| Ref | Hallazgo | Acción |
|-----|----------|--------|
| I-1 | **Avalancha de emails al activar `RENOVACION_COBRADA`** (`lib/engines/automation-engine.ts:469-471`): el único filtro es `estado === 'COBRADO'`, sin ventana de recencia (a diferencia de las demás reglas). La primera vez que un estudio activa la regla, manda "Renovación confirmada" por **cada recibo cobrado de toda su historia**. | Añadir ventana de recencia como en `AUSENCIA_DIAS`/`PAGO_PENDIENTE`. |
| I-2 | **Aviso de plaza liberada que nunca se reintenta** (`lib/inngest/confirmacion-riesgo.ts:299-309`): la cancelación es compare-and-set; si el email falla, Inngest reintenta pero la reserva ya está cancelada → sale sin reenviar. La socia pierde la plaza y no recibe aviso. Mismo patrón en `lib/inngest/valoraciones.ts:89-121`. | Separar el envío en su propio `step.run` idempotente. |
| I-3 | **Doble-submit en la ejecución de migración** (`app/(dashboard)/migracion/page.tsx:627`): el botón sólo se deshabilita por `totalOk === 0`, no por estar ejecutando → dos importaciones con `batchId` distintos = altas duplicadas. | Guard `useRef`/`disabled` en `ejecutar` (mismo patrón que los fixes de esta pasada). |
| I-4 | **`now = new Date()` rompe la memoización del dashboard** (`app/(dashboard)/dashboard/page.tsx:433`): objeto nuevo en cada render, está en las deps de ≥5 `useMemo` pesados (`sparkData`, `ocupacionMedia`, MRR, `huecosProximos`, `candidatasPorSesion`) → recalculan en cada render, incluso al abrir un toast. | Fijar `now` en `useMemo`/estado. |
| I-5 | **O(n²) en la ocupación semanal** (`dashboard/page.tsx:524-532`): `.filter` sobre todas las reservas dentro de un `.reduce` por sesión, agravado por I-4. | Indexar reservas por `sesionId` con `Map`. |
| I-6 | **Rutas financieras sólo con autenticación, no rol** *(parcial — el equipo ya cubrió las principales)*: revisar que `stripe/charge-off-session`, `stripe/pos-bizum`, `mensajes/send` exijan rol, como ya hacen `terminal/cobrar`, `facturas/sellar`, `emails/send`. | Homogeneizar la revalidación de rol. |

---

## 4. 🟡 Mejora

| Ref | Hallazgo | Acción |
|-----|----------|--------|
| M-1 | **God-files creciendo** (`supabase-data.ts` 5.557, `studio-context.tsx` 3.475). Cada feature nueva toca archivos de miles de líneas → riesgo de regresión alto. | Trocear por dominio + bajar agregación/negocio a servidor. Deuda nº1 de mantenibilidad. |
| M-2 | **Doble cobro entre pestañas/dispositivos**: el cerrojo aplicado (§1.1) cubre el doble clic; la escritura de cobro no es condicional al estado. | `UPDATE recibos SET estado='COBRADO' WHERE id=? AND estado='PENDIENTE'` y actuar según filas afectadas. |
| M-3 | **`.find` lineales dentro de `.map`** en el dashboard (`:567-580`) pese a existir `tipoClaseById`/`socioById`. | Usar los índices ya construidos. |
| M-4 | **Estados que congelan el día a medianoche** (`dashboard/page.tsx:619`, `automationBriefing`): `today` sólo se recalcula al cambiar `automationLogs`. | Recalcular con la fecha viva. |
| M-5 | **Crons secuenciales por tenant** en una invocación (`cron/recordatorios`, `revisiones-salud`, `maxDuration=300`) — parche documentado. | Fan-out Inngest por tenant antes del primer estudio mediano. |

---

## 5. Verificado como correcto (crédito donde toca)

- Rutas financieras/mutantes revisadas (`terminal/cobrar`, `facturas/sellar`, `socios/eliminar`, `ingresos-manuales`, `emails/send`) **comprueban rol** además de autenticación.
- Rutas públicas (`reserva`, `canje`, `pase`, `renovar-plan`, `socio`, `baja`) derivan la identidad del **JWT/token firmado** y validan pertenencia — sin IDOR ni endpoints mutantes sin auth.
- Webhooks Stripe: firma verificada, idempotencia por `event.id`, tenant desde `event.account`.
- Los archivos `.frozen.tsx` son un mecanismo **deliberado** de feature-freeze (`lib/frozen-features.ts`), no código muerto.
- El 2º issue de Sentry (`TypeError: Load failed` en `/dashboard`) es un fallo de red del cliente, no un bug de código.

---

## 6. Plan recomendado (orden de ataque)

1. **Cerrar los 🔴 de datos/dinero** (§2): await + orden correcto en los `dbInsertRecibo` (2.1, confirmado en producción), reconciliar la ficha huérfana del webhook (2.2), y paginar/agregar los informes truncados (2.3).
2. **Robustez de avisos** (§3): ventana de recencia en `RENOVACION_COBRADA` (I-1) y reintento idempotente del email de plaza liberada (I-2) — tocan la confianza de la clienta.
3. **Doble-submit restante** (I-3 migración) y **memoización del dashboard** (I-4/I-5).
4. **Romper los god-files** (M-1) y bajar agregación a Postgres — desbloquea velocidad y corrige informes.

Cada punto deja el producto más simple y mantenible; ninguno añade superficie nueva.

---

*Generado por la auditoría automatizada de Tentare (2ª pasada). Fixes 1-5 de la §1 aplicados y verificados (`tsc` + 1.102 tests). El resto queda documentado para priorización.*
