# Auditoría semanal de Tentare — 10 ago 2026

> Cuarta pasada de auditoría automatizada. **No se ha programado ninguna funcionalidad nueva.**
> **Alcance:** ~722 archivos TS/TSX (263 en `lib/`, 267 en `app/`, 192 en `components/`) · ~121.500 líneas de código fuente. Stack: Next.js 16 · React 19 · Supabase (Postgres + RLS) · Stripe Connect/Billing/Terminal · Inngest · Resend · Sentry.
> **Método:** 1.434 tests unitarios (`node --test`), Sentry (14 d, org `tentare-software`), advisors de Supabase (security + performance), lectura profunda de bugs/UX/arquitectura sobre el estado ACTUAL del código, y verificación de los 🔴 de la pasada del 3-ago.

---

## 0. Salud objetiva (hoy)

| Señal | Resultado |
|-------|-----------|
| Tests unitarios | ✅ **1.434 / 1.434** pasan (subieron de 1.370) |
| Errores en Sentry (14 d) | 🟡 **8 issues**, casi todos 1–8 eventos. 4 son de dinero/webhooks (§2.2) |
| Advisors Supabase | **0 hallazgos nuevos accionables.** Los `rls_enabled_no_policy` son tablas solo-service-role (deny-all deliberado, ya documentado); los `SECURITY DEFINER` son helpers guardados internamente. Persiste 1 easy-win: leaked-password protection desactivada |
| God-files | `supabase-data.ts` 4.118 · `studio-context.tsx` **3.861** (subió de 3.724) · `supabase-data-admin.ts` 2.634 · `calendario` 2.618 |

**Lectura de la pasada:** la deuda nº1 (escritura optimista que canta éxito sin esperar al servidor) **sigue siendo el patrón dominante**. De la familia §1 del 3-ago, solo §1.1 se cerró. §1.2, §1.3 y §1.4 siguen vivas. En esta pasada se cierra **§1.4** (fix aplicado y verificado, §6) por ser el único pequeño, autocontenido y reversible sin tocar firmas ni call-sites.

---

## 1. 🔴 Crítico — familia de escritura optimista sin confirmar (el patrón que `tentare-os.md` marca como el más repetido del repo)

Los tests **no ven esta clase de bug por diseño**: Playwright mockea la red con `page.route`, así que ningún e2e ve nunca un 4xx. Hay que mirarlo, no testearlo.

### 1.1 🔴 Alta de reserva desde el calendario no revierte el optimista si la RPC falla *(persiste desde 3-ago §1.2)*
`app/(dashboard)/calendario/page.tsx:1136` (`confirmarAddReserva`) hace `void addReserva(...)` y tosta según la **estimación cliente**. En `lib/studio-context.tsx:2181`, `dbReservarPlaza(...).then(r => { if (!r || 'error' in r) return; ... })` — en la rama de error hace `return` **sin revertir** el `setReservas` optimista (`:2170`). Si el servidor rechaza (clase empezada, tope semanal, sin bono, o carrera por la última plaza), la reserva fantasma queda pintada y el toast miente. La vía **pública** del mismo `addReserva` (`:2151`) sí espera la respuesta y hace las cosas bien — la incoherencia entre las dos ramas de la misma función lo confirma. **Acción:** en el `.then`, revertir `setReservas(prev => prev.filter(x => x.id !== reservaId))` y avisar cuando `r` es error, igual que hace la rama pública.

### 1.2 🔴 Editar datos/rol de instructora canta "guardado" sin esperar al servidor *(persiste desde 3-ago §1.3)*
`app/(dashboard)/equipo/page.tsx:333` → `updateInstructor(editId, fields)`; en `lib/studio-context.tsx:1357` sigue tipado `=> void` con `dbUpdateInstructor(id, changes)` fire-and-forget, sin revertir ni comprobar. Si RLS rechaza (un `MANAGER` editando fuera de su alcance — la policy en BD **sí** bloquea), el estado local diverge y el toast "Cambios guardados" miente. La tarifa contigua (`:338`) sí comprueba el resultado, lo que resalta la incoherencia. **Nota de seguridad:** el rol está bien cerrado en RLS (`owner_write_instructores`/`manager_gestiona_equipo` + trigger anti-escalada); esto es un problema de *feedback y consistencia*, no un agujero de permisos. **Acción:** que `updateInstructor` devuelva `ResultadoEscritura`, `await` + revertir/avisar en fallo. Requiere cambiar la firma y 3 call-sites (`:333`, `:359`, `:368`) → se recomienda hacerlo en PR revisable, no de forma autónoma.

