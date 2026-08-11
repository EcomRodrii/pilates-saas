<!-- BEGIN:tentare-development-os -->
# Tentare Development OS

Este archivo convierte las convenciones reales de este repo en reglas siempre cargadas.
No son aspiraciones — son hechos verificados de este código a fecha 2026-07-28. Si algo
aquí deja de ser cierto, corrígelo en vez de dejarlo como ruido.

## Convenciones que hay que seguir sin preguntar

- **Nombres**: dominio de negocio en español (`socios`, `reservas`, `puedeVerFichaClinica`,
  `puedeMoverDinero`), scaffolding de código (sintaxis, keywords) en inglés. Tablas
  snake_case en español salvo `studios`/`spots`. Sigue este patrón mixto, no lo "arregles"
  traduciendo todo a un solo idioma.
- **Tests**: unitarios con `node --test --experimental-strip-types` sobre `lib/**/*.test.ts`
  (no Jest/Vitest). E2E con Playwright en `e2e/*.spec.ts`, mockeando red con `page.route`.
  Los imports relativos dentro de `lib/` necesitan la extensión `.ts` explícita
  (`tsconfig.json` tiene `allowImportingTsExtensions` justo para esto) — sin ella, pasa en
  local pero rompe en CI.
  ⚠️ **Dos puntos ciegos que la suite NO ve, por diseño, y que ya han costado bugs en prod:**
  (1) `page.route` mockea la red, así que **ningún test ve nunca un 4xx** — una pantalla que
  escribe puede anunciar éxito con el servidor diciendo que no (#500, #505, #560);
  (2) los e2e corren **solo en Chromium**, así que una API que Chrome tiene y Safari no
  (`BarcodeDetector`) pasa verde y falla en el iPad de recepción (#565). Lo que dependa de
  una respuesta real del servidor o de un navegador concreto **hay que mirarlo, no
  testearlo**.
- **Commits**: Conventional Commits con scope en español que refleja el área de negocio
  (`fix(seguridad):`, `feat(alta):`, `chore(migraciones):`, `perf(panel):`...) y número de
  PR entre paréntesis cuando exista. El tono puede ser narrativo/autocrítico, no hace falta
  forzar un tono corporativo.
- **Migraciones**: numeradas correlativas en `supabase/migrations/`. Comprueba siempre el
  último número existente antes de crear una (`list_migrations` o `ls`) — este repo ha
  colisionado números más de una vez. Mergear un PR **no** aplica su migración: verifica que
  quedó aplicada de verdad, no solo mergeada en git. ⚠️ Para esa verificación **cruza por
  NOMBRE, nunca por número**: las aplicadas con `apply_migration` se sellan con la marca de
  tiempo del momento de aplicarlas, no con la del fichero (`20260731102000_ausencias_…`
  figura como versión `20260730141838`). Filtrar por número devuelve cero y parece que falta
  media tanda — casi se reporta un agujero de RLS inexistente por esto (2026-07-30).
  Y cuando encuentres una divergencia así, **renombra el fichero a la versión aplicada**
  (lo que hizo #567 con `20260731103000` → `20260730155339`): si no, un `supabase db push`
  desde limpio la ve pendiente y la reaplica con OTRO timestamp, y la divergencia se
  multiplica en vez de cerrarse.
- **Seguridad**: la RLS es la cerradura real, la UI nunca es el límite de seguridad — regla
  explícita y repetida en `lib/permisos-reglas.ts`. Cualquier permiso nuevo se implementa en
  ambos sitios o no está terminado.
- **Dinero**: cero escritura optimista sin comprobar el resultado real (`await` la
  confirmación, maneja el camino de fallo, sé idempotente ante webhooks repetidos). Es el
  patrón de bug más repetido en los flujos de Stripe/cobros de este repo.
- **Modo de Stripe**: el código es agnóstico (`sk_live_` y `sk_test_` funcionan igual), y
  `sk_test_XXXX` significa **«sin configurar»**, NO «modo test» — una clave de test real la
  pasa. Lo que está prohibido es mezclar: `lib/billing/modo-stripe.ts` bloquea clave live
  fuera de producción (un `npm run dev` con el `.env.local` de producción copiado cobra de
  verdad a una socia real — pasó montando esto) y clave test en producción (no falla nada:
  los recibos se marcan COBRADO y te enteras cuadrando con el banco). El guardia va en las
  **dos** puertas por las que entra dinero: `cobrarReciboOffSession` y
  `/api/stripe/checkout`. Cualquier vía nueva de cobro lo lleva también. Montaje del
  sandbox en `docs/STRIPE-MODO-TEST.md`.

## Decisiones de producto/arquitectura ya cerradas (no reabrir sin pedirlo expresamente)

- No trocear los "god files" (`lib/supabase-data.ts`, `studio-context.tsx`...) — propuesto y
  rechazado dos veces.
- Feature-freeze activo sobre Kiosko/POS/VOD/Comunidad (`lib/frozen-features.ts`).
- `suscripciones` con RLS abierta a todo el personal es decisión de producto deliberada, no
  agujero pendiente. `sesiones`/`reservas` **YA NO** son "sin cerrar del todo" — probando en
  persona la cuenta de una instructora se vio que podía crear/editar/cancelar CUALQUIER clase
  y añadir clientas a cualquier reserva (migr `20260730109000`/`20260730110000`): INSTRUCTOR
  ahora solo puede UPDATE en sus propias clases (sin INSERT/DELETE); PROPIETARIO/MANAGER/
  RECEPCION mantienen control total, sin cambios.
- El menú de una cadena es por cadena, no por sede (migración 0103) — no reintroducir el
  toggle antiguo.

## El logotipo: un componente en línea, y `docs/marca/` como única fuente

El logo NO se monta como imagen. `<LogoTentare>`
(`components/marca/logo-tentare.tsx`) pinta el SVG en línea, con los once
trazados de `components/marca/trazados.ts` — la palabra ya va **en curvas**, así
que no depende de que Quicksand ni Inter estén instaladas (no lo están: este
repo carga Plus Jakarta Sans y compañía, nunca Quicksand). Un componente
paramétrico y no cincuenta archivos porque el kit es un solo dibujo: los cuatro
trazados del isotipo son idénticos en los cincuenta SVG, y entre variantes solo
cambian color y encuadre.

- **Los encuadres van ceñidos al dibujo**, no al lienzo del kit (que trae hasta
  un 22 % de aire abajo). Si se usa el lienzo tal cual, `alto` acaba midiendo el
  aire — el bug que el sidebar compensaba a mano en la época de los PNG.
- **El color va por custom properties** (`--marca-solido`, `--marca-disco`,
  `--marca-a/b`, `--marca-producto`), nunca por `fill` fijo. La tinta `auto` es
  la única cuyos valores viven en `globals.css` (`.marca-auto` / `.dark
  .marca-auto`), porque un `style` en línea gana a una clase y la regla de modo
  oscuro no podría pisarlo. ⚠️ Por eso los trazados leen **siempre**
  `var(--marca-disco)` y jamás el color de producto directamente: hacerlo dejaba
  el disco magenta sobre fondo oscuro, donde a una tinta manda el nombre.
- **`useId()` por instancia** para el id del degradado: la barra móvil y la de
  escritorio conviven en el DOM (`lg:hidden`, no desmontadas), y con un id fijo
  `url(#…)` resolvía siempre al primero. Esto obliga a `'use client'`.
- **Todo derivado ráster sale del mismo kit**: `node scripts/regenerar-marca.mjs`
  regenera los PNG de manifests/favicons, el lockup blanco de los correos de
  Supabase y las cuatro piezas WebP de la intro de la landing. Si el isotipo
  cambia alguna vez, se vuelve a correr — si no, conviven dos marcas distintas a
  un clic de distancia (pasó al adoptar el kit: su isotipo estaba **redibujado**
  respecto al PNG que había en producción, no era una vectorización).
- Fuera a propósito: los emails a socias (marca del ESTUDIO, no de Tentare),
  `/portal/[slug]` (marca blanca) y `/interno`.

## Arquitectura de marca: Tentare Manager / Tentare Core

Tentare se percibe como dos productos, no un panel único con roles:
- **Tentare Manager** → propietaria, gerencia (`MANAGER`), recepción (`RECEPCION`).
- **Tentare Core** → instructoras (`INSTRUCTOR`).

Esto es un **rebranding sobre una sola app role-gateada** (`app/(dashboard)/` +
`lib/permisos-reglas.ts`), NO un split estructural — no hay `app/manager/` ni
`app/core/`, y no se debe "terminar" ese split por iniciativa propia sin que se pida
expresamente. Fuente de verdad del nombre por rol: `nombreAppPorRol()` en
`lib/permisos-reglas.ts`. Los emails al equipo del estudio usan
`remitentePorMarca()` (`lib/emails/remitente.ts`) para que el nombre de producto se
vea también en el remitente aunque `RESEND_FROM` esté configurado.

Queda fuera a propósito (no tocar sin pedirlo): `/login`, `app/manifest.ts` (landing)
y `app/panel.webmanifest` (el manifest PWA del panel, `app/(dashboard)/layout.tsx`,
apunta ahí para que "Añadir a pantalla de inicio" instale el panel de verdad y no la
landing — ver el comentario en ese layout) — el rol solo se conoce tras autenticar,
así que se quedan con la marca paraguas "Tentare";
`components/landing/*` (copy nuevo, no un renombrado); `app/interno` ("Tentare
Internal", backoffice de Tentare-empresa, no relacionado); `app/portal/[slug]`
(marca blanca por estudio, tercer contexto de marca ya separado); los emails a
socias/clientas (sin marca de producto interno, solo la marca del estudio); el logo
colapsado del sidebar (el icono "T" es el mismo en las tres marcas, sin texto que
distinguir) y el de `/login` (el rol no se conoce antes de autenticar — no es un
hueco de asset, es la misma limitación de siempre; hubo un `logo-stacked-core.png`
/`-manager.png` esperando a que se resolviera y se borraron al no usarlos nadie:
si algún día hace falta, salen de `docs/marca/` con
`node scripts/regenerar-marca.mjs`).

## Tentare Core — autoservicio de instructora (completo, 2026-07-30)

El plan pedido por el fundador ("que la instructora pueda aceptar sustituciones,
crear sus clases, poner su disponibilidad, confirmar baja, valorar a la alumna
etc.") está **entregado en 6 PRs**, todos en `main`. Patrón repetido en los seis:
abrir a INSTRUCTOR una vía que ya existía para el resto de roles (RLS acotada a
`instructor_id = current_instructor_id()`, mismo criterio que #528), nunca un
`FOR ALL` nuevo sin distinguir fila. Mobile-first: todo vive en `/mi-perfil`,
`/calendario` o `/dashboard`, pantallas ya usadas por este rol.

1. **#545 — "No puedo asistir"**: la instructora dispara el motor de
   sustituciones YA EXISTENTE (`lib/sustituciones/baja.ts`) sobre su propia
   clase, desde el calendario o el dashboard — sin buscar/gestionar sustituta
   ella misma. Respeta el modo de autonomía del estudio (asistido espera visto
   bueno de la propietaria; autónomo/vacaciones, plan de pago, contactan solas)
   — no se fuerza autonomía para no saltarse ese gate.
2. **#550 — Crear sus clases**: INSERT en `sesiones` abierto a INSTRUCTOR solo
   para sí misma (migración `20260730109000...`/siguientes). Sin selector de
   instructora, aforo fijado a la capacidad de la sala, sin recurrencia (crear
   SERIES sigue siendo trabajo de mostrador — no reabrir).
3. **#555 — Su disponibilidad**: `/api/mi-disponibilidad` (sesión de staff),
   separado a propósito de `/api/public/disponibilidad` (token firmado) —
   mecanismos de auth distintos, no se mezclan en un mismo handler aunque
   comparten la lógica de negocio (`lib/sustituciones/disponibilidad.ts`). El
   enlace público se queda como vía adicional (onboarding sin cuenta).
4. **#558 — Confirmar ausencia programada** (vacaciones/baja médica/otro):
   se amplió el endpoint YA EXISTENTE (`app/api/equipo/ausencias`), no uno
   nuevo — aquí sí hay un solo mecanismo de auth (sesión de staff). Solo afecta
   al ranking de candidatas futuras (`rankear_candidatas`); NO dispara ninguna
   sustitución automática sobre sus clases ya programadas — decisión de
   producto explícita, no reabrir sin pedirlo.
5. **#561 — "Valorar a la alumna" → NO construido tal cual**: `tentare-producto`
   recomendó no hacerlo — `notas_progreso` ya cubre ese propósito de negocio
   (progreso/alertas/plan próxima sesión) y ningún competidor (Bsport/Momence/
   Eversports/Un Respiro) expone que la instructora "valore" a la socia. En su
   lugar se corrigió el bug real encontrado al investigarlo: la UI de esa
   tabla (`app/(dashboard)/clientas/[id]/page.tsx`, "Nota de sesión IA") era
   visible a CUALQUIER rol, incluida RECEPCIÓN, que no debe ver detalle
   clínico (`FICHA-CLINICA.md §11`) — la RLS (`salud_notas_progreso`, 0095) ya
   estaba bien, era solo un hueco de UI encima. **No reabrir "valorar alumna"
   como feature nueva sin que se pida expresamente** — ya se evaluó y se
   descartó por duplicar `notas_progreso`.
6. **#562 — Tarifa por hora + Mis Estudios**: `instructor_tarifas`, tabla
   aparte de `instructores` (no una columna) porque la RLS de `instructores`
   da todas las columnas a todo el estudio sin distinción de fila — un campo
   salarial ahí se filtraría en el JSON crudo a cualquier compañera, mismo
   motivo que ya separó `mandatos_sepa`. PROPIETARIO/MANAGER fijan la tarifa;
   la instructora solo la lee (nunca escritura sobre la suya). "Mis Estudios"
   reutiliza `mis_estudios()` (RPC ya existente) de solo lectura, sin
   migración/endpoint nuevo.

Cada tramo pasó por diseño (`tentare-arquitecto`) y revisión de seguridad
(`tentare-seguridad`, sin bloqueantes en ninguno) antes de mergear.

## Reglas de reserva/cancelación por tipo de clase — Fase 1

Cada `tipo_clase` puede sobrescribir 4 reglas que antes eran solo del estudio:
exigir plan/bono activo, antelación mínima para reservar, antelación máxima
para reservar, permitir lista de espera. Mismo patrón que
`tipos_clase.ventana_cancelacion_horas` (migr `0116`): columna nullable en
`tipos_clase`, `NULL` = hereda el default del estudio. Fuente de verdad de la
resolución: `heredaOverride()` en `lib/booking-logic.ts`, aplicada en
`crearReservaPublica` (`lib/db/supabase-data-admin.ts`) y en la RPC
`reservar_plaza` (migr `20260730152516`, parámetro `p_permite_lista_espera`).

Esto es la **Fase 1** de un pedido más grande (13 reglas). Quedan fuera a
propósito, confirmado con el usuario — no "completar" por iniciativa propia:
- **Fase 2** (lógica/estado nuevo, sin tocar dinero): mínimo de asistentes
  para confirmar la clase, aprobación manual de reserva, plazo para aceptar
  una plaza de lista de espera (hoy la promoción es automática e instantánea).
- **Fase 3** (dinero real, tarjeta guardada): penalización económica por
  cancelación tardía o no-show. Necesita diseño propio con `tentare-stripe` —
  no es una extensión trivial del patrón de Fase 1.
- **Sin plantillas reutilizables**: cada tipo de clase edita sus reglas
  directamente, igual que ya funcionaba con la ventana de cancelación. No hay
  ningún patrón de "plantilla asignable a varios tipos de clase" en el repo;
  si se quiere, es una entidad nueva de verdad, no un campo más.

### Fase 2a — aprobación manual de reserva (completa, 2026-07-30)

Primera de las tres piezas de Fase 2, la más autocontenida. Mismo patrón
"hereda": `studios.requiere_aprobacion` (default `false`) +
`tipos_clase.requiere_aprobacion` (nullable), migr `20260730192445`. Una
reserva con esta regla activa entra en estado nuevo `PENDIENTE_APROBACION`
(ampliado el CHECK de `reservas.estado`) **sin ocupar aforo ni consumir
bono** — mismo criterio que ya usaba `LISTA_ESPERA`. Al aprobar, la RPC
`resolver_reserva_pendiente` (migr `20260730192445`, endurecida en
`20260730192616`/`20260730192657` — ver nota de grants abajo) vuelve a
comprobar el aforo en ese momento con lock (`FOR UPDATE`, mismo patrón que
`reservar_plaza`) y decide `CONFIRMADA` o `LISTA_ESPERA` ahí, no antes.

**Regla de negocio, no de reloj**: ninguna reserva puede aprobarse después de
que su clase haya empezado — la guardia vive DENTRO de la RPC (si
`sesiones.inicio <= now()`, fuerza `CANCELADA` pase lo que pase con
`p_aprobar`), no en el cron. El cron `lib/inngest/reservas-pendientes.ts`
(cada 5 min, sin fan-out por estudio — es una query global) solo hace el
aviso proactivo a la socia vía `expirarReservaPendiente()`; si el cron se
retrasara o no corriera un tick, la regla de negocio seguiría siendo
correcta, solo el aviso llegaría tarde. Corría cada minuto; se bajó a 5 min
porque eran ~87.600 invocaciones de Vercel al mes (el 70 % de las de todos
los crons juntos) para una tabla en la que casi siempre no hay nada que
expirar — decisión de producto explícita del fundador, el precio es que el
aviso puede tardar hasta 4 minutos más.

**Cero eventos de notificación nuevos salvo uno** (petición explícita del
usuario: reusar antes que crear estado/evento nuevo). `RESERVA_APROBADA` y
`LISTA_ESPERA` tras aprobar reusan `emitirReserva()` tal cual. El rechazo
manual y la expiración automática son el MISMO evento
(`emitirReservaCancelada()`) con un `motivo: 'rechazada' | 'expirada'` que
solo cambia el texto del mensaje — no hay `RESERVA_EXPIRADA_SIN_APROBAR`. El
único evento nuevo es `RESERVA_PENDIENTE_APROBACION` (avisa a
mostrador/PROPIETARIO/MANAGER/RECEPCION, no a la socia).

Autorización: `puedeGestionarCalendario()` (`lib/permisos-reglas.ts`) vive en
la API route (`app/api/reservas/resolver-pendiente/route.ts`), NO en la RPC
— porque la RPC se llama vía `getSupabaseAdmin()` (service-role), donde
`auth.uid()` es `NULL` y cualquier guardia basada en `auth.uid()` dentro de
la RPC quedaría bypaseada en silencio. Mismo criterio que ya usa
`crearReservaPublica`.

⚠️ **Gotcha de grants ya pisado una vez, que puede volver a pasar**: al hacer
`CREATE OR REPLACE FUNCTION` con una firma NUEVA (`reservar_plaza` pasó de
5 a 6 argumentos), Postgres crea un objeto función distinto con el grant por
defecto `EXECUTE ON FUNCTION ... TO PUBLIC` — **no hereda** el `REVOKE` que
tenía la firma anterior. `REVOKE ... FROM anon` NO basta (anon hereda de
`PUBLIC`, no tiene el privilegio directo); hace falta `REVOKE ... FROM
PUBLIC` + `GRANT ... TO authenticated, service_role, postgres` explícito.
Verificar siempre con `has_function_privilege('anon', '<función>'::regproc,
'EXECUTE')` tras cambiar la firma de cualquier RPC ya endurecida.

### Fase 2b — plazo para aceptar una plaza de lista de espera (completa)

Segunda pieza de Fase 2. Antes, `cancelar_reserva_plaza` promocionaba
**instantáneamente** a la primera de `LISTA_ESPERA` cuando se liberaba un
hueco. Con esta regla activa (`studios.lista_espera_plazo_aceptacion_minutos`
default `0` + `tipos_clase.lista_espera_plazo_aceptacion_minutos` nullable =
hereda, migr `20260731130000`), en vez de confirmar directo le abre una
**oferta** con plazo (metadata `reservas.oferta_expira_en`, sin estado nuevo
— mismo principio que `0059_confirmacion_riesgo_planton`: la reserva sigue en
`LISTA_ESPERA`). Si no la acepta a tiempo, **pierde el sitio entero**
(`CANCELADA`, decisión de producto — no se reordena "al final de la cola") y
se ofrece a la siguiente.

⚠️ **El override se resuelve en SQL directo, no con `heredaOverride()` en
TS** — a diferencia de Fase 1/2a. Motivo: `cancelar_reserva_plaza` es
ejecutable directo por `authenticated` desde el cliente
(`dbCancelarReservaPlaza`, `lib/supabase-data.ts`, sin pasar nunca por
`cargarPoliticaEstudio`), así que la resolución en TS simplemente no vería el
plazo en ese camino. Mismo criterio que ya usa `ventana_cancelacion_horas`.

Lógica de promoción extraída a un helper compartido
(`promocionar_siguiente_espera`, `SECURITY INVOKER`, nunca expuesto directo a
`authenticated`/`anon`) reutilizado por `cancelar_reserva_plaza` (al liberarse
un hueco) y por la nueva RPC `expirar_oferta_lista_espera` (al caducar una
oferta, para intentarlo con la siguiente) — mismo patrón de extracción que
`*_usa_helpers.sql` en el resto del repo. `aceptar_oferta_lista_espera`
consume el bono en TS al confirmar (no en la RPC), mismo criterio que
`resolver_reserva_pendiente`/Fase 2a.

**Regla de negocio, no de reloj** (mismo patrón que Fase 2a): el cron
`lib/inngest/lista-espera-ofertas.ts` corre cada 5 min (no cada minuto como
Fase 2a — aquí no hay una regla de seguridad de "clase ya empezada" en juego,
solo UX de cuánto tarda en enterarse la siguiente persona de la cola).

⚠️ **Gotcha nuevo, distinto del de grants**: cuando una función PL/pgSQL usa
`RETURNS TABLE(...)`, Postgres expone esas columnas como VARIABLES dentro del
cuerpo — si luego se hace `SELECT <col> INTO ... FROM otra_función(...)` y esa
otra función devuelve una columna con el MISMO NOMBRE, o si el propio cuerpo
filtra `WHERE <col> = ...` sobre una tabla con una columna que coincide con
una de sus propias `RETURNS TABLE`, Postgres lo rechaza como ambiguo
(`42702: column reference "X" is ambiguous`) — pasó tres veces en esta fase
(`cancelar_reserva_plaza`/`expirar_oferta_lista_espera` llamando al helper, y
`aceptar_oferta_lista_espera` filtrando por `estado` teniendo `estado` como
columna de su propio `RETURNS TABLE`). Se detectó con la verificación en vivo
(`execute_sql` + `ROLLBACK`) antes de abrir PR — se arregla calificando SIEMPRE
con alias de tabla (`reservas AS r`, `r.estado`) cualquier columna que
coincida en nombre con una salida de `RETURNS TABLE`, migr
`20260731132000`.

### Fase 2c — mínimo de asistentes para confirmar la clase (completa)

Tercera y última pieza de "Fase 2". `studios.minimo_asistentes_por_clase`
(default `0` = sin mínimo) + `tipos_clase.minimo_asistentes_por_clase`
(nullable = hereda), migr `20260731140000`. Si a **2 horas fijas** del inicio
(no configurable) no hay suficientes reservas `CONFIRMADA`, la sesión se
cancela sola — **sin fase de aviso previo** (a diferencia de
`confirmacion-riesgo`, que sí tiene ASK + CORTE): coherente con que la regla
es opt-in, el estudio ya sabe lo que implica al activarla.

⚠️ **Única regla de "Fase 2" cuyo override se resuelve con `heredaOverride()`
en TS, no en SQL directo** — a diferencia de Fase 2b. Motivo: el chequeo
ocurre solo dentro del cron server-side (`lib/inngest/minimo-asistentes.ts`,
cada 15 min, sin fan-out — query global de sesiones en la próxima ventana de
2h, mismo patrón de doble filtro SQL+JS que `confirmacion-riesgo`), nunca en
una RPC invocable por `authenticated`, así que no aplica la restricción que
forzó SQL directo en `cancelar_reserva_plaza`.

⚠️ **Única cancelación de sesión completa que SÍ devuelve bono** — decisión de
producto explícita: `dbCancelarReservasPorSesiones` (cancelación manual de la
propietaria, cliente) sigue sin devolver, pero `cancelarSesionPorMinimoNoAlcanzado`
(`lib/db/supabase-data-admin.ts`, server-only) sí, porque aquí no es decisión
de la socia. Reutiliza `devolverBonoServidor`/`datosClaseParaEmail` ya
existentes; `CancelacionClaseEmail` ya soportaba `bonoDevuelto`, no hizo falta
plantilla nueva. Nueva columna `sesiones.cancelada_motivo` (NULL = manual,
`'minimo_no_alcanzado'` = automática) para distinguir en el histórico.

Sin RPC ni política RLS nueva — migración puramente aditiva, `get_advisors`
sin hallazgos nuevos. Verificado en vivo con `execute_sql`+`ROLLBACK` las
queries de cancelación (idempotencia del compare-and-set incluida); el
tramo de devolución de bono reutiliza lógica de `bono-logic.ts` ya testeada
aparte, no se pudo ejecutar end-to-end sin Supabase local (misma limitación
que las fases anteriores).

### Fase 3 — penalización económica por cancelación tardía/no-show (completa)

Última pieza de las 13 reglas de reserva/cancelación pedidas originalmente.
A diferencia de 1/2a/2b/2c, mueve **dinero real**: cargo a la tarjeta guardada
de la socia (`stripe.paymentIntents.create` vía `cobrarReciboOffSession`,
Connect direct-charge, la misma función que ya usan `charge-off-session` y el
cron de dunning — cero código nuevo en webhooks/disputas, todo heredado por
`metadata.origen`). `studios.penalizacion_importe_eur` (NULL/0 = desactivada)
+ `tipos_clase.penalizacion_importe_eur` (nullable = hereda), migr
`20260730225253`, más `studios.penalizacion_cobro_automatico` (default
`false` = espera aprobación manual de un rol con `puedeMoverDinero`, igual
que `charge-off-session` hoy) para que la propietaria elija automático o
manual — decisión de producto explícita, no un valor fijo.

Detección centralizada en BD, no en TS: cancelación tardía dentro de
`cancelar_reserva_plaza`, no-show vía trigger sobre `reservas` (cubre tanto
el barrido por lotes como el marcado manual del panel sin duplicar lógica —
mismo principio "la BD decide una vez" que el resto del repo). Tabla nueva
`penalizaciones` (no una columna en `reservas`): una detección encadena
`DETECTADA → OMITIDA_*/PENDIENTE_APROBACION → RECIBO_CREADO → COBRADA/FALLIDA`,
y ese historial de POR QUÉ no se cobró (sin tarjeta, sin consentimiento,
revertida) tiene que quedar auditable sin leer logs. RLS igual que
`recibos`/`suscripciones`: solo PROPIETARIO/RECEPCION.

Cron `lib/inngest/penalizaciones.ts` (cada 10 min) crea el recibo y cobra
(automático) o lo deja `PENDIENTE_APROBACION` (manual, endpoint nuevo
`app/api/penalizaciones/aprobar/route.ts` + card `PenalizacionesPendientes`
en el dashboard — "una lista + un botón", no una pantalla nueva). Guard de
consentimiento: reutiliza el mecanismo YA EXISTENTE, no uno nuevo —
`AceptacionContrato.versionTexto` guarda el TEXTO LEGAL COMPLETO aceptado
(`textoLegalCompleto(studioConfig)`), no un número de versión, así que basta
comparar el texto guardado contra el texto actual: en cuanto se activa la
regla y se añade la cláusula (`lib/legal-textos.ts`), toda socia existente
deja de tener consentimiento vigente automáticamente (su texto guardado no la
incluye) sin construir un esquema de versiones paralelo.

⚠️ **El corte automático por riesgo de plantón NO debe penalizar, y
`p_socio_id IS NOT NULL` era la señal equivocada para excluirlo.** La primera
migración excluía ese caso (`confirmacion-riesgo.ts`, nadie pulsó "cancelar")
asumiendo que solo esa llamada pasaba `p_socio_id: null` — pero el panel de
staff (`dbCancelarReservaPlaza`) TAMBIÉN pasa `p_socio_id: null`, así que esa
condición habría desactivado la penalización en el caso más común de verdad
(cancelación desde mostrador). Encontrado con `execute_sql`+`ROLLBACK` antes
de abrir PR. Arreglado con un parámetro explícito nuevo,
`p_omitir_penalizacion boolean default false`, puesto a `true` solo por el
caller automático — corrección en una segunda migración
(`20260730225804`), con el consiguiente re-endurecimiento de grants (ver
gotcha de abajo, van dos veces en esta fase por el mismo motivo que Fase 2a/2b).

⚠️ **Gotcha de grants, tercera vez en el repo**: cambiar la firma de
`cancelar_reserva_plaza` (3→4 argumentos, dos veces en esta fase) crea de
nuevo una función con `EXECUTE` por defecto a `PUBLIC` — `REVOKE ... FROM
PUBLIC` + `GRANT` explícito + `has_function_privilege` en cada migración que
toque la firma, sin excepción.

**Descartado a propósito, no reabrir**: anclar la aprobación manual en
`automation_logs` (su CHECK `(rule_id IS NOT NULL) <> (automatizacion_id IS
NOT NULL)` exige una fila real de `automation_rules`/`automatizaciones`, y
`automatizaciones.accion` no tiene ningún valor de cobro — habría que
falsear el origen) o en el `Recomendacion`/Decision OS existente (`COBRAR_RECIBOS`
en `lib/decision/tipos.ts` está atado a `decisionSessionId`/`algorithmVersion`/
el motor de especialistas, no pensado para insertarse ad-hoc desde un cron
ajeno a esa pipeline). Se construyó un endpoint y una tabla dedicados en su
lugar.

⚠️ **Límite conocido, no resuelto por diseño**: si un no-show se marca por
error y se revierte (`OMITIDA_REVERTIDA`), y la misma reserva se vuelve a
marcar no-show genuinamente después, el trigger NO regenera la detección
(`ON CONFLICT (reserva_id, tipo) DO NOTHING` ve la fila ya existente y no
hace nada, sin importar su estado). Verificado en vivo con
`execute_sql`+`ROLLBACK`. Caso raro (revertir y volver a marcar la MISMA
reserva) — se documenta en vez de complicar el trigger con una máquina de
estados completa para un caso límite sin pedir explícitamente esa cobertura.

Ni `cancelarSesionPorMinimoNoAlcanzado` (Fase 2c) ni
`dbCancelarReservasPorSesiones` (cancelación manual de serie) llaman nunca a
`cancelar_reserva_plaza` — ambas hacen `UPDATE reservas` directo — así que
ninguna cancelación masiva de sesión iniciada por el estudio puede disparar
una penalización por construcción, sin necesitar ningún flag adicional ahí.

No probado end-to-end con un `paymentIntent` real (sin Stripe test mode
configurado en este entorno) — mismo tipo de limitación que fases
anteriores, pero aquí más seria por ser dinero real: recomendado probar el
primer cobro en un estudio de prueba antes de activar la regla para clientes
reales.

Con Fase 3 cerrada, las 13 reglas de reserva/cancelación pedidas
originalmente están **completas**.

## P2-5 — rediseño de los especialistas del Decision OS (completo)

Feedback de una cadena de 2 sedes señaló 4 puntos ciegos estructurales en
los especialistas del Centro de Control. El primer borrador de diseño
proponía una reescritura completa de la página ("una tarjeta por
especialista" → "lista única"); revisando la página real
(`app/(dashboard)/centro-de-control/page.tsx`) resultó que **ya era una
lista única priorizada** (Prioridades + Más situaciones, `RecommendationCard`
en grid plano) — las tarjetas por especialista (`SpecialistCard`, "Mi
Equipo") ya vivían en una sección secundaria, no en la vista principal. El
diseño se corrigió sobre la marcha: los puntos ciegos de datos sí eran
reales, pero la reescritura de página no hacía falta — solo faltaba
conectar dos cosas que el backend ya calculaba y la UI nunca mostraba.

**Priorizador de conflictos** (nuevo, pieza central): dos especialistas
pueden tener razón cada uno por su lado y proponer acciones incompatibles
sobre la misma sala/instructora/tipo de clase (p.ej. Ingresos "abre otra
clase" vs Agenda "esta franja va vacía, fusiónala" — literalmente opuestos,
ver comentario de `agenda.ts`: "Cubre el punto ciego de Ingresos, que solo
detecta clases que se LLENAN"). `coordinarColisiones` (`director.ts`) solo
dedupeaba por `socioId` compartido. `Candidata` gana `instructorId`/
`tipoClaseId`/`salaId` opcionales; nuevo `lib/decision/conflictos.ts`
(`detectarConflictos`) con una tabla explícita de pares de
`TipoRecomendacion` opuestos — **no oculta ninguna candidata**, anota
`datosUsados.conflictoCon` en ambas (mismo principio que
`coordinarColisiones`) para que la propietaria decida, no el motor.
`RecommendationCard` ahora pinta ese aviso cuando aparece.

**SnapshotEstudio gana contexto de tamaño**: `sustituciones` (90d) +
`contexto: { nSociasActivas, antiguedadDatosDias, cadenaId, nSedesCadena }`
— base para calibrar umbrales por estudio pequeño/grande/cadena en vez de un
umbral fijo único. `antiguedadDatosDias` sale de `Studio.creadoEn` (alta en
Tentare, no año de apertura del negocio).

Los 4 puntos ciegos, cerrados:
1. **EQUIPO nunca miraba `sustituciones`** — nueva regla E2: una
   sustitución en `contactando` pasado un margen generoso (3h, muy por
   encima del ciclo de reintento automático por candidata, `VENTANA_MAX`=45min)
   genera aviso apuntando a la instructora original de la clase sin cubrir.
2. **INGRESOS exigía lista de espera ≥2 O 5 semanas llenas** antes de
   generar cualquier señal — un estudio nuevo no puede tener 5 semanas de
   historial. Con `contexto.antiguedadDatosDias < 42`, 3 ocurrencias llenas
   ya basta; el techo de confianza sigue en MEDIA (nunca ALTA) porque
   `patronSostenido` sigue exigiendo 5+ semanas.
3. **FINANZAS usaba un índice de UNA suscripción por socia**
   (`suscripcionActivaPorSocio`, pensado para "valor mensual") — con
   `planes_por_tipo_de_clase` una socia puede tener un plan MENSUAL Y un
   bono sueltos a la vez, y el índice solo veía el primero. F1 pasa a
   iterar todas las suscripciones ACTIVAS del snapshot, no el índice de una
   por socia.
4. **CAPTACION dependía de `socio.leadStage`**, que el importador desde
   otra plataforma nunca rellenaba — arreglado en el importador (raíz del
   problema: `lead_stage: 'ACTIVA'` por defecto en altas migradas con
   historial), no en el especialista.

**`DecisionFlag` por especialista, activado**: existía en el esquema
(`dbGetFeatureFlags`/`dbSetFeatureFlag`) pero **sin un solo caller** —
confirmado con grep antes de tocar nada. `motor.ts` ahora filtra
`ESPECIALISTAS` antes de correr nada (opt-out: `false` apaga, ausente o
`true` deja correr). De paso, `CAPTACION` añadido al enum (hueco de
catálogo — `EspecialistaId` ya la tenía).

⚠️ **Gotcha de Inngest, nuevo en esta fase**: `dbGetFeatureFlags` devuelve
un `Map`. Llamarlo directo dentro de un `step.run` lo habría serializado a
`{}` en el replay — el mismo motivo por el que `memoria`/
`dbListMemoriaRows` ya existían separados (comentario en el propio fichero,
`lib/inngest/decision.ts`, que casi se pasa por alto). Nueva
`dbListFeatureFlagRows` devuelve filas crudas; el `Map` se reconstruye
SIEMPRE fuera del step.

**Fuera de este cambio, deferred explícitamente**:
- **Modo aprendizaje granular por especialista** (mostrar resultados de los
  especialistas que ya tienen suficiente historial en vez de ocultar TODO
  el bloque con `!resumen_diario`): toca la forma de `/api/decisiones` y
  necesita verificación visual real antes de tocar el camino que decide qué
  ve la propietaria en su primera pantalla — no se construyó sin poder
  verlo en un navegador autenticado (sin credenciales de sesión de prueba
  en este entorno).
- **Calibración de umbrales con `contexto.nSedesCadena`**: la base
  (`contexto.cadenaId`/`nSedesCadena`) ya existe en el snapshot, pero no
  hay hoy una cadena real de tamaño suficiente para calibrar contra ella —
  fase futura opcional, no construir umbrales a ciegas.
- Ningún especialista `CADENA` nuevo ni dashboard agregado de cadena dentro
  de Decision OS — `cadena_id` sigue siendo puramente de billing.

**Verificación**: `npx tsc --noEmit` + `node --test` en cada PR (>1170
tests en verde en todo momento); tests de regresión explícitos para dos
bugs encontrados DURANTE la implementación (no antes de abrirla) — el
early-return de EQUIPO E1 ("sin clases futuras = vacaciones") descartaba
también las candidatas de E2 ya detectadas, y el gotcha de Inngest de
arriba. UI (`RecommendationCard`/`especialista-info.ts`) no verificada en
navegador autenticado — mismo tipo de limitación que fases anteriores de
este repo cuando no hay credenciales de prueba en el entorno.

## P2-14 — instructora en varias sedes de la misma cadena (completo)

Petición explícita: una instructora debe poder trabajar en varias sedes de
la misma cadena, con horario/disponibilidad/permisos **distintos por
sede**, diseñado desde el principio (no una tabla puente añadida después).

**Decisión central**: formalizar filas múltiples en `instructores` (una
fila = una persona en una sede, con su propio rol/tarifa/disponibilidad) en
vez de una tabla puente `instructor_sedes` nueva. El código YA trataba esto
como modelo real en cuatro sitios antes de tocar nada:
`mis_estudios()` lista TODAS las sedes de un `auth_user_id` sin `LIMIT 1`;
`current_studio_id()` hace `ORDER BY studio_id LIMIT 1` con un comentario
propio que dice "porque ahora es un caso central con cadenas, no ya raro";
`resolverInstructorId` (`mi-disponibilidad`) documentaba el riesgo de
"ficha duplicada" como conocido; `instructor_tarifas` (PR #562) ya daba
tarifas independientes por sede por construcción, sin haberlo diseñado a
propósito. Faltaba solo la garantía de integridad.

`UNIQUE (auth_user_id, studio_id)` en `instructores` (migr
`20260731003736`) — verificado en prod ANTES de escribir la migración que
no había duplicados reales, así que no hizo falta limpieza previa.

Piezas:
- **Fix de `guardarDisponibilidad`** (`lib/sustituciones/disponibilidad.ts`):
  el DELETE borraba solo por `instructor_id`, sin `studio_id` — con el
  `UNIQUE` ya no puede cruzar de sede, pero se añadió el filtro como
  defensa en profundidad. Verificado en vivo (`execute_sql`+`ROLLBACK`) que
  el borrado de una sede no toca la disponibilidad de otra.
- **Alta cross-sede** (`app/api/equipo/route.ts`, POST): si la instructora
  ya tiene ficha activa en OTRA sede de la MISMA cadena, se vincula su
  `auth_user_id` directo (sin flujo de invitación/self-claim). La búsqueda
  por email queda SIEMPRE acotada a `cadena_id` resuelto desde
  `sesion.studioId` — nunca abierta a toda la tabla `instructores`.
  Revisado por `tentare-seguridad` antes de mergear (pedido explícito del
  diseño): sin bloqueantes; confirmó que la falta de self-claim en este
  camino es coherente con el resto del alta de equipo (la propietaria ya
  decide unilateralmente sin pedir permiso a la instructora en el flujo
  normal) — el único matiz es de producto (la instructora se entera de la
  sede nueva al verla en su selector, no antes), no de seguridad.
- **`mis_estudios()` gana `rol`**: el rol efectivo por sede (PROPIETARIO si
  es dueña de esa sede, si no el rol de su fila `instructores` en esa
  sede). El selector de sede (`SedeActiva`) lo muestra junto al nombre de
  cada sede — para que no sorprenda un cambio de permisos al cambiar de
  contexto (puede ser MANAGER en una y solo INSTRUCTOR en otra).

⚠️ **Gotcha de grants, otra vez** (van varias veces en este repo):
`mis_estudios()` cambió de firma (gana la columna `rol`) → Postgres crea un
objeto función nuevo con `EXECUTE` por defecto a `PUBLIC` → `REVOKE ...
FROM PUBLIC` + `GRANT` explícito + `has_function_privilege` verificado, sin
excepción. De paso se corrigió un advisor `function_search_path_mutable`
que ya tenía la función original (no relacionado con el cambio de firma,
aprovechado en la misma migración).

**Fuera de alcance, explícito**: herencia "cadena → override sede" para
rol/tarifa/disponibilidad (prematuro, esas reglas no tienen un "default de
cadena" con sentido); sincronizar nombre/avatar/color entre filas de la
misma persona (contradice "permisos diferentes por sede", pedido
explícitamente); vista combinada de ambas sedes a la vez (`sesion_activa`
sigue siendo una sede activa por vez); fusión automática de fichas
duplicadas existentes (ninguna encontrada en prod, no hizo falta).

## El Umbral — mensaje único diario del Decision OS (Fase 1, completa)

Rediseño de producto del Decision OS (varias rondas de exploración con el
usuario: crítica de Centro de Control, el bucle de hábito, el ejercicio del
"mensaje único" con Contrato + 5 puertas, un prototipo navegable) llevado a
código. La idea: en vez de una lista de recomendaciones para revisar, el
sistema decide cada día si hay UNA sola cosa que merezca interrumpir a la
propietaria, lo dice por push, y esa misma frase es lo primero que se ve al
abrir Centro de Control — con la evidencia oculta hasta que se pide.

**Reutiliza el pipeline existente, no lo rehace.** `lib/decision/umbral.ts`
(`elegirMensajeDelDia`) es una fase de arbitraje NUEVA sobre
`CandidataPriorizada[]` (ya calculado por `motor.ts`/`prioridad.ts`) — cinco
puertas puras (decae/necesita criterio humano/novedad/acción clara/impacto
relativo al tamaño del estudio), todas deben pasar. La puerta 2 ("necesita
criterio humano") no reimplementa nada: el llamador (`lib/inngest/decision.ts`)
excluye por `dedupeKey` las candidatas que el piloto automático YA seleccionó
para auto-ejecutarse este mismo ciclo (`autonomia.ts`, preexistente) — si
autonomía está inactiva para ese estudio, la candidata sigue siendo elegible
para el mensaje, no se descarta en falso. El círculo de aprendizaje
(`Seguimiento`) tampoco es motor nuevo: `recomendacion_outcomes` y
`medirOutcomeFn` ya existían de punta a punta (Fase MVP original); esta fase
solo construyó la UI que lo enseña, incluyendo el caso `NEGATIVO` con tono
humilde.

**Persistencia**: tabla nueva `decision_mensajes_dia` (migr `20260731123128`),
`UNIQUE(studio_id, fecha)` — refuerza "nunca dos mensajes el mismo día"
también en el esquema, no solo en la función pura. Columna
`studios.decision_contrato_visto_en` (mismo patrón que
`bienvenida_vista_en`/`onboarding_descartado_en`) para el Contrato, mostrado
una sola vez dentro de Centro de Control (no sustituye el layout entero como
la bienvenida — es una promesa sobre esa pantalla, no sobre el producto).

**Notificación**: evento nuevo `DECISION_MENSAJE_DIA` (categoría `decisiones`,
`canales: ['PUSH']`, audiencia `propietaria`) — deliberadamente sin
EMAIL/WHATSAPP/SMS: un canal más diluiría la promesa de "solo interrumpo
cuando merece la pena". `dedupKey` por `studioId:fecha`, no por `dedupeKey`
de la candidata — refuerza el límite de un push al día también en el motor
de notificaciones.

**UI**: `VeredictoDelDia` es el nuevo elemento principal de Centro de
Control, por encima de `PilotoAutomatico`. Nada de lo que había antes se
borró — toda la pantalla previa (Prioridades/Más situaciones/Mi Equipo/etc.)
sigue existiendo tal cual, detrás de un desplegable "Ver todo el detalle"
colapsado por defecto.

**Fuera de esta Fase 1, documentado a propósito**: calibración adaptativa
real del Umbral a partir del histórico de aceptación/descarte por
propietaria (hoy es una heurística estática de € por socia activa/sede); la
prueba comparativa "no hice ninguna promoción y aun así crecieron los
ingresos" (necesita lógica de comparación de métricas nueva); un resumen
semanal enviado activamente (hoy solo se muestra al abrir la app si la
semana fue silenciosa).

### Fase 2 — el Umbral aprende por estudio (completa)

Cerrado el hueco "calibración adaptativa" de arriba, pedido por el CEO tras
recoger feedback de su co-fundador dev y 6 propietarias reales de que Fase 1
se sentía incompleta. `calibrarUmbral()` (`lib/decision/umbral.ts`) ajusta
las puertas 1 (urgencia) y 5 (impacto) por `tipo` con el historial DECIDIDO
de ESE estudio (90d, mínimo 5 muestras para no calibrar con ruido): tasa de
seguimiento ≥80% → exige un 0.10 menos de urgencia y un 40% menos de
impacto; ≤30% → exige un 0.15 más de urgencia y el doble de impacto; entre
medias, sin cambios (mismo comportamiento que Fase 1). Acotado en ambas
direcciones (urgencia nunca baja de 0.30 ni sube de 0.65) para que una racha
corta no lo desboque.

Dato de origen: `dbCalcularSeguimientoPorTipo` (`lib/decision/db.ts`) cruza
`decision_mensajes_dia` (qué fue alguna vez el mensaje del día) contra
`recomendaciones.estado` — cuenta como "seguida" APROBADA/EJECUTADA, como
"no seguida" RECHAZADA/FALLIDA, y **excluye PENDIENTE** (pospuesta o sin
tocar todavía no es ni sí ni no). Dos consultas, no un join — supabase-js no
cruza dos tablas por id crudo sin una FK-embed declarada.

Wiring en el cron (`lib/inngest/decision.ts`, paso `umbral-mensaje-del-dia`):
el `Map<TipoRecomendacion, TasaSeguimiento>` se construye DENTRO del propio
`step.run`, nunca se devuelve como resultado del step — no aplica el gotcha
ya documentado de Maps serializándose a `{}` en el replay de Inngest (ese
gotcha es sobre lo que un step *devuelve*, no sobre variables locales usadas
dentro de él).

Sin UI nueva — es calibración silenciosa, coherente con "el Umbral nunca se
explica, solo el Contrato se ve". Sin migración — toda la señal ya existía
en tablas previas.

⚠️ **Hallazgo aparte, sin relación con esta feature — CERRADO**: al verificar
`list_migrations` contra `dwqvdycjcffqwfkzapvi` antes de numerar esta
migración, pareció que había ~40 migraciones locales sin aplicar en remoto
(comparando por timestamp de fichero, justo la trampa que ya documenta este
mismo fichero más abajo). Investigado por separado cruzando por NOMBRE
contra `list_migrations` y verificando cada divergencia con `execute_sql`:
**todas** estaban ya aplicadas en remoto (bajo nombres distintos, por un
squash/renumeración antiguo, o por sesiones en paralelo). Se encontraron y
corrigieron dos ficheros locales obsoletos: `20260731150000_socios_email_...`
tenía un bug (índice sin excluir `borrado_en`) que nunca llegó a aplicarse
porque otra sesión ya había aplicado la versión correcta bajo
`20260730231442` — renombrado y corregido para que coincida.

**RESUELTO (2026-08-06)**: la nota anterior daba por "sin resolver"
`20260730109000_sesiones_reservas_solo_propias_instructor.sql` y
`20260730110000_editar_serie_desde_restringe_instructor.sql` — pero esa nota
quedó desfasada nada más escribirse: esos dos nombres de fichero **no
existen en `main`** (`git show origin/main:supabase/migrations/<fichero>`
falla con "existe en disco, pero no en origin/main"). Solo estaban en la
rama `claude/redesign-team-panel-7c9716`, que en el momento de investigar
esto iba 134 commits por detrás de `main` y no tenía ningún PR abierto —
sus propios PRs ya se habían mergeado todos por separado. Otra sesión ya
había hecho el renombrado correcto DIRECTAMENTE en `main` (mismo patrón que
el caso de `20260731150000_socios_email_...` de arriba): las piezas reales
son `20260730012600_sesiones_reservas_solo_propias_instructor.sql` y
`20260730012700_editar_serie_desde_restringe_instructor.sql`, ya con el
timestamp de aplicación real. No había nada que tocar en `main` — la única
acción real fue corregir esta nota, que describía un problema ya resuelto
en otro sitio.

## El captcha invisible: `appearance` NO basta, hace falta `execution`

Turnstile tiene dos parámetros que suenan igual y no lo son, y confundirlos
costó **dos despliegues fallidos seguidos** (`components/auth/turnstile-widget.tsx`):

- `appearance` → cuándo se **VE** el widget.
- `execution` → cuándo **CORRE** el desafío. Su valor por defecto (`'render'`)
  lo arranca al pintar, y entonces `appearance` no tiene nada que ocultar.

La combinación que lo deja invisible de verdad es **`execution: 'execute'` +
`appearance: 'interaction-only'`**, medida en producción (2026-08-10) contra la
site key real: en reposo 0 px y sin token; tras `execute()`, token en 3,5–7 s y
sigue midiendo 0 px. Historial: `interaction-only` a secas (#832) tumbó el
acceso entero; `appearance: 'execute'` a secas (#842) lo devolvió pero dejó el
recuadro puesto; cerrado en #843.

Consecuencias que arrastra y que hay que respetar en cualquier pantalla nueva:

- **El token se pide AL ENVIAR y tarda segundos.** Todo formulario debe encender
  su estado de carga **antes** de `await pedirToken()` (se pasó por alto en
  `/reservar/[slug]`, #843) y no dejar pulsar dos veces.
- **Nada de `mt-3`/`mb-3` alrededor del widget**: mide 0 px casi siempre y el
  margen deja aire en blanco permanente.
- **El widget se cae y no vuelve solo** (`Error: 300031`, «Turnstile Widget seem
  to have crashed»): a partir de ahí `execute()` no emite ningún token más.
  `useCaptcha` lo reinicia hasta 3 veces por carga (#852), y el reinicio va
  también en el TIMEOUT porque en el caso medido **el `error-callback` nunca se
  disparó** — el widget se quedó mudo, no dio error.

⚠️ **Verificar SIEMPRE en una pestaña limpia por prueba.** Pedir varios tokens
seguidos en la misma pestaña provoca ese 300031, y el síntoma es idéntico al de
un acceso roto en producción (30 s sin token). Por poco se revierte un
despliegue sano por esto: en pestaña nueva daba token en 5,7 s.

Quién verifica el token **no es la app, salvo en un sitio**: en las cinco
pantallas de auth lo valida gotrue (el captcha se exige a nivel de PROYECTO en
Supabase). El único endpoint propio que lo comprueba es
`/api/public/interes-lanzamiento`, vía `lib/auth/captcha-servidor.ts` (#847), y
necesita `TURNSTILE_SECRET_KEY`; sin esa variable devuelve `'ok'` sin llamar a
nadie. Fail-CLOSED en el veredicto de Cloudflare, fail-OPEN si la llamada no
llega a completarse.

## ⚠️ Un merge de solo documentación NO despliega

`vercel.json` lleva un `ignoreCommand` que **cancela el build** cuando el diff
contra el commit anterior solo toca `docs/**`, `**/*.md`, `e2e/**` o
`**/*.test.ts`. Es deliberado (ahorra builds), pero tiene una trampa: el check
de Vercel sale **verde** igualmente, con el texto «Canceled by Ignored Build
Step». Verde ahí significa «no había nada que construir», no «desplegado».

Costó una hora de diagnóstico equivocado: tras añadir `TURNSTILE_SECRET_KEY` en
Vercel se mergeó un PR de solo `.md` para forzar el despliegue, el check salió
verde, la variable seguía sin aplicarse y se dio por hecho que estaba mal
puesta. No lo estaba — **no había habido ningún build**.

Regla: para que producción recoja una variable de entorno nueva hace falta un
cambio que toque **código**. Y al comprobar un despliegue, mirar que el build
corrió de verdad, no solo que el check está en verde — es el mismo error de
categoría que ya documenta [[deploy-atascado-rate-limit-vercel]].

## Loop de calidad — conecta con las skills que ya existen, no las reinventes

Para trabajo no trivial (nueva funcionalidad, cambio de esquema, refactor con impacto),
sigue este orden y usa lo que ya está instalado en vez de rehacerlo:

1. **Analizar y diseñar** → agente `tentare-arquitecto` (o `graphify` para ver el grafo real
   de dependencias antes de tocar algo con muchas conexiones).
2. **Programar** siguiendo los patrones ya existentes (Contexts de React, RPC transaccional,
   convenciones de arriba).
3. **Refactorizar** → agente `tentare-refactor` (con el veto de god-files/frozen-features).
4. **Rendimiento** → agente `tentare-performance`, o skill `/code-review` con foco
   `efficiency` para una pasada general.
5. **Seguridad** → agente `tentare-seguridad` para el patrón "rol no comprobado en
   servidor"/RLS, o skill `/security-review` para un barrido completo.
6. **UX** → agente `tentare-ux`, verificado en navegador real (no solo leyendo el JSX).
7. **Pruebas** → agente `tentare-qa` (casos normales/límite/error/permisos/móvil-escritorio),
   o skill `/verify` para el flujo de verificación end-to-end estándar.
8. **Producto** → agente `tentare-producto` cuando la funcionalidad sea nueva y de peso, no
   para cambios menores.
9. **Documentar** solo lo que no sea obvio del código (decisión, no explicación); actualizar
   memoria de sesión si el hallazgo es una decisión o hecho de proyecto duradero.
10. **No romper nada** → antes de cerrar, repasa que el cambio no reabra ninguna de las
    decisiones ya cerradas de la sección anterior.

Dinero y Supabase específicos: usa siempre `tentare-stripe`/`tentare-supabase` para esas
áreas en vez de improvisar — ya conocen los flujos reales (Connect direct-charge, cron de
renovación, roles y RLS) y los errores ya cometidos antes en este repo.

## Qué se descartó deliberadamente de ECC (github.com/affaan-m/ECC) y por qué

ECC es un plugin de marketplace multi-lenguaje (Go/Java/Perl incluido) y multi-harness
(Claude Code, Codex, Cursor, Gemini, Zed, Copilot...) con 67 agentes, 281 skills y 94
comandos legacy pensado para instalarse tal cual en cualquier proyecto. Para Tentare
(un único stack, un único harness, un único dominio) eso es bulto genérico, no valor:

- **No se instaló el plugin** (`/plugin install ecc@ecc`) — habría traído 67 agentes y 281
  skills que en su inmensa mayoría no aplican a este stack.
- **No se trajo AgentShield** (escáner de seguridad genérico de ECC) — el skill
  `/security-review` ya instalado cubre ese hueco sin duplicar herramienta.
- **No se trajeron los 94 comandos legacy ni soporte multi-lenguaje/multi-harness** — este
  repo es Next.js/TypeScript exclusivamente sobre Claude Code.
- **No se añadieron hooks de enforcement** (bloquear commits sin test, etc.) — quedó fuera
  de este cambio por fricción/riesgo; si se quiere en el futuro, es una decisión aparte a
  confirmar explícitamente, no algo que se activó por defecto aquí.

Lo que sí se tomó de la idea de ECC: agentes especializados con propósito muy concreto,
reglas siempre cargadas, y un loop de calidad disciplinado — construido nativamente con lo
que Claude Code ya soporta en este proyecto, sin dependencias externas nuevas.
<!-- END:tentare-development-os -->

## Tentare Brain = Decision OS (no construir uno nuevo)

El "Tentare Brain" es `lib/decision/`, que ya existe y corre dos veces al día
(`lib/inngest/decision.ts`). Auditoría completa y plan de 6 fases en
`docs/TENTARE-BRAIN-AUDITORIA.md`. **Las 6 fases entregadas (2026-08-11).** No duplicar la capa: los especialistas nuevos se
añaden a `especialistas/contrato.ts`, no en pantallas sueltas.

- **`Prediccion` ≠ `Confianza`** (`lib/decision/prediccion.ts`). `Confianza` es
  cuánto se fía el motor de su diagnóstico; `Prediccion` es la probabilidad de
  que el hecho ocurra. Con menos de `MUESTRA_MINIMA` (5) observaciones devuelve
  **`null`, nunca un número** — y `null` NO es probabilidad cero. Quien lo pinte
  enseña siempre `base` (las cifras que lo sostienen) junto al porcentaje.
- ⚠️ **Nadie muta un `SnapshotEstudio` después de construirlo.** `construirIndices`
  cachea por identidad de objeto en un `WeakMap` (medido: 389 ms → 35 ms por
  análisis en un estudio de 850 socias). Si alguna vez hace falta cambiar un
  snapshot, se clona; modificarlo en sitio deja los índices viejos en silencio.
- **Las franjas recurrentes van en hora LOCAL del estudio**, no UTC
  (`franjaLocalDe`/`claveFranjaDe` en `senales.ts`). Con UTC, una clase de 00:30
  caía en el día anterior y una clase semanal se partía en dos franjas al cruzar
  el cambio de hora. `claveFranjaDe` es la única fuente del formato.
- **Nunca un porcentaje sin respaldo en pantalla.** La card de sustituciones
  enseñaba "Compatibilidad 87 %" que era `LEAST(99, GREATEST(55, score))` sobre
  una heurística fija — dos candidatas opuestas salían las dos al 99 %. Separado
  en *encaje* (barra, sin cifra) y *probabilidad* real
  (`lib/sustituciones/encaje.ts`), que solo aparece si hay historial.
- **Historial de sustituciones**: una oferta es un par (candidata, sustitución),
  no una fila de `sustitucion_contactos` (a una candidata se le avisa por email y
  luego por WhatsApp). Y el silencio cuenta como "no aceptó": **nadie escribe
  nunca el estado `'expirado'`**, así que contar solo aceptado+rechazado daría
  100 % a quien contesta 1 de cada 10 veces.

- **Agenda ya mira hacia delante** (A4/A5, fase 2). A1/A2/A3 son forenses
  (franjas que ya fueron mal); A4 pronostica una sesión FUTURA comparándola con
  la curva de reserva de su franja en el mismo punto (mismos días vista), y A5
  detecta la clase que se queda sin quien la dé. Tope de 3 avisos de A4 por
  pasada — sin él, 40 clases semanales ahogan el Centro de Control.
- ⚠️ **A5 no reabre la decisión de #558.** Confirmar una ausencia sigue sin
  disparar ninguna sustitución automática sobre las clases ya programadas: A5
  solo se lo CUENTA a la propietaria. El hueco que cierra es real — los 6 sitios
  que miran ausencias hoy (`ausenciaEnFecha`) lo hacen todos al ASIGNAR, ninguno
  revisa el horario ya hecho contra un bloqueo grabado después.
- **Un bloqueo de agenda se busca en `instructora_disponibilidad_excepciones`**
  (`tipo='bloqueo'`), no en `instructora_ausencias`: las vacaciones y bajas ya se
  materializan ahí como bloqueos diarios (migr 0101). Una tabla, no dos.
- **La afinidad con una clase pesa la costumbre horaria por encima de todo**
  (`candidatasPorAfinidad`). `candidatasParaHueco` (booking-logic) es binaria y
  responde a otra pregunta: quién PODRÍA venir, no a quién merece la pena avisar.
- **El portal PROPONE, no solo describe** (`lib/portal-sugerencias.ts`, fase 4).
  `getHomeCardContext` sigue decidiendo en qué momento está la socia; la
  sugerencia se le añade debajo sin tocar el tono que escribe la propietaria.
  Devuelve `null` si no hay hueco o su plan no cubre nada: **proponerle una clase
  que no puede reservar es peor que no proponerle ninguna**. Y el motivo va
  SIEMPRE con la propuesta — sin él es una sugerencia aleatoria.
- **`franjaLocalDe` vive en `lib/utils.ts`**, junto a `TZ_ESTUDIO`. La comparten
  el motor (`senales.ts` la reexporta) y el portal, que no deben importarse entre
  sí.
- **El Action Center del dashboard NO es un motor nuevo** (`lib/decision/action-center.ts`,
  fase 5): agrupa lo que `/api/decisiones` ya devuelve, con el mismo hook que el
  Centro de Control. Se pinta solo si hay algo pendiente, y va gateado por
  `puedeVer(rol, '/centro-de-control')` — es solo-propietaria.
- ⚠️ **Una sección nueva de la home del panel tiene que ir en `HOME_FIJAS_PRIMERO`
  si su sitio es arriba.** `aplicarLayout` mete los ids nuevos al FINAL del orden
  guardado, así que un estudio con la home ya personalizada se la encontraría
  abajo del todo.
- ⚠️ **Nada en `/dashboard` puede dar por hecha la forma de una respuesta de API.**
  Un `[...data.prioridades]` a secas con un `{}` por respuesta no rompe su
  tarjeta: rompe la pantalla principal del negocio. Lo destapó un e2e ajeno que
  mockea `/api/**` como `{}`.

### Fase 3 (dinero) — construida, NO probada con un cobro real

- ⚠️ **`socios.tarjeta_exp_*` (migr `20260811090114`) es el único sitio donde vive
  la caducidad de la tarjeta.** Se rellena por dos caminos y `lib/billing/
  caducidad-tarjeta.ts` es el único que sabe leerla de Stripe: el webhook al
  guardar una tarjeta nueva, y un relleno por goteo (25/pasada) DENTRO del cron
  de dunning — que ya corre para estos estudios y ya tiene el `stripeAccount`.
  **Nunca un cron nuevo**: Inngest sigue al ~84 % del plan free.
- ⚠️ **Una tarjeta 09/2026 vale hasta el ÚLTIMO día de septiembre.** `caducaAntesDe`
  lo resuelve; equivocarse ahí avisa a la socia un mes antes de tiempo, o tarde.
- **Las reglas de dinero avisan, nunca cobran.** Ninguna emite `COBRAR_RECIBOS`,
  y `confianzaRiesgoDeCobro` no puede llegar a ALTA — que es justo lo que el
  piloto automático exige para ejecutar solo. Una estimación no mueve dinero.
- **Un umbral de riesgo de cobro tiene que ser RELATIVO al estudio.** Con un 0.35
  absoluto no saltaba nunca: el suavizado hacia la media del estudio empuja a
  todos hacia ella. Y "cobra mal" no significa lo mismo donde entra el 98 % que
  donde entra el 70 %.
- **Una ventana de aviso fija miente.** F3 (bono que caduca sin usar) con 14 días
  fijos no habría avisado a tiempo de NINGUNO de los dos bonos reales que hay en
  producción. Va atada a la frecuencia real de cada socia.
- ⚠️ **Por Stripe no ha pasado un euro real**: 1 socia de 202 con tarjeta guardada,
  0 con SEPA. F4 no detectará nada hasta que las haya. Probar el primer cobro en
  un estudio de pruebas antes de fiarse de esto con clientas reales.
