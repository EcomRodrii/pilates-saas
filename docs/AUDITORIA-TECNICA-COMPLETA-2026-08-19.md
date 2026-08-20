# Tentare — Auditoría técnica y arquitectura completa (2026-08-19)

> Radiografía del estado real del código, verificada leyendo el repositorio y el
> esquema de Supabase en vivo (proyecto `dwqvdycjcffqwfkzapvi`). Cada afirmación
> cita `archivo:línea` o migración/tabla real. Donde algo no se pudo verificar,
> se dice explícitamente en vez de asumir.

---

## 1. Stack

- **Framework**: Next.js `16.2.9` (App Router), React `19.2.4`, TypeScript `^5`
  con `strict: true` y `allowImportingTsExtensions: true` (los imports
  relativos dentro de `lib/` necesitan `.ts` explícito — sin ello pasa en local
  y rompe en CI).
- **Node**: fijado solo en CI a `22` (no hay `.nvmrc` ni `engines` en
  `package.json`).
- **Base de datos**: Supabase/PostgreSQL. Sin ORM — cliente `@supabase/supabase-js`
  directo + tipos generados (`lib/db-types.ts`, regenerado con
  `scripts/gen-db-types.py`, comprobado en CI contra deriva).
- **Auth**: Supabase Auth (GoTrue), un único `auth.users` para todo el
  producto (panel de estudio, portal de socia, Tentare Network e `/interno`
  comparten identidad, pero **no** autorización — ver §5-6).
- **Pagos**: Stripe (Connect direct-charge para socias, suscripción SaaS
  normal para estudios), `stripe ^22.3.0`.
- **Jobs**: arquitectura **híbrida** — pg_cron+pg_net para barridos sin estado
  (bucket A) e Inngest `^4.12.0` para todo lo que necesita reintentos/espera
  durable o toca Stripe (buckets B/C).
- **Email**: Resend + React Email. **WhatsApp/SMS**: Twilio. **Push**:
  web-push/VAPID. **Storage**: Cloudflare R2 (+ Stream para vídeo).
  **Facturación fiscal**: Fiskaly SIGN ES (Veri*Factu).
- **Observabilidad**: Sentry (`@sentry/nextjs`, no-op sin DSN) + PostHog.
- **IA**: `@anthropic-ai/sdk`.
- **Testing**: unitarios con el test runner nativo de Node
  (`node --test --experimental-strip-types "lib/**/*.test.ts"`, **270
  archivos**, sin Jest/Vitest), E2E con Playwright (**144 specs**, contenedor
  oficial fijado en CI).
- **No hay** Server Actions (`grep "'use server'"` → 0 resultados), no hay
  Supabase Edge Functions (`supabase/functions/` no existe), no hay
  `middleware.ts` de Next.js (§5).
- **No hay** librería de estado global (sin Zustand/Redux/SWR/React Query) ni
  de fechas (sin date-fns/dayjs) ni de forms (sin react-hook-form) —
  todo hecho a mano en `lib/`.

## 2. Arquitectura general

```
Socia / Propietaria / Instructora (navegador)
        │
        ▼
Next.js App Router  ──┬── Server Components (marketing, SEO, layouts públicos)
  (Vercel, fra1)      └── Client Components (panel entero, portal, Network)
        │                       │
        │             fetch directo a Supabase JS
        │             (sin capa de caché intermedia)
        ▼                       ▼
app/api/* (236 route handlers) ─── RLS de Postgres (Supabase)
        │                                   │
        ├── RPC/funciones SQL (transaccionales, SECURITY DEFINER)
        ├── Inngest (jobs con reintentos, buckets B/C)
        └── pg_cron + pg_net (barridos sin estado, bucket A)
                    │
                    ▼
        Stripe · Resend · Twilio · Fiskaly · R2 · Sentry/PostHog
```

- **En el navegador**: casi todo el panel (`app/(dashboard)/*` es
  mayoritariamente `'use client'` — 117/249 páginas y 223/321 componentes
  llevan la directiva), el portal de socia, Tentare Network. React Contexts a
  mano hacen de "estado global" (no hay SWR/Query).
- **En servidor Next.js**: `app/api/*` (toda la mutación pasa por aquí, cero
  Server Actions), layouts con `generateMetadata` para SEO de páginas
  públicas, Inngest functions.
- **En Supabase directamente**: RLS como cerradura real (no la UI), RPCs
  `SECURITY DEFINER` para operaciones transaccionales (reservar plaza,
  cancelar, confirmar sustitución...), triggers (prueba gratuita, penalización
  por no-show), pg_cron para barridos periódicos.
- **Fuera**: Stripe (dinero), Resend/Twilio (notificaciones), Fiskaly
  (sellado fiscal), R2 (ficheros), Sentry/PostHog (observabilidad).
- **Dónde se validan permisos**: en dos sitios deliberadamente distintos —
  `lib/permisos-reglas.ts` es la "cortina" de UI (qué se muestra), las
  políticas RLS + comprobaciones explícitas en cada `route.ts` son la
  "cerradura" real. El propio repo tuvo un incidente donde solo existía la
  cortina (ver §33, C-1).

## 3. Frontend

**Estructura real de rutas** (`find` sobre `app/`, no inventario de memoria):
públicas de marketing (`/`, `/precios`, `/funcionalidades/*`,
`/comparativa/*`, `/recursos/*`, `/soluciones/*`, `/glosario`, `/seguridad`,
`/demo`, `/crear-estudio`), auth (`/login`, monolito de 512 líneas con
login+alta+OTP+Google+recuperación en un solo client component), el grupo
`(dashboard)` (panel de personal, ~35 secciones), `/portal/[slug]` (portal de
socia, con `/portal-preview` para preview sin login), `/interno` (backoffice
de la empresa Tentare), `/network` (marketplace de instructoras freelance),
más rutas de token de un solo uso (`/confirmar-reserva/[token]`,
`/aceptar-sustitucion/[token]`, etc.) y `/reservar/[slug]` (widget embebible
público, con alias `/i/[slug]`).

**Layouts y su función real**:
- `app/layout.tsx` (Server) monta los dos únicos providers verdaderamente
  globales: `AuthProvider` → `StudioProvider`.
- `app/(dashboard)/layout.tsx` es un wrapper fino que delega el gate real a
  `DashboardShell` (client): sin sesión → `router.replace('/login')`; rol sin
  permiso para la ruta → redirige a `/dashboard`.
- `app/interno/layout.tsx` hace fetch de sesión interna en un `useEffect` y
  su propio comentario dice explícitamente que es "de usabilidad, no de
  seguridad" — la autorización real vive en cada `/api/interno/*`.