### 1.3 🔴 Sellado fiscal de factura (VeriFactu) disparado fire-and-forget *(NUEVO)*
`lib/studio-context.tsx:1003` `sellarFacturaYActualizar` está tipado `=> void` y se invoca como `void sellarFacturaYActualizar(fac)` en **5 sitios** (`:1472, :2534, :2623, :2728, :2866`). La función internamente **sí** maneja el fallo (revierte el optimista y setea `setDbError`), así que no hay factura fantasma — pero el `void` en el call-site significa que **quien cobra no puede saber si la factura se selló**. En un flujo fiscal encadenado (huella VeriFactu por estudio) eso es exactamente el terreno donde `tentare-os.md` exige "cero escritura optimista sin comprobar el resultado real". **Acción:** que devuelva `ResultadoEscritura` (ya calcula el `r.error`) y que los 5 call-sites lo esperen y reflejen el fallo. Es el mismo criterio ya aplicado a `consumirSesionBono` y a `addRecibo` (§1.1 del 3-ago). Toca 5 sitios → PR revisable.

### 1.4 ✅ El piloto automático no revertía al rechazar el servidor *(CORREGIDO en esta pasada, §6)*
`components/decision/piloto-automatico.tsx:42`: `setConfig(next)` optimista; en `!res.ok` y en `catch` solo mostraba `setError`, **sin revertir**. Apagar el autopiloto con un PUT fallido lo mostraba OFF mientras el servidor lo mantenía ON y seguía **auto-enviando mensajes a clientas**. Corregido: se captura `prev` dentro del updater (no del closure, stale por deps vacías) y se restaura en ambas ramas de error.

---

## 2. 🔴 Crítico — otros

### 2.1 Informes/KPIs de dinero sobre datos truncados a 1000 filas *(persiste desde 29-jul §2.3 y 3-ago §2.2)*
`lib/supabase-data.ts` sigue con decenas de `select('*')` sin `.range()`/`.limit()` (solo **16** llamadas del fichero acotan rango). PostgREST **trunca en silencio a 1000 filas**: en un estudio con >1 año de historia, informes y dashboards de dinero se calculan sobre una muestra parcial **sin error**. No es lentitud, es incorrección. **Acción:** bajar la agregación a Postgres (RPC/vistas) empezando por los informes de dinero — corrige el truncado y descarga el god-file a la vez.

### 2.2 Cuatro errores de dinero/webhooks activos en Sentry (14 d)
Anclados a producción, no hipótesis:
- **`[conciliador] cobro sin entregar recuperado`** (`POST /api/inngest`, 4 eventos, últ. hace 12 h): el conciliador está recuperando cobros que no se entregaron — hay una vía por la que un cobro queda sin su entrega. Revisar la raíz, no solo que el conciliador lo repesque.
- **`[stripe webhook] la cuenta Connect no corresponde al estudio de la metadata`** (`POST /api/stripe/webhook`, 3 eventos, últ. hace 9 h): mismatch entre la cuenta Connect y el `studioId` de la metadata. Es exactamente el tipo de cruce tenant↔pago que hay que blindar. Confirmar que el webhook **rechaza** el evento (no lo aplica al estudio equivocado).
- **`[billing webhook] checkout de PAGO en el webhook del SaaS`** (`POST /api/billing/webhook`, 3 eventos): llega un checkout de tipo PAGO al webhook de suscripción del SaaS. Verificar el enrutado de webhooks.
- **`dbInsertRewardHistory` 23503** (`reward_history_action_id_fkey`, `/calendario`, 1 evento): FK a `reward_actions` ausente — misma familia de carrera de visibilidad de FK que el `dbInsertRecibo` 23503 de pasadas anteriores. La recompensa se inserta antes de que exista su `action_id`.

`dbInsertSocio` 23505 (email duplicado, 1 evento) y el `TurnstileError` del portal son ruido de negocio esperado / integración (ver §4).

---

## 3. 🟠 Importante

