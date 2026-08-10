# Auditoría semanal de Tentare — 3 ago 2026

> Tercera pasada de auditoría automatizada. No se ha programado ninguna funcionalidad nueva.
> **Alcance:** 856 archivos TS/TSX · ~131.400 líneas en `app/`, `components/`, `lib/`. Stack: Next.js 16 · React 19 · Supabase (Postgres + RLS) · Stripe Connect/Billing/Terminal · Inngest · Resend · Sentry.
> **Método:** 1.370 tests unitarios (`node --test`), Sentry (14 d, org `tentare-software`), advisors de Supabase, lectura profunda de bugs/UX sobre el estado ACTUAL del código (calendario rediseñado, equipo, editor de temas, Decision OS/Umbral).

---

## 0. Contexto: mucho terreno nuevo desde la última pasada

Del commit #509 al #613 (~151 commits). Se cerró casi todo lo pendiente de la auditoría del 29-jul: las 13 reglas de reserva/cancelación (Fases 1→3), el rediseño del calendario, el editor de temas del portal (Fases 1→3), el rediseño de Equipo, el Decision OS ("el Umbral"), e instructora multi-sede. La suite subió de 1.102 a **1.370 tests**. Varios 🔴 anteriores están resueltos o mitigados (memoización del dashboard I-4/I-5 con `now` en estado; `dbInsertRecibo` gana reintento de FK `conReintentoFK`; `marcarCobrado` condicional M-2; `RENOVACION_COBRADA` con ventana de recencia). Crédito donde toca.

### Salud objetiva (hoy)

| Señal | Resultado |
|-------|-----------|
| Tests unitarios | ✅ 1.370/1.370 pasan |
| Errores en Sentry (14 d) | 🟡 5 issues, casi todos 1 evento (ver §1.1 y §2) |
| God-files | `supabase-data.ts` 4.118 (bajó de 5.557), `studio-context.tsx` 3.724, `supabase-data-admin.ts` 2.629, `calendario` 2.356 |
| Advisors Supabase | 0 nuevos hallazgos accionables (los WARN de `SECURITY DEFINER` son helpers guardados internamente, ya revisados); 1 easy-win real: leaked-password protection desactivada |

---

## 1. La deuda estructural nº1 sigue siendo el patrón dominante: escritura optimista que canta éxito sin esperar al servidor

Es la clase de bug que `tentare-os.md` marca como la más repetida del repo, y la que los tests **no pueden ver por diseño** (Playwright mockea la red con `page.route`, así que ningún e2e ve un 4xx). En `lib/studio-context.tsx` hay ~40 mutaciones `db*(...)` disparadas sin `await` ni comprobación de resultado. La mayoría son mutaciones de bajo riesgo (tags, notas, campos), pero varias tocan **dinero o estado autoritativo** y mienten en el toast si el servidor rechaza. Las superficies nuevas (calendario, equipo) heredaron el patrón.

### 1.1 🔴 Cobro de "clase suelta" que se pierde en silencio *(corregido en esta pasada)*
`app/(dashboard)/calendario/page.tsx:1069` (`handleCobrarSuelta`) → `addRecibo(...)` (`studio-context.tsx`) hacía `setRecibos` + `dbInsertRecibo(nuevo)` **fire-and-forget** y mostraba "Clase suelta cobrada". Si el insert fallaba (RLS/red, o FK de suscripción con carrera de visibilidad — el **Sentry `dbInsertRecibo` 23503** sigue apareciendo, visto hace 5 días en `/clientas/:id`), quedaba un recibo fantasma en pantalla que nunca existió en BD y el cobro no se registraba. El mismo `addRecibo` respalda el alta manual de recibo en la ficha de clienta. **Corregido** (§4): ahora revierte el optimista y deja rastro (`capturarMensaje`) si el servidor rechaza — mismo criterio ya probado en `consumirSesionBono`.