- `app/portal/[slug]/layout.tsx` (Server, async) resuelve el estudio por
  slug y monta `StudioSlugGate → ThemeStyle → PortalAuthProvider → PortalShell`.

**Contexts principales**: `auth-context.tsx` (sesión de personal),
`studio-context.tsx` (el "god-context" del panel — carga todo el dato del
estudio), `core-context.tsx` (extraído deliberadamente de studio-context para
que Sidebar/Topbar no se re-rendericen con cualquier cambio), `panel-theme.tsx`,
`panel-privacy.tsx` (modo "ocultar cifras" para mostrador), `tour-context.tsx`,
`portal-auth.tsx` (sesión de socias, separada de `auth-context`).

**Patrón de carga de datos**: sin Server Actions ni SWR/React Query. Server
Components hacen `await` directo en páginas públicas de marketing/SEO; el
panel entero es cliente puro que llama a Supabase directamente
(`lib/studio-context.tsx`, `lib/supabase-data.ts`) o a `app/api/*` vía
`fetch` dentro de `useEffect`, sin capa de caché/revalidación.

**Loading/error**: solo 3 archivos en todo `app/` — `app/global-error.tsx`
(último cortafuegos, reporta a Sentry), `app/network/error.tsx` (con nota de
por qué no tiene `loading.tsx` hermano: rompería `notFound()` con streaming),
`app/(dashboard)/loading.tsx` (skeleton server-rendered mientras carga el
bundle cliente de ~2,3 MB). El resto de pantallas gestionan `cargando`/`error`
a mano con `useState`.

## 4. Mapa de rutas

| Área | Acceso | Backend que interviene |
|---|---|---|
| `/`, `/precios`, `/funcionalidades/*`, etc. | Pública | Ninguno (estático/SEO) |
| `/crear-estudio` | Pública → crea sesión | `dbCreateStudio`, trigger `trg_arrancar_prueba_gratuita` |
| `/login` | Pública | Supabase Auth, `/api/auth/destino-post-login` |
| `/reservar/[slug]`, `/i/[slug]` | Pública (widget embebible) | `/api/public/reserva`, `reservar_plaza` RPC |
| `/(dashboard)/*` | Personal autenticado, gateado por rol (`puedeVer`) | `app/api/*` + RLS + `lib/studio-context.tsx` |
| `/portal/[slug]/*` | Socia autenticada de ESE estudio | `PortalAuthProvider`, `app/api/public/*` |
| `/interno/*` | Solo `plataforma_admin` con permiso concreto | `lib/interno/auth.ts`, service-role tras `exigirPermiso` |
| `/network/*` (público) | Pública (marketplace) | `lib/network/publico.ts`, filtra `estado='published'` |
| `/network/mi-perfil`, `/crear-perfil` | Instructora freelance (identidad sin `studio_id`) | `app/api/network/perfil/*` |

Dentro de `(dashboard)`, quién ve qué se resuelve con `puedeVer(rol, path)`
(§6) — INSTRUCTOR es lista blanca de prefijos, MANAGER/RECEPCION son lista
negra sobre "todo menos".

## 5. Autenticación

**No existe `middleware.ts`** en el repo (confirmado por `find`/`grep`
exhaustivo). No hay guardia de Next.js Middleware protegiendo rutas a nivel
de edge. Toda la protección de cliente vive en `DashboardShell`
(`components/layout/dashboard-shell.tsx`):

1. Sin `session` → `router.replace('/login')`.
2. Sesión pero `estudio` nunca resuelve (p.ej. cuenta pura de Network) →
   timeout de 6s como red de seguridad, luego mensaje explícito.
3. Rol sin `puedeVer(pathname)` → redirige a `/dashboard`.
4. Suscripción bloqueada (`estadoBilling()`) → redirige a `/suscripcion`
   — **fail-open** mientras `BILLING_ENFORCED` no esté activo (decisión
   explícita, no bug).