| Ref | Hallazgo | Acción |
|-----|----------|--------|
| I-1 | **Formateo fecha+hora "Europe/Madrid" reimplementado a mano en 6 sitios** pese a existir `cuandoEstudio`/`horaEstudio`/`fechaLargaEstudio` en `lib/utils.ts:82`: `lib/inngest/confirmacion-riesgo.ts:38`, `lib/inngest/valoraciones.ts:13`, `lib/sustituciones/contacto.ts:46`, `lib/sustituciones/avisos.ts:12`, `lib/notifications/emit.ts:19`, `app/api/sustituciones/route.ts:270`. La regla de zona horaria del estudio debe vivir en un solo sitio (ya costó el bug de hora UTC vs Madrid). | Importar los helpers de `lib/utils.ts` en los seis. |
| I-2 | **`equipo/page.tsx` (1.318 líneas, 43 `useState`, 7 `useEffect`)**: una sola pantalla mezcla CRUD de equipo, edición de tarifas, invitación y estado de toasts. | Partir en `<PanelEquipo>`, `<EditorTarifas>`, `<DialogoInvitacion>`; estado a reducer/store. |
| I-3 | **`sustituciones/page.tsx` (1.183 líneas, 31 `useState`)**: mismo olor + patrón `setTimeout(() => setAviso(null), 6000)` repetido 4× (`:115,:139,:203,:223`). | Extraer `useAvisoToast()` y separar sub-paneles petición/cobertura. |
| I-4 | **Rutas de servidor gatean con literales de rol crudos** en vez de los predicados de `permisos-reglas`: `app/api/calendario/route.ts:52`, `app/api/mi-disponibilidad/route.ts:35,50`, `app/api/equipo/tarjetas/route.ts:48,137`, `app/api/ondemand/upload-url/route.ts:12`. La UI y el servidor deben compartir la misma fuente de regla. | Enrutar por predicados nombrados de `lib/permisos-reglas.ts`. |
| I-5 | **`lib/api-client.ts` (1.456 líneas, 79 funciones exportadas)**: God-module de todas las llamadas HTTP de la app. Cada feature nueva lo engorda. | Partir por dominio (`api-client/portal.ts`, `equipo.ts`, `billing.ts`). |

---

## 4. 🟡 Mejora

| Ref | Hallazgo | Acción |
|-----|----------|--------|
| M-1 | **God-files, deuda nº1 de mantenibilidad**: `studio-context.tsx` **creció** a 3.861 y concentra ~40 escrituras optimistas — es la raíz de toda la familia §1. | Extraer las mutaciones por dominio a servicios/hooks que devuelvan `ResultadoEscritura`. Un patrón, no 40 parches. |
| M-2 | **Dos implementaciones de "inicio de semana en lunes"**: `lib/utils.ts:52 inicioDeSemana` vs `lib/reserva-calendario-logic.ts:25 inicioSemanaLunes`. Mismo intento, dos fórmulas que pueden divergir. | Borrar `inicioSemanaLunes` y reusar `inicioDeSemana`. |
| M-3 | **`TZ_ESTUDIO='Europe/Madrid'` redeclarado como const local** en `app/api/reservas/import/route.ts:38`, `app/api/citas/import/route.ts:37`, `lib/citas/slots.ts:15`, `lib/serie-horario.ts:20`. | Una sola constante exportada, importada en todos. |
| M-4 | **Código muerto (exportado, solo usado en su propio test):** `lib/bono-logic.ts` → `superaLimiteSemanal`, `nuevaFechaFinTrasCongelar`; `lib/color-utils.ts` → `hexToHsl`, `hslToHex`, `ajustarLuminosidad`. | Borrar o marcar `@internal` si se conservan como spec. |
| M-5 | **`setState` post-desmontaje por `setTimeout` sin cleanup** en handlers de "copiado"/"guardado": `tab-perfil.tsx:79,171`, `tab-api.tsx:61`, `tab-estudio-enlaces.tsx:72`, `help-widget.tsx:57`, `sustituciones/page.tsx:115,139,203,223`. Riesgo bajo (2–6 s) pero puede avisar/leak si el panel se cierra antes. | Guardar el id del timer en `useRef` y limpiarlo al desmontar. |
| M-6 | **Importe en euros formateado a mano** (`{importe.toFixed(2)} €`) en `components/dashboard/penalizaciones-pendientes.tsx:49` pese a existir `formatEuro`. | Usar `formatEuro`. |
| M-7 | **Leaked-password protection desactivada** (advisor Supabase Auth) *(persiste desde 3-ago M-6)*. | Activar en Auth → Password security (HaveIBeenPwned). Easy-win. |
| M-8 | **Ruido en Sentry**: `dbInsertSocio` 23505 (email duplicado, error de negocio con UX propia) y el `TurnstileError` del portal (integración) capturados como excepción ensucian la señal real. | No capturar como excepción los 4xx esperados con UX; revisar el orden de carga del script de Turnstile. |