### 1.2 🔴 Alta de reserva desde el calendario anuncia éxito sin esperar la RPC autoritativa
`calendario/page.tsx:1052` (`confirmarAddReserva`) hace `void addReserva(...)` y tosta según la **estimación cliente** (`decidirReservaNueva`), no según la RPC. En `studio-context.tsx:~2092`, si `dbReservarPlaza` devuelve error hace `return` **sin revertir** el `setReservas` optimista. El toast dice "añadida a la clase" aunque el servidor la rechace (clase ya empezada, tope semanal, sin bono activo, o carrera por la última plaza). **Acción:** `await addReserva`, tostar según `res.estado` real y revertir el optimista en error. Es el mismo patrón que la vía pública (`crearReservaPublica`) ya hace bien.

### 1.3 🔴 Cambio de datos/rol de instructora canta "guardado" sin esperar al servidor
`app/(dashboard)/equipo/page.tsx:333` (`guardar`) → `updateInstructor(editId, fields)` fire-and-forget (`studio-context.tsx:~1271`) y muestra "Cambios guardados". Si RLS rechaza (p. ej. un `MANAGER` editando una fila fuera de su alcance — la policy en BD **sí** bloquea), el estado local diverge y el toast miente. La tarifa contigua (`:338`) sí comprueba el resultado, lo que resalta la incoherencia. **Nota de seguridad:** el rol está bien cerrado en RLS (`owner_write_instructores`/`manager_gestiona_equipo` + trigger anti-escalada); esto es un problema de *feedback y consistencia*, no un agujero de permisos. **Acción:** que `updateInstructor` devuelva `ResultadoEscritura`, `await` + revertir/avisar en fallo.

### 1.4 🔴 El toggle de piloto automático no revierte cuando el servidor lo rechaza
`components/decision/piloto-automatico.tsx:42-59`: `setConfig(next)` optimista; en `!res.ok` (`:52`) y en `catch` (`:55`) deja el valor optimista puesto. Apagar el autopiloto con un PUT fallido lo muestra OFF mientras el servidor lo mantiene ON y sigue **auto-enviando mensajes a clientas**. **Acción:** capturar `prev` y restaurarlo en ambas ramas de error.

---

## 2. 🔴 Crítico — otros

### 2.1 FK de recibo en producción (raíz aún viva)
Sentry `dbInsertRecibo` **23503** (`recibos_suscripcion_id_fkey`), `/clientas/:id`, visto hace 5 días. `dbInsertRecibo` ya reintenta la carrera de visibilidad de la FK (`conReintentoFK`) y `consumirSesionBono` ya revierte+avisa, pero la **raíz** —una suscripción creada de forma optimista en estado local que aún no está persistida cuando se inserta el recibo que la referencia— sigue ahí. **Acción:** persistir/confirmar la suscripción antes que su recibo (o transaccional en RPC), no solo reintentar la FK. Es la misma raíz que §1.2/§1.3.

### 2.2 Informes/KPIs sobre datos truncados a 1000 filas *(persiste desde 29-jul, §2.3)*
`lib/supabase-data.ts`: **151** `select('*')` sin `.range()`/`.limit()`. PostgREST **trunca en silencio a 1000 filas**: en un estudio con >1 año de historia, informes y dashboards de dinero se calculan sobre una muestra parcial **sin error**. No es lentitud, es incorrección. **Acción:** paginar o bajar la agregación a Postgres (RPC/vistas), empezando por los informes de dinero.

---

## 3. 🟠 Importante

