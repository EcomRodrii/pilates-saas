# Auditoría semanal de Tentare — 27 jul 2026

> Auditoría automatizada de calidad, arquitectura y seguridad. No se ha programado ninguna funcionalidad nueva.
> **Alcance:** 664 archivos TS/TSX · ~102.000 líneas en `app/`, `components/`, `lib/`. Stack: Next.js 16.2.9 · React 19 · Supabase (Postgres + RLS) · Stripe Connect/Billing/Terminal · Inngest · Resend · Sentry.
> **Método:** `tsc --noEmit`, `eslint`, 850 tests unitarios, Sentry (14 d), y tres pasadas de lectura profunda del código (capa de datos, UI, API/seguridad).

---

## 0. Veredicto en una frase

**Tentare está sano en lo fundamental y maduro en seguridad y corrección del dinero; los riesgos abiertos son de *robustez* (dobles envíos en flujos de cobro/reserva) y de *arquitectura* (god-files y negocio en el cliente), no de solidez básica.** El tipado compila limpio, los 850 tests pasan y producción sólo ha registrado **1 error en 14 días**. La deuda no es "está roto", es "está construido de una forma que costará mantener y que puede cobrar/reservar dos veces bajo un doble clic".

### Salud objetiva

| Señal | Resultado |
|-------|-----------|
| `tsc --noEmit` (código fuente) | ✅ 0 errores |
| Tests unitarios (`node --test`) | ✅ 850/850 pasan |
| Errores en Sentry (14 d) | 🟢 1 issue, 1 usuario, 1 evento (ruta ya congelada) |
| `console.log` en fuente | ✅ 0 |
| `as any` | ✅ 4 (uso muy disciplinado) |
| `select('*')` sin acotar | ⚠️ 155 ocurrencias |

---

## 1. Correcciones aplicadas en esta pasada

Se han corregido **los dos bugs críticos de doble-ejecución sobre dinero/reservas**, con cambios quirúrgicos y verificados (`tsc` limpio + 850 tests en verde). No se ha tocado lógica fiscal ni de base de datos, por prudencia en una ejecución desatendida.

| # | Archivo | Qué se arregló |
|---|---------|----------------|
| C-1 | `components/cobros/panel-pendientes.tsx` | **Doble cobro masivo.** El guard anterior (`masivoProgress === 'running'`) lee estado asíncrono: un doble clic rapidísimo pasaba el guard dos veces y cobraba el lote entero por duplicado (N facturas + N renovaciones, irreversibles). Añadido **cerrojo síncrono (`useRef`) + `try/finally`** que libera el cerrojo pase lo que pase. |
| C-2 | `app/reservar/[slug]/page.tsx` | **Doble reserva en el flujo público.** `handleConfirm` es async (alta de walk-in `soc-…` + `addReserva`) y el botón no se bloqueaba: doble clic daba de alta dos fichas y/o reservaba dos veces. Añadido cerrojo `useRef` + estado `confirmando`, botón `disabled` con feedback "Confirmando…". |

> Ambos cambios son *estrictamente aditivos*: no pueden impedir un envío legítimo, sólo el segundo disparo del mismo. Verificados con `tsc` y la suite completa.

---

## 2. 🔴 Crítico (pendiente — recomendado priorizar)

### 2.1 Marcar recibo como cobrado desde un parámetro de la URL
`components/cobros/panel-pendientes.tsx:182-196`. Se marca un recibo como **cobrado** confiando en `?stripe_success=1&recibo=X`. Cualquiera que fabrique esa URL marca un recibo como pagado **sin cobro real**. La confirmación de pago debe venir del **webhook de Stripe** (que ya existe y es sólido), nunca del navegador. **Acción:** eliminar el marcado optimista por query-param; al volver del checkout, releer el estado del recibo del servidor (el webhook ya lo habrá actualizado).

### 2.2 Efecto secundario dentro del updater de `setState` → doble sellado de factura
`lib/studio-context.tsx:1211-1215` y `2246-2250`:
```ts
setFacturas(prev => {
  const fac = buildFactura(reciboCobrado, prev);
  void sellarFacturaYActualizar(fac);   // ← efecto dentro del updater
  return [...prev, fac];
});
```
El updater de `setState` debe ser **puro**. En StrictMode (dev) se ejecuta dos veces → **doble sellado / doble factura fiscal**; en producción, cualquier reintento concurrente de React lo reproduce. El propio código ya tiene el patrón correcto extraído (`construirFacturaCobro`, línea 2024). **Acción:** calcular la factura fuera del updater, sellar una sola vez, y luego `setFacturas`.

