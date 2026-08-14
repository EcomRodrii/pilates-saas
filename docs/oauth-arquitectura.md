# OAuth 2.0 para terceros (Zapier) — Fases 0-4

Servidor OAuth 2.0 Authorization Code + PKCE + refresh tokens para que apps
externas actúen en nombre de un estudio, con consentimiento explícito del
`PROPIETARIO`/`MANAGER` y aislamiento estricto por `studio_id`.

Tentare ya era **cliente** OAuth de terceros (Stripe Connect, Google, Zoom,
Klaviyo — `lib/oauth-state.ts`, `lib/marketing/pkce.ts`). Esto es la dirección
contraria: Tentare pasa a ser **servidor** OAuth.

## Endpoints

| Endpoint | Método | Auth | Propósito |
|---|---|---|---|
| `/oauth/authorize` | GET (pantalla) | sesión de staff | Consentimiento |
| `/api/oauth/authorize` | GET/POST | sesión de staff | Valida params / crea el code |
| `/api/oauth/token` | POST | client_id+secret | Canje de code / refresh |
| `/api/oauth/me` | GET | Bearer access_token | Test de conexión (Zapier) |
| `/api/oauth/revoke` | POST | sesión de staff | Revocar desde el panel |
| `/api/oauth/consentimientos` | GET | sesión de staff | Listar apps conectadas |
| `/api/oauth/v1/clientas` | GET | Bearer + `clientas:leer` | Trigger "Nuevo cliente" |
| `/api/oauth/v1/clientas` | POST | Bearer + `clientas:escribir` | Action "Crear cliente" |
| `/api/oauth/v1/reservas` | GET | Bearer + `reservas:leer` | Triggers de reserva |
| `/api/oauth/v1/reservas` | POST | Bearer + `reservas:escribir` | Action "Crear reserva" |
| `/api/oauth/v1/reservas/cancelar` | POST | Bearer + `reservas:escribir` | Action "Cancelar reserva" |
| `/api/oauth/v1/notas` | POST | Bearer + `notas:escribir` | Action "Crear nota" |
| `/api/oauth/v1/tareas` | POST | Bearer + `tareas:escribir` | Action "Crear tarea" |

## Tablas (`supabase/migrations/20260814100000_oauth_esquema_base.sql`)

`oauth_clientes`, `oauth_consentimientos`, `oauth_codigos_autorizacion`,
`oauth_tokens`, `oauth_auditoria_accesos`. RLS activada, **cero políticas**
(mismo patrón que `integracion_credenciales`): solo accesibles vía
`getSupabaseAdmin()` con filtro manual de `studio_id`/`cliente_id` en cada
query — bajo service-role, RLS no ayuda (`current_studio_id()`/`auth.uid()`
son NULL), ver `lib/auth-server.ts`.

## Decisiones de diseño

- **PKCE (S256) obligatorio siempre**, sea el cliente confidencial o no —
  coste cero, ya existía `lib/marketing/pkce.ts` como referencia (aquí
  reimplementado en `lib/oauth-crypto.ts` para no arrastrar dependencias del
  módulo de marketing).
- **Reuse detection**: un authorization code reutilizado, o un refresh token
  ya revocado que se reintenta, revoca TODA la `cadena_id` de tokens nacida
  de esa autorización (RFC 6749 §10.5) — no solo el token individual.
- **Rotación de refresh token siempre** en cada canje (RFC 6749 §6): la fila
  vieja se marca `revocado_en` + `reemplazado_por`, la nueva hereda
  `cadena_id`.
- **`redirect_uri` en whitelist exacta**, nunca por prefijo.
- **Quién autoriza**: `puedeGestionarAppsOAuth(rol)` = `PROPIETARIO` o
  `MANAGER` (`lib/permisos-reglas.ts`) — mismo criterio que
  `puedeGestionarEquipo`. Espejado en servidor (`/api/oauth/authorize`,
  `/api/oauth/revoke`), nunca solo en la UI.
- **Scopes** (`lib/oauth-crypto.ts`): `clientas:*`, `reservas:*`, `pagos:leer`
  (sin `pagos:escribir` — dinero nunca se mueve vía terceros en v1),
  `instructores:leer`, `notas:*`, `tareas:*`, `leads:*`.