| Ref | Hallazgo | Acción |
|-----|----------|--------|
| I-1 | **Eliminar clase muestra éxito sin comprobar nada** (`calendario/page.tsx:1005`): `deleteSesion` está tipado `=> void`, no se puede ni detectar el fallo, y luego tosta "Clase eliminada". | Que `deleteSesion` devuelva `ResultadoEscritura` como el resto y comprobarlo. |
| I-2 | **Cancelar clase promete "clientas avisadas" sin confirmar envíos** (`calendario/page.tsx:962-990`): `forEach` de `enviarEmailCancelacionClase` sin `await` + `void avisarClaseCancelada`, toast incondicional. | Recoger resultados y reflejar cuántas se avisaron (como ya hace `avisarCambioInstructora`). |
| I-3 | **Card del Umbral (aprobar/rechazar/posponer) no revierte si el fetch lanza** (`components/decision/use-decisiones.ts:134-159`): quita la recomendación optimista y `await fetch` sin `try/catch`; un throw de red deja la card borrada y la acción sin persistir. | `try/catch` con `cargar()` (re-sync) en el catch. |
| I-4 | **"Analizar ahora" se cuelga y traga el 429** (`centro-de-control/page.tsx:68-75` + `use-decisiones.ts:161`): sin `try/finally`, un throw deja `setAnalizando(false)` sin ejecutar → botón girando hasta recargar; el 429 "análisis reciente" no da feedback. | `try/finally` + mostrar el mensaje del servidor. |
| I-5 | **Doble-submit en acciones de reserva / pasar lista** (`calendario/page.tsx:1021` y `1354`): botones no deshabilitados durante el async; `ejecutarPasarLista` hace `for (...) checkin(id)` fire-and-forget + toast incondicional → check-ins/reservas duplicados. | Flag de carga + `disabled`; esperar los `checkin` y tostar según resultado. Mismo patrón que los fixes de doble-cobro del 29-jul. |
| I-6 | **Favicon de borrador que se filtra a producción** (`components/theme/theme-editor.tsx:183-200` → `lib/portal-storage.ts:168-186`): `handleFavicon`/`handleQuitarFavicon` suben/borran al path fijo `favicon-${studioId}` **de inmediato**, cambiando lo que sirve producción antes de "Publicar", pese al copy "el borrador solo lo ves tú". Además `updateStudio({ logoUrl })` (`:172,180`) no inspecciona su `ResultadoEscritura`. | Guardar el favicon en un path de borrador hasta publicar; comprobar el resultado de `updateStudio` y revertir. |
| I-7 | **`asignarSustituta` sin guard de doble-submit** (`calendario/page.tsx:874`): a diferencia de `editarSesion`/`editarSerie` (que usan `guardandoSesion`), no bloquea reenvíos → dos `updateSesion` + dos avisos a clientas. | Reutilizar el flag `guardandoSesion`. |

---

## 4. 🟡 Mejora

| Ref | Hallazgo | Acción |
|-----|----------|--------|
| M-1 | **God-files**: `supabase-data.ts` bajó a 4.118 (bien), pero `studio-context.tsx` creció a 3.724 y concentra ~40 escrituras optimistas. Cada feature nueva lo toca. | Extraer las mutaciones por dominio a hooks/servicios que devuelvan `ResultadoEscritura` — resuelve de raíz toda la familia §1. Deuda nº1 de mantenibilidad. |
| M-2 | **O(n²) / `.find` en `.map` en el calendario**: `estadoPorSesion` (`calendario/page.tsx:1129-1144`) hace `.filter` por sesión existiendo ya `reservasPorSesion` (Map, `:1146`); mismo patrón en `decisionesResumen` (`:1297`), `tarjetas` (`:1245`), `itemsDecision` (`:1278`). | Reutilizar los Map ya construidos. |
| M-3 | **Resultados de decisión descartados → 409/errores invisibles** (`centro-de-control/page.tsx:50-66`): se `await aprobar(id)` pero se ignora el booleano; ante 409 la card reaparece sin explicación. `whatsappHref` (`:42-48`) hace `socios.find` por render sin memoizar. | Comprobar retorno y tostar; `Map<socioId, socia>` en `useMemo`. |
| M-4 | **Degradación Safari** (2º punto ciego de los e2e: solo Chromium): `lib/theme-runtime.ts:56` usa `color-mix` sin fallback (botón "soft" pierde fondo en Safari <16.2); `studio-context.tsx:~1187` (`addBannerPortal`) usa `crypto.randomUUID()` (lanza en Safari <15.4 / contexto no seguro). | Emitir rgba/hex antes del `color-mix`; fallback UUID. |
| M-5 | **Ruido en Sentry: errores de negocio 4xx capturados como excepciones** (`dbInsertInstructor` 409 "email duplicado" en `/equipo`; probes iOS `window.webkit.messageHandlers` en `/legal`). Ensucian la señal real. | No capturar como excepción los 4xx esperados que ya tienen UX; filtrar los probes de webview. |
| M-6 | **Leaked-password protection desactivada** (advisor Supabase Auth). | Activar en Auth → Password security (HaveIBeenPwned). Easy-win de seguridad. |
| M-7 | **Crons secuenciales por tenant** *(persiste, documentado)*: fan-out Inngest por tenant antes del primer estudio mediano. | Igual que M-5 del 29-jul. |