### 2.3 Informes y KPIs sobre datos truncados a 1000 filas
`lib/supabase-data.ts:1212-1273, 1352-1357`. La carga global hace `select('*')` de `reservas`, `recibos`, `facturas`, `ventas_pos`, `sesiones`, `credit_transactions`… **sin `.range()`/`.limit()`**. PostgREST **trunca en silencio a 1000 filas**: un estudio con >1000 reservas recibe datos incompletos **sin error**, y todos los informes/gráficos se calculan sobre una muestra parcial. **No es lentitud, es incorrección** — el peor tipo de bug porque erosiona la confianza en los números. **Acción:** paginar o, mejor, bajar la agregación a Postgres (RPC/vistas), empezando por los informes de dinero.

### 2.4 Errores de consulta tragados en la carga global
`lib/supabase-data.ts:1283-1330`. Cada resultado se mapea como `(xRes.data ?? []).map(...)` **sin mirar `xRes.error`**. Si la consulta de `reservas` falla (timeout, RLS), la app pinta "0 reservas" en lugar de un error. Combinado con 2.3, los fallos parciales de datos son **invisibles**. **Acción:** propagar `xRes.error` y mostrar estado de error en vez de datos vacíos.

### 2.5 Estado optimista sin rollback en el alta de socia
`lib/studio-context.tsx:1194-1222`. Se hace `setSuscripciones`/`setRecibos`/`setFacturas` **antes** de la escritura; si `dbInsertSocio` falla se hace `return` pero el estado local ya contiene socia + suscripción + recibo + factura **que no existen en BD y nunca se revierten**. La UI miente hasta recargar. Además, `dbInsertSuscripcion`/`dbInsertRecibo` se lanzan sin comprobar su resultado. **Acción:** revertir el estado optimista si la escritura falla, o escribir primero y confirmar después.

---

## 3. 🟠 Importante

### Arquitectura / capa de datos

| Ref | Hallazgo | Acción |
|-----|----------|--------|
| A-1 | **God-files.** `lib/supabase-data.ts` (5.200 líneas, ~197 exports — el "backend" entero en un módulo) y `lib/studio-context.tsx` (3.223 líneas, ~50 `useState` de arrays, un `useMemo` con ~50 dependencias que re-renderiza toda la app ante cualquier mutación). | Trocear por dominio (`data/reservas.ts`, `data/socios.ts`…) y en stores/contextos por dominio (ya empezado con `content.`, `integrationsStore.`). |
| A-2 | **`STUDIO_ID` singleton mutable de módulo** (`lib/supabase-data.ts:159`). En servidor (crons/Inngest/API que importan el mismo módulo) dos peticiones concurrentes **se pisan el tenant**. Mitigado hoy por `.eq('studio_id', sid)` explícito, pero es una landmine. | Eliminar a favor de paso explícito de `studioId`. |
| A-3 | **Hidratación de estado duplicada 3-4 veces** (`studio-context.tsx:610-652, 698-766, 3124-3157`). El mismo bloque de ~40 `setX(data.x)`; una tabla nueva hay que añadirla en todos los sitios. | Unificar en una sola función de hidratación. |
| A-4 | **Boilerplate de `fetch` repetido ~59 veces** en `lib/api-client.ts`, con manejo de error ya divergente entre funciones (`734` `catch { return [] }`, `748` `catch { return false }`). | Un `apiFetch()` compartido con manejo de error/errores único. |
| A-5 | Carga de tablas append-only sin acotar (`automation_logs:1237`, `credit_transactions:1353`) — reconocido en comentarios. Crece sin fin, se trae todo el histórico al navegador en cada arranque. | Acotar por fecha / agregar en servidor. |

### Rendimiento en cliente