- **`/api/oauth/me` es lista blanca**, nunca el objeto crudo de
  `studios`/`instructores` — mismo criterio que `studioPublico()`.
- **Auditoría**: cada llamada Bearer autenticada escribe una fila en
  `oauth_auditoria_accesos` (ruta, método, status, scope, ip), fire-and-forget.

## Fase 5 — scopes de escritura (completa)

Cada acción reutiliza la función de negocio server-side que ya usa el resto
del producto — cero lógica de reglas nueva:

- **Crear cliente** (`clientas:escribir`) → `registrarSociaPublica` (mismo
  camino que el alta desde el portal), sin `authUserId` — la clienta creada
  vía Zapier no tiene cuenta de portal hasta que ella misma se registre.
  23505 de email duplicado (`uq_socios_studio_email`) se traduce a 409.
- **Crear reserva** (`reservas:escribir`) → `crearReservaPublica` (ventana,
  gate de plan/bono, aforo transaccional — todas las reglas ya existentes).
  Esa función exige el email de la socia (pensada para JWT de magic link);
  aquí se lee de `socios` ya acotado por `studio_id` — el aislamiento real
  lo da el token OAuth, no ese email.
- **Cancelar reserva** (`reservas:escribir`, mismo scope) →
  `cancelarReservaPublica`, **nunca** el camino de `dbCancelarReservaPlaza`
  (panel de staff) — devuelve bono si procede, promueve lista de espera, y
  aplica la penalización por cancelación tardía si el estudio la tiene
  activada (`omitirPenalizacion` siempre `false`: esto es una cancelación
  real de un tercero autorizado, no el corte automático del sistema).
- **Crear nota** (`notas:escribir`) → tabla `notas_internas` (nota
  OPERATIVA — `salud_notas_progreso`/ficha clínica queda excluida a
  propósito). No existía wrapper service-role; se añadió
  `crearNotaInternaAdmin` (`lib/notas-internas-admin.ts`) siguiendo el mismo
  patrón que `registrarSociaPublica` (valida que el socio pertenece al
  estudio antes de escribir, porque aquí no hay RLS que lo haga por
  nosotros).
- **Crear tarea** (`tareas:escribir`) → **no existía ningún concepto de
  "tarea" de negocio en el repo** (`lib/tareas.ts` es solo el catálogo
  estático del command-palette ⌘K). Tabla nueva mínima `tareas` (migración
  `20260814150000_oauth_fase5_tareas.sql`): `studio_id`, `socio_id`
  opcional, `titulo`, `descripcion`, `estado` (`PENDIENTE`/`HECHA`),
  `origen` (`PANEL`/`API`). Sin "asignado a" — eso es trabajo de equipo
  (`mensajes_equipo`), no de esta tabla. RLS: `PROPIETARIO`/`MANAGER`/
  `RECEPCION` (mismo criterio que `puedeGestionarClientas`), sin
  `INSTRUCTOR`.

## Fuera de esta fase (documentado a propósito, no reabrir sin pedirlo)

- **Scopes de dinero** (`pagos:escribir`) — requiere diseño propio con
  `tentare-stripe`, no es extensión trivial de lo anterior.
- **Self-service de registro de apps** — v1 es un catálogo cerrado
  (`oauth_clientes`), Zapier es la única fila. Registrar una app nueva es una
  migración de datos, no un flujo de producto.
- **Triggers/actions restantes** del pedido original (nuevo lead, pago
  realizado/fallido, cliente dado de baja, lista de espera, sustitución,
  clase completada) — el patrón ya está establecido en `app/api/oauth/v1/*`
  y en las Fases 0-5; falta implementarlos uno a uno cuando se pida.
- **Hallazgo aparte, sin relación con OAuth**: investigando Fase 5 se
  encontró un indicio (lectura estática, sin verificar en vivo) de que
  `dbCancelarReservaPlaza` (panel de staff) podría haber perdido la lógica
  de penalización por cancelación tardía tras la refactorización de lista de
  espera del 31/07 (colisión de overloads de `cancelar_reserva_plaza`).
  Marcado como tarea aparte para verificar con `tentare-supabase`/
  `tentare-stripe` — no se ha tocado nada de ese camino aquí.
