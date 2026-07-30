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
distinguir) y el de `/login` (aunque ya existen `logo-stacked-core.png`/
`-manager.png` con export real de diseño, `/login` sigue sin poder usarlos porque el
rol no se conoce antes de autenticar — no es un hueco de asset, es la misma
limitación de siempre).

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
(cada minuto, sin fan-out por estudio — es una query global) solo hace el
aviso proactivo a la socia vía `expirarReservaPendiente()`; si el cron se
retrasara o no corriera un tick, la regla de negocio seguiría siendo
correcta, solo el aviso llegaría tarde.

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

Quedan sin tocar, a propósito: **plazo para aceptar plaza de lista de
espera** (Fase 2b — hoy la promoción sigue siendo automática e instantánea) y
**mínimo de asistentes para confirmar la clase** (Fase 2c); Fase 3
(penalización económica) sigue esperando diseño con `tentare-stripe`.

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