| Ref | Hallazgo | Acción |
|-----|----------|--------|
| P-1 | **`now = new Date()` recreado en cada render** rompe TODA la memoización del dashboard: está en las deps de ≥6 `useMemo` pesados (`dashboard/page.tsx:427,449,527,557,599,608,657`). Mismo antipatrón en `calendario/page.tsx:1333` y `reservar/[slug]/page.tsx:236`. | Fijar `now` en `useState`/`useMemo` (o recalcular con un intervalo controlado). |
| P-2 | **O(n²) por `find` dentro de `.map`** en listas: `panel-pendientes.tsx:780-786`, `panel-facturas.tsx:47-51`, `marketing`, `reservar`, `dashboard`. | Indexar con `Map` (ya se hace en otros puntos del propio código — aplicar el mismo patrón). |
| P-3 | **`fetch` de IA/Stripe sin `AbortController`**: al cambiar de clienta/clase, la respuesta stale se pinta sobre otra entidad (`clientas/[id]/page.tsx:393-415`, `calendario:381-403`, `marketing:700-724`). | Cancelar con `AbortController` por clave de entidad. |

### UX / robustez

| Ref | Hallazgo | Acción |
|-----|----------|--------|
| U-1 | **Carga inicial sin `.catch`** deja spinner eterno si la API falla (`sustituciones/page.tsx:79-84`; `setCargando(false)` sólo en éxito). | `try/finally` o `.catch` con estado de error + reintento. |
| U-2 | **Banner de resultado siempre verde**, incluso en error (`marketing/page.tsx:831-835`: contenedor `bg-success/10` fijo pero recibe también mensajes de error). | Color según éxito/fallo. |
| U-3 | **Acciones destructivas de un clic sin confirmación y sólo visibles en hover** (`marketing:948,1013,1258,932`; `panel-pendientes.tsx:862-888` `marcarDevuelto`; `dashboard:358-364` cancelar). Inalcanzables en tablet (la recepción usa iPad) y por teclado. | `ConfirmDialog` (ya existe y se usa en `clientas`/`equipo`) + acciones siempre visibles o accesibles. |
| U-4 | **Botones async sin bloqueo** más allá de los ya corregidos: `clientas/[id]:1533` (`handleDelete` → doble baja; además usa `window.location.href` en vez de `router`), `clientas/page.tsx:1118-1128`. | Cerrojo `useRef`/`disabled` como en C-1/C-2. |

### Autorización (intra-tenant)

| Ref | Hallazgo | Acción |
|-----|----------|--------|
| S-1 | **IDOR de escritura**: `notifications/subscribe/route.ts:25-35` y `preferences/route.ts:37-48` toman `studio_id` del **body** sin validar pertenencia (único sitio donde se rompe el patrón "tenant desde el servidor"). Sin rate-limit. | Derivar `studio_id` del servidor / validar pertenencia. |
| S-2 | **Rutas financieras que sólo exigen autenticación, no rol**: `stripe/charge-off-session`, `stripe/pos-bizum`, `terminal/cobrar`, `emails/send`, `mensajes/send`, `facturas/sellar`. Una instructora (rol mínimo) puede ejecutarlas. El dinero va a la cuenta Connect del propio estudio (no es robo cross-tenant), pero es escalada de privilegio intra-tenant. | Revalidar `sesion.rol` en servidor, como ya hacen `backups/restore`, `kiosk/token`, `theme`, etc. |
| S-3 | **`emails/send` y `mensajes/send` sin rate-limit ni validación de destinatario**: envían a cualquier email/teléfono del body con las credenciales del estudio (vector de spam). | Validar que el destinatario sea socia del estudio + `enforceRateLimit`. |

---

## 4. 🟡 Mejora

