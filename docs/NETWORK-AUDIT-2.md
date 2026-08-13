# Tentare Network — Auditoría 2 (reconstrucción del auth flow)

Motivada por un bug P0 real detectado por el fundador probando en producción:
una instructora que se registra en `/network/unirse`, confirma su email y
completa su perfil, si cierra la pestaña y vuelve otro día a iniciar sesión
por `/login`, termina en el dashboard de propietaria (skeleton infinito), no
en Network. Esta auditoría (hecha con `tentare-arquitecto`, código real
citado archivo:línea) confirma la causa exacta antes de tocar nada.

## 1. Arquitectura actual

Dos capas de auth completamente distintas conviven en el repo:

- **Staff de un estudio** (`sesion.rol` en `PROPIETARIO/MANAGER/RECEPCION/
  INSTRUCTOR`): resuelto en servidor por `verificarSesionStaff`
  (`lib/auth-server.ts:21-102`), y en cliente por `resolveStudioId()` → RPC
  `current_studio_id()`, consumido por `lib/studio-context.tsx`. **Presupone
  siempre** una fila en `instructores` o ser dueña de un `studios`
  (`lib/auth-server.ts:66-99`: si ninguna de las dos consultas devuelve fila,
  la función retorna `null`).
- **Cuenta de Tentare Network** (`red_perfiles.auth_user_id`): independiente
  de `studio_id` por diseño (migr `20260813111206`, comentario explícito "una
  persona puede no pertenecer a ningún estudio Tentare"). No existe ningún
  puente entre este sistema y el de `sesion.rol`.

No hay `middleware.ts` en todo el repo. Todo el enrutamiento post-auth es
client-side, disperso por página.

## 2. Problemas encontrados

### El bug P0 — confirmado, con la línea exacta

`app/login/page.tsx:126-141`, tras `signIn()`/confirmación de email exitosos:

```js
const destino = new URLSearchParams(window.location.search).get('destino');
const seguro = destino === '/interno' || destino?.startsWith('/interno/');
window.location.href = seguro ? destino! : '/dashboard';
```

No hay ninguna rama que consulte `red_perfiles`. Cualquier login exitoso por
`/login` sin `?destino=/interno...` termina siempre en `/dashboard`. El link
"¿Ya tienes cuenta? Inicia sesión" de `app/network/unirse/page.tsx` manda
precisamente a esta pantalla.

Lo que pasa después, también confirmado con código:

1. `DashboardShell` monta con `session` presente. Su comentario
   (`components/layout/dashboard-shell.tsx:95-97`) asume *"el login redirige
   las altas sin estudio a /crear-estudio, así que quien llega aquí tiene
   estudio"* — falso hoy: no existe ningún redirect de `/login` a
   `/crear-estudio`.
2. `resolveStudioId()` → RPC `current_studio_id()` devuelve `null` para una
   `auth_user_id` sin fila en `instructores`/`studios`; `studio` queda en
   `null` permanentemente en `lib/studio-context.tsx`.
3. `DashboardShell` calcula `cargandoDatos = !!session && (studio === null ||
   billingBloqueado !== false)` (línea 98) y pinta `<PanelSkeleton />` (línea
   185) mientras eso sea `true` — sin timeout, sin fallback, sin redirect.
   **Skeleton infinito confirmado.**

Este bug ya se corrigió *a medias*: `app/network/layout.tsx` saca
`mi-perfil`/`solicitudes` de `(dashboard)` justamente por este motivo — pero
el punto de entrada real (`/login`) nunca se tocó, así que el bug reaparece
por esa puerta.

### Otro hueco real (menor)

Si una propietaria/staff con estudio visita `/network/unirse` ya logueada, el
guard existente la manda a `/network/mi-perfil` — que carga bien, pero
aterriza en un formulario de alta de Network vacío sin haberlo pedido. No es
el bug P0, pero es un cruce de flujos no diseñado a propósito (ver §4 de la
implementación, `advertenciaCruceRoles`).

## 3. Auth flow actual, paso a paso

**Camino staff:** `/login` → `signIn()`/`signUp()` (`lib/auth-context.tsx`) →
`login/page.tsx` resuelve `pending_studio`/`pending_freelance`/invitación →
redirect duro a `/dashboard` o `?destino=/interno...` → `DashboardShell`
resuelve `studio` vía `studio-context.tsx`.

**Camino Network:** `/network/unirse` → `signUp(..., redirectPath:
'/network/mi-perfil')` → confirmación de email → `/network/mi-perfil`
(`app/network/layout.tsx`, NO `DashboardShell`) con guard propio por página.
Vuelta después de días → si usa `/login`, bug P0 de arriba.

No hay ningún punto único de decisión; son 2-3 lugares con lógica de redirect
independiente y sin conocimiento mutuo: `login/page.tsx:138-140`,
`network/unirse/page.tsx` (dos puntos).

## 4. Roles actuales (lo que existe de verdad, no lo que se pidió que exista)

`PROPIETARIO | MANAGER | RECEPCION | INSTRUCTOR` — siempre DENTRO de un
`studio_id`. No es un tipo de cuenta de plataforma, es un rol dentro de un
tenant. Network no tiene rol: `red_perfiles` es una fila 1:1 por
`auth_user_id` sin ningún campo de tipo/rol de cuenta. No existe ningún
`tipo_cuenta`/`account_type` a nivel de `auth.users` ni tabla `profiles`
genérica que unifique "esta cuenta es de Network / de estudio / ambas". La
única señal disponible es consultar si existe fila en `red_perfiles` y/o si
`current_studio_id()` resuelve algo — dos consultas independientes que hoy
nada cruza.

**Decisión de esta ronda**: NO se crea un sistema de roles de plataforma
nuevo (`STUDIO_OWNER`/`INSTRUCTOR` como tipo de cuenta) — reabriría la
arquitectura Manager/Core de `.claude/tentare-os.md` sin que el fundador lo
haya pedido expresamente más allá del vocabulario del brief. En su lugar, la
señal ya existente (¿tiene fila en `red_perfiles`? ¿tiene fila en
`instructores`/`studios`?) es suficiente para resolver el redirect, y es lo
que se centraliza en `lib/auth-post-login.ts`.

## 5. Tablas existentes relevantes

`studios`, `instructores` (staff, por estudio). `red_perfiles`,
`red_experiencias`, `red_verificaciones_experiencia`, `red_referencias`,
`red_solicitudes_contacto`, `red_reportes` (Network, por `auth_user_id`, sin
relación con `sesion.rol`). No existe tabla `profiles` genérica de
plataforma.

## 6. RLS existente relevante

Revisada tabla por tabla (migr `20260813111206`, `111231`, `112713`,
`135453`): la instructora no puede leer perfiles ajenos no publicados, no
puede tocar nada de `studios`/`instructores`, el aislamiento por
`auth_user_id` es consistente en las 6 tablas. **No hay hueco de RLS
pendiente** — el problema es enteramente de capa de aplicación (redirect), no
de base de datos. No se toca ninguna política en esta ronda.

## 7. Rutas existentes bajo Network

| Ruta | Layout | Guard |
|---|---|---|
| `app/network/unirse/page.tsx` | `app/network/layout.tsx` | si `user` ya logueado → `/network/mi-perfil` |
| `app/network/mi-perfil/page.tsx` | ídem | si no `user` → `/network/unirse` |
| `app/network/solicitudes/page.tsx` | ídem | si no `user` → `/network/unirse` |
| `app/(dashboard)/network/page.tsx` | `(dashboard)` | buscador de candidatas — propietaria/manager/recepción, correcto tal cual |
| `app/(dashboard)/network/[perfilId]/page.tsx` | ídem | ficha pública de una candidata — correcto tal cual |

## 8. Componentes/piezas reutilizables (sin tocar)

Todo `components/network/*`, el esquema RLS completo, `app/network/layout.tsx`
como patrón de layout ligero fuera de `DashboardShell`, y `lib/auth-context.tsx`
`signUp(..., redirectPath)`.

## 9. Qué eliminar

Nada — es un problema de un redirect disperso, no de arquitectura de datos.

## 10. Qué reutilizar

El patrón de `app/network/layout.tsx` + guards por página, el esquema RLS
entero, `red_perfiles.auth_user_id` como única fuente de "esta cuenta tiene
perfil Network".

## 11. Qué se construye en esta ronda (Fase 3 del plan del fundador — Auth)

- `lib/auth-post-login.ts`: única fuente de verdad,
  `resolverDestinoPostLogin(admin, authUserId)` — consulta `red_perfiles` y
  `instructores`/`studios` (vía `verificarSesionStaff`-like) y devuelve UNO
  de `{ destino: '/dashboard' } | { destino: '/network/mi-perfil' } | {
  destino: '/network/unirse' }` (caso raro: ninguna de las dos, cuenta a
  medio crear — no un skeleton infinito).
- Endpoint `GET /api/auth/destino-post-login` (usa `getSupabaseAdmin()`,
  igual que el resto de Network) para que `/login` pueda preguntarlo sin
  exponer lógica de servidor al cliente.
- `app/login/page.tsx`: sustituye el `window.location.href = '/dashboard'`
  incondicional por una llamada a ese endpoint.
- `DashboardShell`: red de seguridad — si `studio` nunca resuelve tras un
  tiempo razonable con sesión activa, deja de mostrar skeleton infinito y
  ofrece una salida explícita (mismo criterio: nunca un callejón sin
  salida). Cubre bookmarks/enlaces viejos que sigan aterrizando en
  `/dashboard` por otras vías.

## 12. Riesgos de migración

Ninguno de esquema — no se mueven rutas ni tablas otra vez, solo se
centraliza un redirect dentro de la capa de aplicación. El único punto de
acoplamiento real entre los dos sistemas de auth es el link cruzado
`/network/unirse` ↔ `/login`; el fix vive exactamente ahí, con cuidado de no
generalizar un sistema de roles de plataforma que nadie ha pedido.

## 13. Alcance de esta ronda vs. el resto del brief de 48 puntos

El fundador pidió una reconstrucción completa (marketplace con filtros,
páginas SEO por ciudad/especialidad, sistema de reviews, mensajería interna,
geolocalización, panel de moderación admin, analítica, tests E2E completos).
Es un producto multi-semana, no una sesión. Esta ronda resuelve el punto más
urgente y mejor acotado — el bug P0 de auth que hace que la experiencia
"parezca un formulario roto" en vez de una red profesional — y dejamos el
resto (marketplace/SEO/reviews/mensajería/admin) para fases siguientes,
confirmadas una a una con el fundador antes de construirlas, seed de datos
real incluido (nunca perfiles ficticios en producción, punto 39 del brief).