**Esto no es la barrera real.** Cada endpoint de `app/api/*` vuelve a
verificar sesión y rol en servidor, y las tablas están protegidas por RLS —
el propio código lo dice literalmente en varios comentarios ("un cliente
manipulado no consigue nada").

**Login** (`app/login/page.tsx` → `lib/auth-context.tsx:125-134`):
`signInWithPassword` de Supabase. Al detectar sesión, un `useEffect` encadena:
normaliza nombre de Google → materializa `pending_studio`/`pending_freelance`
(metadata pendiente de alta) → reclama invitación de equipo →
`GET /api/auth/destino-post-login?producto=software` decide el destino final
(y hace `signOut()` si la cuenta es pura de Network) → `window.location.href`
(hard navigation deliberada, para forzar que `StudioProvider` se re-resuelva
desde cero).

**Alta de estudio** (`/crear-estudio`): 3 pasos (estudio → plan → cuenta).
Como puede exigirse confirmación de email, estudio+plan viajan en
`user_metadata.pending_studio` hasta que hay sesión real. Confirmación por
**código OTP de 6 dígitos**, no por enlace. Al volver con sesión,
`dbCreateStudio()` inserta con **id determinista** (hash de
`ownerAuthUserId+nombre`) para que un reintento choque por PK en vez de
duplicar. El trigger de BD `trg_arrancar_prueba_gratuita` **ignora cualquier
`trial_ends_at` del cliente** y fija siempre `now()+7 días` (solo si
`cadena_id is null`) — verificado en vivo que un payload falsificado no cuela.

**Recuperación de contraseña**: `resetPasswordForEmail` (no revela si el
email existe) → enlace a `/clave-nueva` → `updateUser({password})` sin
reautenticación (quien llega ya demostró control del correo vía el enlace).

**Multi-estudio**: `current_studio_id()` (SQL, `SECURITY DEFINER`) resuelve
en cascada sesión activa → primera instructora activa → primera propietaria;
filtra explícitamente `coalesce(instructores.activo, true)` (antes dar de
baja no revocaba acceso — bug cerrado). `mis_estudios()` devuelve TODAS las
sedes con el **rol efectivo en cada una** (puede ser MANAGER en una e
INSTRUCTOR en otra).

**Captcha (Turnstile)**: protege `/crear-estudio`, `/login`,
`/portal/[slug]/{acceso,login}`, `/reservar/[slug]`, cambio de contraseña.
Excepción legítima: login con Google (redirect a Google, no tiene sentido
captcha ahí). Supabase lo exige **a nivel de proyecto** — aunque el frontend
fallara en pedirlo, el servidor de Auth lo rechaza igual.

**Roles distintos, mismo `auth.users`**: panel de estudio usa
`instructores.rol`; `/interno` usa tablas propias (`plataforma_admin`/
`plataforma_permiso`) totalmente independientes de `studios`; Network es un
perfil sin `studio_id`. El endpoint `destino-post-login` es el único punto
que decide a cuál de los tres pertenece una sesión.

## 6. Roles y permisos

Roles reales (`lib/types.ts`): `'PROPIETARIO' | 'INSTRUCTOR' | 'RECEPCION' | 'MANAGER'`.

`lib/permisos-reglas.ts` es un módulo **puro** (sin React/Supabase, testeado
con `node --test`) — cada función tiene su espejo documentado en una policy
RLS o comprobación de servidor concreta:

| Función | Quién |
|---|---|
| `puedeVer(rol, path)` | INSTRUCTOR: lista blanca de prefijos (`/dashboard`,`/calendario`,`/citas`,`/clientas`,`/mensajeria`,`/mi-perfil`); MANAGER/RECEPCION: todo menos listas negras concretas |
| `puedeVerFichaClinica` | PROPIETARIO, INSTRUCTOR — **RLS confirmada**: `condiciones_salud`/`notas_progreso` son `FOR ALL` solo para esos dos roles |
| `puedeVerSemaforo` | + RECEPCION (semáforo sí, detalle clínico no) |
| `puedeMoverDinero` / `puedeVerFinanzas` | PROPIETARIO, RECEPCION — RLS espejo en `recibos`/`suscripciones`/`mandatos_sepa` |
| `puedeGestionarCalendario` | PROPIETARIO, MANAGER, RECEPCION |
| `puedeCrearClasesPropias` | + INSTRUCTOR, pero solo sobre `instructor_id = current_instructor_id()` (RLS) |
| `rolesQuePuedeAsignar` | PROPIETARIO reparte los 4 roles; MANAGER solo RECEPCION/INSTRUCTOR (no puede crearse un par ni ascenderse) |

**Inconsistencia UI-sin-RLS**: ya ocurrió una vez de verdad y quedó
documentada y cerrada (`0112_rls_escrituras_de_dinero.sql`, cita literal del
propio commit: *"de las 105 policies, 23 comprueban el rol y NINGUNA
mencionaba a RECEPCION: `lib/permisos.ts` era una cortina, no una
cerradura"*). Revisando el estado **actual**, no se encontró un caso nuevo de
ese patrón exacto — pero sí dos matices:
- `puedeGestionarAppsOAuth`/`puedeGestionarPortalHome` no tienen RLS propia
  (las tablas OAuth no tienen policy para `authenticated`) pero sí
  comprobación explícita en la API (`app/api/oauth/*`, `app/api/portal-bloques/*`).
- `puedeVerCentroNotificaciones` usa deliberadamente `service_role` (se salta
  RLS por diseño) — marcado en el propio código como riesgo a vigilar.

## 7. Base de datos

145 tablas en `public`, todas con `rls_enabled = true`. Resumen de las ~20
centrales (con PK/FK/checks reales, verificado con `list_tables` y
`execute_sql`):

- **`studios`**: tenant raíz. `owner_auth_user_id`→`auth.users`,
  `cadena_id`→`cadenas`. Checks: `plan∈{BASE,ESTUDIO,CADENA}`,
  `tipo_cuenta∈{ESTUDIO,FREELANCE}`.
- **`socios`**: clientas. `auth_user_id`→`auth.users`, self-FK
  `referido_por`→`socios`. **Soft-delete real** (`borrado_en`).
- **`instructores`**: una fila = una persona **en una sede** (P2-14).
  `UNIQUE(auth_user_id, studio_id)` — el mecanismo que garantiza multi-sede
  sin fichas duplicadas.
- **`sesiones`**: clases, una fila por ocurrencia (no hay motor RRULE).
  `serie_id` texto libre (sin FK a tabla de series — no existe tal tabla).
- **`reservas`**: `estado∈{CONFIRMADA,LISTA_ESPERA,ASISTIDA,CANCELADA,NO_ASISTIO,PENDIENTE_APROBACION}`.
- **`suscripciones`** / **`recibos`**: plan/bono y cobro. `recibos.estado∈{PENDIENTE,COBRADO,DEVUELTO,EN_CURSO,FALLIDO}`.
- **`penalizaciones`** (Fase 3): máquina de estados de 8 valores,
  `tipo∈{CANCELACION_TARDIA,NO_SHOW}`.
- **`sustituciones`**: motor baja→sustituta, 8 estados.
- **`mandatos_sepa`**, **`condiciones_salud`**/**`notas_progreso`**/
  **`respuestas_cuestionario_salud`**: datos sensibles con RLS estricta.
- **`decision_mensajes_dia`**: "El Umbral", `UNIQUE(studio_id, fecha)` —
  refuerza en esquema el "nunca dos mensajes el mismo día".

## 8. Relaciones entre tablas

```
auth.users ──owner_auth_user_id──▶ studios ──cadena_id──▶ cadenas
auth.users ──auth_user_id────────▶ socios (studio_id)
auth.users ──auth_user_id────────▶ instructores (studio_id, UNIQUE con auth_user_id)

instructores ──▶ sesiones (instructor_id) ──sala_id──▶ salas ──▶ spots
sesiones ──tipo_clase_id──▶ tipos_clase

socios ──▶ reservas (sesion_id, spot_id)
socios ──▶ suscripciones ──▶ recibos
reservas ──▶ penalizaciones ──▶ recibos
sesiones ──▶ sustituciones (instructor_original_id / sustituta_final_id → instructores)
socios ──▶ condiciones_salud / notas_progreso (ficha clínica)
studios ──▶ decision_mensajes_dia
```

Casi todo cuelga de `studio_id` como clave de tenant, salvo `cadenas`
(nivel superior) y `auth.users` (identidad).

## 9. RLS y seguridad

Patrón dominante verificado en vivo con `pg_policies`:

- **`recibos`**: SELECT → `puede_ver_finanzas()`; escritura →
  `puede_mover_dinero()` — ambos acotados a `studio_id = current_studio_id()`.
- **`suscripciones`**: SELECT abierto a **todo el personal** (decisión de
  producto deliberada, documentada); escritura sí exige `puede_mover_dinero()`.
- **`penalizaciones`**: solo política de SELECT (PROPIETARIO/RECEPCION); sin
  INSERT/UPDATE para `authenticated` — las escrituras corren con
  `service_role` desde el cron/trigger.
- **`notas_progreso`**: `FOR ALL` solo PROPIETARIO/INSTRUCTOR — RECEPCION
  excluida correctamente (el hueco de #561 estaba en la UI, no en RLS).
- **`sesiones`/`reservas`**: INSTRUCTOR solo sobre sus propias filas
  (`instructor_id = current_instructor_id()`), confirmado en vivo.

**Advisors de seguridad (66 lints), sin filtrar**:
- **1 ERROR real, ya CERRADO durante esta auditoría**: `public.respaldo_sereno_studio1`
  tenía RLS desactivada y `authenticated` con grants directos
  `INSERT/SELECT/UPDATE/DELETE/TRUNCATE`. Corregido en la migración
  `respaldo_sereno_studio1_rls`: RLS activada sin políticas (deny-by-default,
  mismo patrón que el resto de tablas internas) + grants revocados a
  `authenticated`/`anon`. Verificado en vivo: ya no aparece en `get_advisors`.
- 20 `rls_enabled_no_policy` (INFO): deny-by-default intencional, mismo
  patrón ya documentado en el repo.
- 43 RPCs `SECURITY DEFINER` ejecutables por `anon`/`authenticated`: la
  inmensa mayoría son RPCs de negocio ya auditadas (`reservar_plaza`,
  `cancelar_reserva_plaza`, etc.). **Dos nombres no cruzados contra el
  código cliente en esta pasada**: `heredar_plan_de_cadena()` y
  `propagar_plan_cadena()` — recomendable que una auditoría de seguimiento
  confirme si tienen `.rpc('...')` real en `lib/` o son solo internas de
  trigger con un grant heredado sin revocar (el gotcha recurrente de este
  repo).
- 21 `auth_rls_initplan` (WARN), **todos en las tablas `red_*` nuevas**
  (marketplace de instructoras) — regresión de rendimiento: el fix que ya se
  aplicó a otras tablas (`rls_auth_initplan_fix`) no se replicó aquí.
  **CERRADO durante esta auditoría** (migración
  `red_tablas_rls_auth_initplan_fix`): las 21 políticas reescritas para
  envolver `auth.uid()` en `(select ...)`, sin cambiar ninguna condición de
  negocio. Verificado en `get_advisors`: 0 hallazgos `auth_rls_initplan`
  restantes.
- Revisados y descartados como no accionables sin evidencia medida:
  27 `unindexed_foreign_keys` (INFO, mayoría en tablas nuevas de bajo
  volumen), 63 `unused_index` (INFO, ruido esperable con el volumen actual —
  `sesiones`=95 filas, `reservas`=169, `recibos`=45), y 22
  `multiple_permissive_policies` (WARN, funcionalmente correctas — fusionar
  políticas RLS por una ganancia no medida es más riesgo que beneficio en
  tablas de dinero/permisos).

**Migraciones**: 313 ficheros locales vs 319 nombres en remoto. 6 ficheros
sin coincidencia exacta, verificados uno a uno en vivo (columnas/RLS/grants
reales) — **los 6 SÍ están aplicados**, es puro drift de nombre por
squash/sesiones paralelas, patrón ya conocido en este repo. No hay ninguna
migración pendiente real.

## 10. Backend

**236 route handlers** bajo `app/api/`, agrupados por dominio: reservas,
público (23 rutas, para socias sin sesión de personal), billing/Stripe SaaS,
Stripe pagos de socias/POS/terminal, equipo/instructoras, Network (~25
rutas), interno (backoffice cross-tenant con service-role tras
`exigirPermiso`), cron (14 rutas, bucket A), decisiones (Decision OS),
webhooks, OAuth (proveedor de API pública propia), integraciones (Gmail,
Google Calendar, Kisi, Klaviyo, WhatsApp, Zoom).

**13 funciones de Inngest** (`lib/inngest/`), todas con `retries: 3` en las
funciones "procesar-por-estudio", fan-out en lotes de 500. Ejemplos:
`automatizacionesDispatcher`, `dunningDispatcher`, `decisionDispatcher`,
`escalarSustitucion`, `penalizacionesDispatcher`, `conciliarCobrosDispatcher`
(con catches locales por ítem, comentario explícito "esto es el remate, no
el cobro").

**pg_cron (bucket A)**: 13 jobs vía `net.http_post` a `/api/cron/*`
autenticados con secreto de Vault, más `cerrar_pruebas_vencidas()` como
función SQL directa sin salto HTTP. Arquitectura híbrida confirmada
explícitamente en el comentario de la migración
`20260811140000_pg_cron_bucket_a_resto.sql`.

**Sin Server Actions, sin Edge Functions de Supabase.** Toda mutación pasa
por `app/api/*` o RPC de Postgres.

**RPCs más relevantes**: `reservar_plaza`, `cancelar_reserva_plaza`,
`resolver_reserva_pendiente`, `promocionar_siguiente_espera`,
`ajustar_creditos`, `consumir_sesion_bono`, `devolver_sesion_bono`,
`reservar_numero_factura`, `confirmar_sustitucion`, `editar_serie_desde`,
`current_studio_id`, `mis_estudios`.

## 11. Flujos principales

**Crear estudio**: UI (3 pasos, `/crear-estudio`) → `signUp` con
`pending_studio` en metadata → OTP → sesión real → `dbCreateStudio` (id
determinista) → trigger `trg_arrancar_prueba_gratuita` fija 7 días locales →
UI redirige a `/dashboard`.

**Crear una clase**: `app/(dashboard)/calendario` → `addSesion`/
`addSesionesSerie` (inserta N filas de una vez con `serie_id` compartido,
sin motor de recurrencia) → INSERT directo, protegido por RLS
(`instructor_id = current_instructor_id()` si es INSTRUCTOR).

**Crear una reserva**: `/reservar/[slug]` → `/api/public/reserva` (JWT real
de Supabase, ya no acepta `{socioId,email}` del body — vulnerabilidad
histórica cerrada) → `crearReservaPublica` valida ventana/plan/tope →
RPC `reservar_plaza` (`SELECT...FOR UPDATE` sobre la sesión, decide
CONFIRMADA/LISTA_ESPERA/PENDIENTE_APROBACION atómicamente) → consume bono si
CONFIRMADA → notifica.

**Cancelar una reserva**: RPC `cancelar_reserva_plaza` (lock, decide
devolución de bono según ventana, promociona lista de espera, puede generar
`penalizaciones` si tardía). Cancelaciones masivas (serie borrada, mínimo no
alcanzado) usan `UPDATE` directo — **nunca** generan penalización por
construcción.

**Sustitución de instructora**: baja detectada (`crearBaja`, idempotente) →
ranking de candidatas (`rankear_candidatas` + afinidad horaria) → contacto
(email siempre, WhatsApp/SMS nudge) → aceptación vía RPC
`confirmar_sustitucion` (compare-and-set + reasigna `sesiones.instructor_id`
en la misma transacción, protegido por exclusion constraint GiST contra
doble-reserva de horario) → si nadie acepta, barrido periódico cierra a
`sin_sustituta`.

**Publicar perfil de Network**: la instructora solo puede llevar su perfil a
`draft/en_revision/hidden` (bloqueado por RLS incluso con UPDATE directo);
solo moderación interna (`network.moderate`) puede pasar a `published`. El
listado público filtra siempre `estado='published'`.

## 12. Calendario

**Fuente de verdad**: filas reales en `sesiones`, una por ocurrencia — no
hay motor RRULE que expanda al leer. Crear una serie de N semanas inserta N
filas de una vez, compartiendo `serie_id` (texto libre, sin tabla de
series).

**Editar serie desde**: RPC transaccional `editar_serie_desde` — un único
`UPDATE` sobre todas las ocurrencias desde el punto elegido; si cualquier
fila viola la exclusion constraint de solape (instructor o sala), Postgres
aborta el statement completo (rollback total, no hay estado parcial).

**Zona horaria**: `TZ_ESTUDIO='Europe/Madrid'` en `lib/utils.ts`. Importa
porque España cambia de offset dos veces al año (agrupar por hora UTC
"parte" una clase semanal en dos franjas distintas) y una clase de 00:30
local cae en el día UTC anterior — bug ya corregido, la RPC reconstruye
siempre en hora local Madrid.

**Aforo**: `aforo_efectivo()` resta averías de máquina solapadas. El lock
que evita overbooking es un `SELECT...FOR UPDATE` sobre la fila de
`sesiones` dentro de `reservar_plaza` — decisión + inserción atómicas en BD,
no en JS.

## 13. Reservas

Reglas resueltas con `heredaOverride()`: `NULL` en `tipos_clase` hereda el
default de `studios`. Orden de validación en `crearReservaPublica`: sesión
válida → ventana mín/máx → plan activo si exigido → tope de simultáneas →
RPC `reservar_plaza` (aforo con lock) → consumo de bono solo si CONFIRMADA.

**Lista de espera**: FIFO con `FOR UPDATE`. Con plazo de aceptación activo
(Fase 2b), no confirma instantáneo — abre una oferta con expiración; si
caduca, **pierde el sitio entero** (decisión de producto explícita, no se
reordena).

**No-show**: barrido diario marca `NO_ASISTIO`, un trigger dispara
penalización si está configurada. Revertir un no-show marcado por error
anula la penalización solo si aún no se cobró.

**Reembolsos**: el endpoint solo pide el reembolso a Stripe; el webhook
`charge.refunded` es quien marca `DEVUELTO`/genera rectificativa/avisa —
separación deliberada.

## 14. Pagos y facturación

**Fuente de verdad de cada dato**: el estado del `paymentIntent`/`charge` en
Stripe es la fuente para si un cobro se completó; `recibos.estado` en
Supabase es la fuente para lo que ve el negocio, y **solo se marca `COBRADO`
tras verificar `status==='succeeded'`** en la respuesta de Stripe — nunca
escritura optimista. Si el `UPDATE` de persistencia falla tras un cobro real
exitoso, se distingue explícitamente como `COBRADO_SIN_PERSISTIR` (nunca se
traga el fallo).

**`modo-stripe.ts`**: bloquea clave live fuera de producción y clave test en
producción, en las dos puertas de dinero (`/api/billing/checkout` y
`cobrarReciboOffSession`).

**Suscripción SaaS** (propietaria paga por usar Tentare): checkout sin
`trial_period_days` (la prueba es local, no de Stripe) — webhook con
idempotencia atómica por `event.id` y ámbito (`'billing'` vs `'connect'`,
separación que cerró un incidente real de cobro perdido el 8-ago-2026).

**Cobro a socias**: `cobrarReciboOffSession` — direct-charge vía Connect,
Idempotency-Key determinista, verifica `charges_enabled` antes de intentar,
verificación real del resultado antes de cualquier escritura optimista.

**Penalizaciones (Fase 3)**: detección en BD (RPC/trigger), `reciboId`
determinista para que reintentos converjan en vez de duplicar cobro. **No
probado con un cobro real de tarjeta** en este entorno — documentado
explícitamente como pendiente de validar en un estudio de prueba.

**Facturación (Veri*Factu/Fiskaly)**: sellado idempotente, falla-suave (si
Fiskaly cae, se conserva la huella propia y la factura no se pierde).

## 15. Bonos / créditos

Consumo atómico vía RPC `consumir_sesion_bono` (`UPDATE...WHERE
sesiones_restantes>0 RETURNING`) — el lock de fila serializa reservas
concurrentes; antes había un read-modify-write que sobre-consumía bajo
concurrencia (bug ya corregido). Devolución solo en las cancelaciones que
por diseño deben devolver (RPC de cancelación manual y "mínimo no
alcanzado"); las cancelaciones masivas de serie **no** devuelven bono
(decisión de producto documentada como pendiente de resolver, no bug).

## 16. Sustituciones

Ver §11. Diferencia clave entre las dos funciones de candidatas:
`candidatasParaHueco` responde "¿quién PODRÍA venir?" (binario: plan
vigente + disciplina ya asistida); `candidatasPorAfinidad` responde "¿a
quién MERECE la pena avisar?" (puntúa por costumbre horaria, usada por el
especialista A4 de Agenda del Decision OS).

## 17. Automatizaciones

Ver tabla de Inngest en §10 y la de pg_cron. Todas las funciones de proceso
por estudio llevan `retries: 3`; el corte de "confirmación de riesgo de
plantón" dejó de hacer fan-out por estudio porque consumía ~60% del plan
free de Inngest — ahora es una query global directa dentro del propio cron.

## 18. Emails y notificaciones

**Notification Engine** (`lib/notifications/`): ~35 funciones `emitirX`
arman evento+`dedupKey` y llaman a `publish()`. `REGLAS` en
`lib/notifications/catalog.ts` es **la autoridad** de qué canales recibe
cada tipo de evento (no hay lógica dispersa por pantalla).

**Canales**: EMAIL (Resend), PUSH (web-push/VAPID), WhatsApp/SMS (Twilio) —
registrados en un `Record<NotificationChannel, Canal>` central. Nota
arquitectónica importante: el motor **se retiró deliberadamente de Inngest**
porque "una cola invisible que falla en silencio nos dejó sin ninguna
notificación en producción" — ahora escribe in-app síncrono y entrega
externa con un salto HTTP directo a `/api/notifications/deliver`.

**Idempotencia**: índice único `(studio_id, dedup_key)` — cada `emitirX`
construye una clave determinista por hecho de negocio (no por intento); un
choque `23505` se interpreta como "ya notificado" y se ignora en silencio.

**Plantillas**: viven en `lib/emails/*-template.tsx` (React Email).
`supabase/templates/*.html` es exclusivamente para los correos de Supabase
Auth (confirmación, recuperación) — no para el motor de negocio.

## 19. Tentare Network

Implementado end-to-end, no es código muerto. Estados de perfil:
`draft|en_revision|published|hidden|suspended`. La propia instructora
**no puede** poner su perfil en `published`/`suspended` — bloqueado tanto en
la API (`ESTADOS_ACEPTADOS`) como en RLS (`with check` de la política de
UPDATE), doble cerradura tras un bug corregido donde antes sí se podía saltar
por REST directo. Publicar (`en_revision → published`) es exclusivo de
`/api/interno/network/perfiles` con permiso `network.moderate`. El listado
público (`lib/network/publico.ts`) filtra siempre `estado='published'` — un
perfil en cualquier otro estado nunca aparece aunque se conozca el slug.

Mensajería/contacto: `red_solicitudes_contacto` (con índice único que evita
duplicar solicitudes pendientes) y `red_mensajes`, ambas con RLS propia.

## 20. Admin

`/interno` usa un sistema de autorización **completamente separado** del
panel de estudio: tablas `plataforma_admin`/`plataforma_permiso`, catálogo
cerrado de 14 permisos (`studios.read`, `billing.refund`,
`network.moderate`, `admin.full`, etc.). El guard visual del layout es "de
usabilidad, no de seguridad" — cada ruta `/api/interno/*` vuelve a llamar
`exigirPermiso`/`exigirAlguno`. Usa `service_role` (cross-tenant a
propósito) **solo después** de esa comprobación. Facturación/MRR se lee en
vivo de Stripe, nunca cacheado.

**Hallazgo de higiene**: `lib/db/supabase-admin.ts` (el archivo que exporta
el cliente service-role) **no** lleva `import 'server-only'`, a diferencia
de otros wrappers admin del repo que sí lo hacen. No se encontró ningún
import real desde un componente `'use client'`, así que no hay fuga
confirmada — pero falta esa defensa en profundidad en tiempo de build.

## 21. Multi-tenancy

`studio_id` es la clave de tenant en casi todas las tablas de negocio.
`current_studio_id()` (SQL, `SECURITY DEFINER`) es la función que decide
"cuál es tu estudio ahora" y de la que dependen prácticamente todas las
policies RLS del esquema — el propio comentario de la migración que corrigió
el bug de "dar de baja no revocaba acceso" dice literalmente que esta
función "decide TODAS las policies del esquema". Qué impide que el estudio
A vea datos del B: la combinación de `WHERE studio_id = current_studio_id()`
en cada policy + que ningún endpoint de servidor acepte `studioId` del
cliente para operaciones sensibles (siempre se deriva de la sesión).

## 22. Estado y caché

Sin librería de estado global ni de fetching (§1). Todo Context +
`useState`/`useReducer` a mano, con `localStorage` para preferencias puras
de UI (tema, privacidad, tour). Sin capa de revalidación automática — un
cambio en servidor no se refleja en el cliente hasta el siguiente fetch
manual (recarga de página o acción explícita que vuelve a pedir datos). No
se detectó un caso concreto de dato obsoleto documentado como bug abierto en
esta pasada, pero es un riesgo estructural inherente al patrón (sin
SWR/Query no hay invalidación automática por foco/reconexión).

## 23. Rendimiento

**P1**: 21 tablas `red_*` (Network) con `auth_rls_initplan` — funciones
`auth.*()` reevaluadas por fila en vez de `(select ...)`, mismo patrón que
ya se corrigió en otras tablas del esquema pero no se replicó aquí. Bajo
impacto mientras el marketplace tenga poco volumen, pero es una regresión
real y localizada.

**P2**: 21 `multiple_permissive_policies` (coste de doble evaluación por
fila, funcionalmente correcto). ~50 `unused_index` (ruido esperable con poco
volumen de datos actual, no accionable todavía). El panel entero cargando
como bundle cliente de ~2,3 MB documentado en el propio `loading.tsx`.

No se identificaron problemas P0 de rendimiento en esta pasada (no se hizo
profiling de queries en producción con volumen real, es una limitación de
esta auditoría — ver §27).

## 24. Errores y observabilidad

Sentry integrado (server, edge, cliente diferido) — no-op si no hay DSN.
PostHog para producto. **Cómo se detectaría "una reserva falla para un
usuario"**: si el fallo lanza una excepción no controlada, Sentry la captura
(server via `onRequestError`, cliente vía boundary); si es un fallo de
negocio controlado (aforo lleno, plan inactivo), el endpoint devuelve un
código/mensaje explícito al cliente — pero no hay confirmación en esta
auditoría de que **todos** los caminos de fallo de negocio se reporten
también a Sentry como evento (algunos parecen ser solo respuesta HTTP sin
log estructurado). No se pudo verificar el dashboard de Sentry en vivo desde
este entorno.

## 25. Tests

270 archivos `lib/**/*.test.ts` (unitarios, Node nativo) + 144 specs E2E
(Playwright, corridos contra `next start`, no `next dev`, en CI). Cobertura
fuerte en lógica pura de `lib/` (booking-logic, permisos-reglas,
serie-horario, etc.). El propio repo documenta dos puntos ciegos históricos
de la suite E2E, ya cerrados: ningún test veía un 4xx (mocks siempre 200) y
los E2E solo corrían en Chromium (ahora hay proyecto `webkit-publico` para
pantallas públicas). No se auditó en esta pasada la cobertura línea por
línea; se confirmó la existencia y el patrón real de los tests, no su
suficiencia exhaustiva.

## 26. Deployment

GitHub → Vercel (región `fra1`) → Next.js → Supabase. CI en
`.github/workflows/ci.yml`: jobs `calidad` (tsc + lint + tests unitarios +
guardia anti-deriva de tipos DB), `build`, `e2e` (12 shards), agregador
`test`. Workflow separado `deriva-migraciones.yml` compara el esquema real
contra el repo a diario. `vercel.json` tiene un `ignoreCommand` que cancela
el build si el diff solo toca `docs/**`/`.md`/`e2e/**`/`.test.ts` —
importante: el check sale **verde** igual ("Canceled by Ignored Build
Step"), lo que ya causó una hora de diagnóstico equivocado en este repo
(variable de entorno que parecía no aplicarse cuando en realidad no había
habido build). 3 crons en `vercel.json` para los endpoints `/api/cron/*` de
bucket A no cubiertos por pg_cron directo.

## 27. Variables de entorno

Agrupadas por servicio (sin valores, ver §1 del reporte del agente de stack
para el listado completo): Supabase (`NEXT_PUBLIC_SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_CRON_SECRET`), Stripe (7 variables,
separando SaaS/Connect), Resend, Sentry, PostHog, Cloudflare R2/Stream,
Twilio, OAuth de terceros (Google/Zoom/Klaviyo), Fiskaly/Verifactu,
Anthropic, Web Push (VAPID), seguridad (Turnstile, secretos de token
firmado), app/infra (`NEXT_PUBLIC_APP_URL`, `CRON_SECRET`,
`BILLING_ENFORCED`).

## 28. Integraciones externas

Supabase (BD/auth/storage), Stripe (pagos), Resend (email transaccional),
Twilio (WhatsApp/SMS), Fiskaly (Veri*Factu/AEAT), Cloudflare R2/Stream
(ficheros/vídeo), Sentry (errores), PostHog (producto), Anthropic (IA),
Google/Zoom/Klaviyo/Kisi (integraciones opt-in por estudio), Vercel
(hosting/crons), Inngest (jobs). Para cada una, qué pasa si falla: Stripe →
fail-closed en cobro (nunca escritura optimista); Resend/Twilio → entregas
quedan `PENDING` y se reintentan por cron; Fiskaly → falla-suave (factura no
se pierde, huella propia se conserva); integraciones opcionales
(Google/Zoom/Klaviyo) degradan sin bloquear el resto del producto.

## 29. Seguridad — auditoría específica

**Hallazgo real nuevo (crítico de exposición, no de dinero directo)**:
`public.respaldo_sereno_studio1` tiene **RLS desactivada** con grants
directos de `INSERT/SELECT/UPDATE/DELETE/TRUNCATE` a `authenticated`.
Cualquier usuario autenticado de cualquier estudio puede leer, sobrescribir
o truncar esa tabla de backup de configuración de theme builder vía
PostgREST. Ver recomendación en §33.

**Cruzado y descartado**: `heredar_plan_de_cadena()` y `propagar_plan_cadena()`
son funciones **trigger** (`returns trigger`, `security definer`), no RPCs —
no hay ningún `.rpc('...')` que las invoque en `lib/`. `heredar_plan_de_cadena`
dispara `BEFORE INSERT ON studios` y `propagar_plan_cadena` dispara
`AFTER UPDATE ON cadenas` (`supabase/migrations/0066_cadenas_multisede.sql:46-76`).
El grant a `authenticated` es **deliberado y necesario**: `dbCreateStudio`
inserta en `studios` con la sesión de la propia propietaria (no
service-role), así que sin ese `EXECUTE` el alta de una sede nueva de
cadena fallaría. `anon` está excluido a propósito
(`0076_revoke_anon_rpc_no_publicas.sql:25-29`, verificado en vivo:
`anon`=false, `authenticated`=true, `service_role`=true). No es el gotcha de
"firma nueva hereda grant público" — es el patrón ya establecido de
"helper interno de trigger con grant explícito".

**No se encontró**: service-role alcanzable desde bundle cliente (aunque
falta el candado `server-only` en el archivo que lo exporta, §20), endpoint
sin autorización que debiera tenerla, RLS incorrecta en las tablas de dinero
o de ficha clínica (todas verificadas correctas en vivo), webhook sin
verificación de firma, IDOR confirmado en los flujos revisados
(`/api/public/reserva` ya cerró su vulnerabilidad histórica de aceptar
`socioId` del body).

**No verificado en esta pasada** (fuera del alcance de lo que se pudo
inspeccionar sin acceso más profundo): secretos expuestos en logs de
producción, inputs sin validar en la totalidad de los 236 endpoints (se
revisó una muestra representativa por dominio, no los 236 uno a uno).

## 30. Mapa de dependencias (módulos principales)

```
Reservas
 ├── Calendario (sesiones, aforo)
 ├── Socias (plan/entitlement)
 ├── Bonos/créditos
 ├── Pagos (penalización, recibo)
 └── Notificaciones (confirmación, cancelación)

Sustituciones
 ├── Calendario (sesión afectada)
 ├── Equipo (candidatas, disponibilidad)
 ├── Notificaciones (contacto)
 └── Decision OS (especialista A5, riesgo de hueco sin cubrir)

Decision OS
 ├── Snapshot del estudio (todas las tablas de negocio, cacheado por WeakMap)
 ├── Especialistas (Ingresos, Agenda, Equipo, Finanzas, Captación)
 └── El Umbral (arbitraje de un único mensaje diario)

Billing
 ├── Stripe (SaaS + Connect)
 ├── Trial local (no depende de Stripe)
 └── Penalizaciones (Fase 3, depende de cobro off-session)
```

## 31. "Fuente de verdad"

| Dominio | Fuente de verdad |
|---|---|
| Usuario | `auth.users` (Supabase Auth) |
| Estudio | `studios` (tabla), con `cadenas` como agrupador |
| Alumna | `socios` |
| Instructora | `instructores` (una fila por sede, `UNIQUE(auth_user_id,studio_id)`) |
| Clase | `sesiones` (filas persistidas, no recurrencia calculada) |
| Reserva | `reservas`, transición de estado siempre vía RPC transaccional |
| Pago | El `paymentIntent`/`charge` en **Stripe** es la verdad del cobro; `recibos.estado` en Supabase solo se marca tras verificar el resultado real de Stripe |
| Bono | `suscripciones` (créditos), consumo atómico vía RPC |
| Factura | `facturas` + huella Fiskaly (Veri*Factu) |
| Sustitución | `sustituciones`, resuelta atómicamente junto con `sesiones.instructor_id` en `confirmar_sustitucion` |
| Mensaje | `mensajes_equipo` (interno) / `red_mensajes` (Network) / `notification` (in-app) |
| Network Profile | `red_perfiles`, visibilidad pública gateada por `estado='published'` |

## 32. Explicación para no técnicos

- **Cuando una propietaria crea una clase**: Tentare guarda esa clase como
  una fila concreta con fecha y hora exactas — si crea una serie de varias
  semanas, guarda todas las ocurrencias de golpe, no una "regla" que se
  calcule cada vez. Si más tarde cambia la hora de esa serie "desde hoy en
  adelante", Tentare mueve todas las clases futuras de esa serie en una sola
  operación: o se mueven todas, o si alguna choca con el horario de la
  instructora o la sala, no se mueve ninguna (nunca queda a medias).

- **Cuando una alumna reserva**: Tentare comprueba en ese preciso instante,
  con un candado real en la base de datos, cuántas plazas quedan — así dos
  alumnas no pueden quitarse la última plaza a la vez sin que el sistema se
  entere. Si hay plaza, confirma; si no, la apunta a lista de espera; si el
  tipo de clase lo exige, primero pide aprobación manual de mostrador. Solo
  se descuenta un bono si la reserva queda de verdad confirmada.

- **Cuando una instructora cancela (avisa que no puede dar su clase)**:
  Tentare arranca automáticamente la búsqueda de sustituta, empezando por
  quien tenga más costumbre de dar clase en ese mismo horario. Avisa por
  email (y WhatsApp si procede) a varias candidatas a la vez; la primera que
  acepta se queda con la clase, y si dos aceptan "a la vez" hay un mecanismo
  que garantiza que solo una se queda de verdad (nunca se asigna la misma
  clase a dos instructoras por accidente). Si nadie acepta, la clase queda
  marcada como "sin sustituta" para que la propietaria lo sepa.

- **Cuando se crea una sustitución desde el panel o desde el móvil de la
  instructora**: es exactamente el mismo mecanismo por debajo, solo cambia
  quién lo dispara.

- **Cuando se cobra a una socia (cuota, bono, o una penalización por
  cancelar tarde)**: Tentare nunca "da por hecho" que el cobro salió bien.
  Pide el cobro a Stripe, espera la respuesta, y solo si Stripe confirma que
  el dinero se movió de verdad, marca ese recibo como cobrado. Si algo falla
  a mitad de camino (el cobro fue bien pero guardar el resultado falla),
  Tentare lo distingue y lo avisa, en vez de perder ese caso en silencio.

## 33. Problemas encontrados

### CRÍTICOS (cerrado durante esta auditoría)

1. ~~`public.respaldo_sereno_studio1` sin RLS y con grants directos a
   `authenticated`~~ — **CERRADO** (§9, §29). RLS activada + grants
   revocados el mismo día del hallazgo, verificado en `get_advisors`.

### IMPORTANTES

2. ~~21 tablas `red_*` con `auth_rls_initplan`~~ — **CERRADO** (§9, §23).
   Las 21 políticas reescritas, verificado 0 hallazgos restantes.
3. **`lib/db/supabase-admin.ts` sin `import 'server-only'`** (§20). No hay
   fuga confirmada, pero falta la defensa en profundidad en tiempo de build
   que sí tienen otros wrappers admin del repo.
4. **Sin capa de revalidación de datos en cliente** (§22). Un cambio hecho
   por otro usuario/proceso no se refleja hasta el siguiente fetch manual —
   riesgo estructural de "el backend tiene un valor nuevo pero el frontend
   sigue mostrando uno antiguo", inherente a la ausencia de SWR/React Query.
5. **Fase 3 de dinero (bonos con Stripe real, penalizaciones) no probada con
   un cobro real de tarjeta** en este entorno (§14, §15) — documentado por
   el propio repo, pendiente de validar en un estudio de prueba antes de
   activar con clientas reales.

> `heredar_plan_de_cadena()`/`propagar_plan_cadena()`, que en la primera
> pasada figuraban como "sin cruzar", se investigaron y se descartaron como
> hallazgo: son funciones trigger internas con grant deliberado, no RPCs
> huérfanas (ver §9).

### MEJORAS

7. Bundle cliente del panel de ~2,3 MB (documentado en el propio
   `app/(dashboard)/loading.tsx`), candidato a code-splitting adicional.
8. 21 `multiple_permissive_policies` y ~50 `unused_index` en advisors de
   rendimiento — ruido de bajo impacto hoy, revisar cuando crezca el volumen
   de datos real.
9. 6 ficheros de migración con nombre desincronizado del timestamp
   realmente aplicado (§9) — sin efecto funcional, pero vale la pena
   renombrarlos para que un `supabase db push` desde limpio no los vea como
   pendientes.

## 34. Deuda técnica

- **Componentes/archivos muy grandes por diseño, no por descuido**:
  `app/login/page.tsx` (512 líneas, todo el flujo de auth en un componente),
  `lib/studio-context.tsx` ("god-context" del panel). Ambos son decisiones
  ya evaluadas y mantenidas deliberadamente en este repo (trocear
  `lib/supabase-data.ts`/`studio-context.tsx` fue propuesto y rechazado dos
  veces según el propio historial del proyecto) — no se listan aquí como
  "arreglar", sino como contexto de por qué no están troceados.
- **Lógica de negocio en frontend**: mínima — la gran mayoría de reglas
  (aforo, ventanas de reserva, penalización) viven en RPCs SQL o en
  `lib/booking-logic.ts` (módulo puro compartido cliente/servidor), no
  duplicadas de forma inconsistente entre pantallas.
- **APIs con dos caminos de auth distintos para la misma acción de
  negocio**: por ejemplo `/api/mi-disponibilidad` (sesión de staff) vs
  `/api/public/disponibilidad` (token firmado) — documentado como
  intencional (mecanismos de auth distintos no se mezclan en un mismo
  handler), no deuda real.
- **Nombres de tabla en español, código en inglés** — convención mixta
  deliberada del repo (`.claude/tentare-os.md`), no inconsistencia a
  corregir.
- **Sin capa de estado global**: toda la gestión de datos del panel se hace
  con Context + `useEffect` a mano. Funciona, pero cada pantalla nueva
  reimplementa su propio patrón de `cargando`/`error` en vez de reutilizar
  un hook compartido (`use-semaforo-recepcion.ts` es la única
  factorización real encontrada en `lib/hooks/`).

---

## Nota metodológica

Esta auditoría se hizo con 8 sub-agentes de investigación trabajando en
paralelo sobre el código real y el esquema de Supabase en vivo (proyecto
`dwqvdycjcffqwfkzapvi`, vía `list_tables`/`get_advisors`/`execute_sql` en
modo lectura), cada uno citando `archivo:línea` o nombre de migración. No se
modificó ningún archivo ni se ejecutó ninguna escritura en base de datos
durante esta auditoría. Los puntos marcados explícitamente como "no
verificado en esta pasada" son limitaciones reales de alcance, no
omisiones accidentales.
