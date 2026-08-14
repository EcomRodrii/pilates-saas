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
| `/api/oauth/v1/reservas` | GET | Bearer + `reservas:leer` | Triggers de reserva |

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

## Fuera de esta fase (documentado a propósito, no reabrir sin pedirlo)

- **Scopes de escritura** (`reservas:escribir`, `clientas:escribir`,
  `tareas:*`, `leads:*`) — Fase 5, reutilizando las funciones de negocio ya
  existentes (`crearReservaPublica`, etc.), no lógica nueva.
- **Scopes de dinero** (`pagos:escribir`) — requiere diseño propio con
  `tentare-stripe`, no es extensión trivial de lo anterior.
- **Self-service de registro de apps** — v1 es un catálogo cerrado
  (`oauth_clientes`), Zapier es la única fila. Registrar una app nueva es una
  migración de datos, no un flujo de producto.
- **Triggers/actions restantes** del pedido original (nuevo lead, pago
  realizado/fallido, cliente dado de baja, lista de espera, sustitución,
  clase completada, cancelar reserva, crear nota/tarea) — quedan para cuando
  se aborden los scopes de escritura y el resto de recursos de solo lectura;
  el patrón ya está establecido en `app/api/oauth/v1/*`.