---

## 5. Verificado como correcto (crédito donde toca)

- RLS de `instructores` bien cerrada (write de propietaria/manager + trigger anti-escalada): el rol **no** es solo-UI.
- La vía pública de reserva (`crearReservaPublica`) sí espera la RPC; `RiesgoPlanton.toggle` revierte y avisa bien; `dbTransicionarRecomendacion` hace el doble-accept servidor-autoritativo (`WHERE estado = desde`).
- Editores de tema/portal (`handleGuardar`/`handlePublicar`) `await`ean y deshabilitan botones.
- `dbInsertRecibo` gana reintento de FK; `marcarCobrado` es condicional (M-2 del 29-jul aplicado); `RENOVACION_COBRADA` con ventana de recencia (I-1 del 29-jul aplicado).
- Los WARN de advisors (`SECURITY DEFINER` invocables) son helpers guardados internamente y las tablas `rls_enabled_no_policy` son de solo-service-role (deny-all deliberado).

---

## 6. Correcciones aplicadas en esta pasada

| # | Archivo | Qué se arregló | Verificación |
|---|---------|----------------|--------------|
| 1 | `lib/studio-context.tsx` (`addRecibo`) | **🔴 §1.1** — `addRecibo` era fire-and-forget: un fallo del insert dejaba recibo fantasma y perdía el cobro en silencio (incl. "cobrar clase suelta" del calendario y alta manual de recibo). Ahora revierte el optimista y registra el fallo (`capturarMensaje`) — estrictamente aditivo, no cambia el camino de éxito. Mismo patrón ya probado en `consumirSesionBono`. | 1.370/1.370 tests en verde; narrowing de `ResultadoEscritura` idéntico al del código hermano ya compilado |

> Se aplicó **solo un fix** por prudencia: el resto de §1 exige cambiar firmas de funciones (`updateInstructor`, `deleteSesion`, `addReserva` → devolver `ResultadoEscritura`) y sus call-sites, que sin poder correr los e2e end-to-end conviene revisar en PR, no de forma autónoma.

---

## 7. Plan recomendado (orden de ataque)

1. **Cerrar la familia §1 de raíz** (M-1): extraer las mutaciones de `studio-context.tsx` a servicios que devuelvan `ResultadoEscritura`, empezando por las que tocan dinero/estado autoritativo (reserva §1.2, instructora §1.3, piloto automático §1.4). Un patrón, no 40 parches.
2. **Persistir suscripción antes que recibo** (§2.1) — apaga el 23503 de producción de raíz, no solo por reintento.
3. **Bajar la agregación a Postgres** (§2.2) — corrige los informes truncados y descarga los god-files a la vez.
4. **Robustez de avisos y del Umbral** (§3): I-1..I-5 tocan la confianza de la clienta y la señal del Decision OS.
5. **Higiene**: favicon de borrador (I-6), Safari (M-4), ruido de Sentry (M-5), leaked-password (M-6).

Cada punto deja el producto más simple y mantenible; ninguno añade superficie nueva.

---

*Generado por la auditoría automatizada de Tentare (3ª pasada). Fix §6.1 aplicado y verificado (1.370 tests en verde). El resto queda documentado y priorizado.*