---

## 5. Verificado como correcto (crédito donde toca)

- **`sellarFacturaYActualizar` maneja bien su propio fallo** (revierte optimista + `setDbError`); el problema es solo el `void` en los call-sites (§1.3), no la función.
- **La vía pública de reserva** (`addReserva` con `ctxPublico`) sí espera la respuesta del servidor y devuelve el estado autoritativo de la BD.
- **CSV centralizado** (`lib/csv.ts`), **conversión hora-pared→instante** centralizada (`horaParedAInstante`), **permisos** mayormente en `lib/permisos-reglas.ts`.
- **Feature-freeze bien cableado**: los `.frozen.tsx` NO están enganchados (stub `page.tsx` + `lib/frozen-features.ts` gatea rutas/nav).
- **Efectos con timers** (`portal-*`, `hoja-pase.tsx`, `clases/[sesionId]`) devuelven su cleanup; `addEventListener` balancea `removeEventListener` en todos los ficheros.
- Sin `FIXME`/`HACK` reales; los "TODO" son la palabra española o el enum de nivel.

---

## 6. Corrección aplicada en esta pasada

| # | Archivo | Qué se arregló | Verificación |
|---|---------|----------------|--------------|
| 1 | `components/decision/piloto-automatico.tsx` (`guardar`) | **🔴 §1.4** — el toggle del piloto automático no revertía al rechazar el servidor: apagarlo con un PUT fallido lo mostraba OFF mientras el servidor lo mantenía ON y seguía auto-enviando mensajes a clientas. Ahora captura `prev` **dentro** del updater de `setConfig` (el closure está stale por las deps vacías del `useCallback`) y lo restaura en `!res.ok` y en `catch`. Estrictamente aditivo: no cambia el camino de éxito (el servidor sigue devolviendo la config saneada autoritativa). | eslint limpio · `tsc --noEmit` sin errores en el fichero · **1.434/1.434 tests en verde** (baseline idéntico antes y después) |

> Se aplicó **solo un fix** por prudencia. El resto de §1 (§1.1 reserva, §1.2 instructora, §1.3 factura) exige cambiar firmas de funciones y sus call-sites (3–5 sitios cada una), que sin poder correr los e2e contra un servidor real conviene revisar en PR, no de forma autónoma — regla de trabajo fijada el 6-ago.

---

## 7. Plan recomendado (orden de ataque)

1. **Cerrar la familia §1 de raíz** (M-1): extraer las mutaciones de `studio-context.tsx` a servicios que devuelvan `ResultadoEscritura`, empezando por las que tocan dinero/estado autoritativo — reserva (§1.1), instructora (§1.2), factura fiscal (§1.3). Un patrón, no N parches.
2. **Atacar los 4 errores de dinero/webhooks de Sentry** (§2.2): son fallos reales de producción de las últimas horas, con el cruce tenant↔pago (mismatch Connect) como el más sensible.
3. **Bajar la agregación de informes a Postgres** (§2.1): corrige el truncado a 1000 filas y descarga el god-file.
4. **Consolidar la fuente única** de zona horaria (I-1, M-3) y de permisos en rutas (I-4): un solo sitio para reglas que ya han costado bugs.
5. **Higiene**: partir `equipo`/`sustituciones`/`api-client` (I-2/I-3/I-5), borrar código muerto (M-4), timers con cleanup (M-5), leaked-password (M-7), ruido de Sentry (M-8).

Cada punto deja el producto más simple y mantenible; ninguno añade superficie nueva.

---

*Generado por la auditoría automatizada de Tentare (4ª pasada, 10 ago 2026). Fix §6.1 aplicado y verificado (1.434 tests en verde). El resto queda documentado y priorizado.*