| Ref | Hallazgo | Acción |
|-----|----------|--------|
| M-1 | **Duplicación de helpers/UI** entre páginas: constantes `FF`/`inputCls`/`selectCls` (`marketing:19-30` ≡ `clientas/[id]:95-106` ≡ `equipo:42-43`), `formatHora`/`fmtHora`, componente `Estrellas` (`equipo:715` vs `sustituciones:437`), export CSV y agrupación por mes (`panel-pendientes` ≡ `panel-facturas`). | Centralizar en `lib/format` y `components/ui`. |
| M-2 | **Dinero con floats** en UI: `panel-pendientes.tsx:1478,1482` (`parseFloat(importe) * iva/100`), `.reduce` de importes, `panel-facturas.tsx:86-99`. Base + IVA redondeados por separado pueden no cuadrar. | Trabajar en céntimos (enteros) en la UI, como ya se hace en la BD (`numeric(10,2)`). |
| M-3 | **`await req.json()` sin `catch`** → 500 opaco en vez de 400 (`emails/send:28`, `stripe/charge-off-session:32`). | `.catch(() => null)` como el resto de rutas. |
| M-4 | **Comparación de `CRON_SECRET` no constante en tiempo** (`cron/*`: `auth !== \`Bearer ${secret}\``) — incoherente con `oauth-state.ts` que usa `timingSafeEqual`. | Unificar con `timingSafeEqual`. |
| M-5 | **Inyección HTML en email interno** `public/migracion-concierge:32` (interpola `email` sin escapar; `EMAIL_RE` admite `<`/`>`). Destinatario interno → severidad baja. | Escapar como en `soporte/route.ts` (`esc()`). |
| M-6 | **Keys por índice / por nombre** en listas que se regeneran (`calendario:611-650`, `panel-facturas:121,264` usa el nombre del receptor → homónimos colisionan). | Usar ids estables. |
| M-7 | **Crons secuenciales por tenant en una invocación** (`cron/recordatorios`, `revisiones-salud`, `maxDuration=300`) — parche documentado (P0-37). Primer muro de escala. | Fan-out Inngest por tenant. |
| M-8 | **RLS 42501 al crear canal de equipo** (Sentry, `dbCreateCanalEquipo`, ruta `/chat` — **ya congelada**). Causa: el store crea el canal "General" en cliente al montar (`use-team-chat-store.ts:55`) y RLS lo rechaza cuando `current_studio_id()` no coincide. Bajo impacto (1 evento), ya mitigado por la congelación. | Al reactivar `/chat`: crear el canal en servidor (service_role) o al crear el estudio, no en cliente. |
| M-9 | **`tsconfig.json`/`eslint` incluyen `.claude/worktrees/**`** (copias completas del repo), lo que hace que `tsc` y `eslint` tarden minutos localmente. | Añadir `.claude` a `exclude`/`ignores` (sólo higiene local; los worktrees ya están en `.gitignore`). |

---

## 5. Verificado como correcto (crédito donde toca)

- **Los archivos `.frozen.tsx` NO son código muerto.** Son un mecanismo deliberado y documentado de *feature-freeze* (`lib/frozen-features.ts`): la ruta se sirve con un stub `page.tsx` y la implementación real se conserva en `page.frozen.tsx` con ruta de reactivación explícita. **No deben borrarse.**
- **Seguridad de webhooks Stripe sólida**: firma verificada (plataforma + Connect), idempotencia por `event.id`, tenant derivado de `event.account` (no de metadata manipulable), importe/concepto siempre desde BD.
- **OAuth** (`stripe/connect`, `google-calendar`, `zoom`, `gmail`): `state` firmado HMAC con TTL y `timingSafeEqual` — sin CSRF de binding.
- **Endpoints públicos** con token firmado o JWT (`public/*`, `reservar`, `portal`, `checkin`): identidad siempre del token, nunca del body. Sin inyección SQL/PostgREST.
- **Errores de servidor** no filtran mensajes de Postgres al cliente (`errores-servidor.ts`).
- **850 tests** cubren bien la lógica pura (bono, booking, billing, verifactu, rate-limit, contraste).

---

## 6. Plan recomendado (orden de ataque)

1. **Cerrar los 🔴 restantes de dinero/datos** (§2): quitar el marcado de cobro por URL (2.1), sacar el sellado del updater (2.2), y paginar/agregar los informes truncados (2.3-2.4). *Máximo impacto en confianza.*
2. **Romper `supabase-data.ts` y `studio-context.tsx`** por dominio y bajar agregación a Postgres (A-1, 2.3). *Desbloquea velocidad de desarrollo y corrección de informes.*
3. **Revalidar rol en las rutas financieras** (S-2) y cerrar el IDOR de notificaciones (S-1).
4. **Barrido de robustez UI**: cerrojos anti-doble-envío restantes (U-4), estados de error/carga (U-1), confirmaciones y accesibilidad de acciones destructivas (U-3).
5. **Fan-out de crons** (M-7) antes de que el primer estudio mediano lo note.

Cada punto deja el producto más simple y mantenible; ninguno añade superficie nueva.

---

*Generado por la auditoría automatizada de Tentare. Correcciones C-1 y C-2 aplicadas y verificadas en esta pasada; el resto queda documentado para decisión y priorización.*
