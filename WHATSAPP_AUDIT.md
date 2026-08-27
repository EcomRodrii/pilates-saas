# Auditoría — Migración a Meta WhatsApp Embedded Signup v4

Fecha: 2026-08-27. Estado: **Fases A-I implementadas. Revisión de código (`/code-review`) hecha y sus 7 hallazgos confirmados corregidos.**

## 0. Hallazgo que reencuadra todo lo demás

Hay **dos integraciones de WhatsApp distintas y no relacionadas** en este repo:

1. **Meta Cloud API directa, por estudio** (`lib/whatsapp.ts`) — BYO-credenciales: cada
   estudio pega su propio `access_token`/`phone_number_id` en
   *Configuración → Integraciones*. Único consumidor: el cron de recordatorios de clase
   (`enviarRecordatoriosClasesProximas`). **Esta es la integración a migrar.**
2. **Twilio, credencial única de plataforma** (`lib/twilio.ts`, env `TWILIO_*`) — motor de
   automatizaciones, campañas de marketing, sustituciones, motor de notificaciones. No
   tiene nada que ver con Meta. **No se toca en esta migración.**

Cualquier fase de este plan que hable de "recordatorios" se refiere solo al canal (1).

## 1. Arquitectura actual

| Concepto | Valor literal |
|---|---|
| Tabla de credenciales | `public.integraciones` |
| Columnas | `id text PK`, `studio_id text FK→studios(id)`, `tipo text`, `activo boolean`, `config jsonb`, `actualizado_en`, `ultimo_ok_en`, `ultimo_error`, `ultimo_error_en` |
| Constraint | `UNIQUE(studio_id, tipo)` |
| Discriminador | `tipo = 'WHATSAPP'` |
| Claves en `config` (jsonb) | `token` (access_token, **texto plano**), `phoneId` (phone_number_id, texto plano), `plantillaAprobada` (string `'true'`/`'false'`) |
| Claves que NO existen hoy | `waba_id`, `business_id` |
| Cifrado | Ninguno |
| RLS | `owner_integraciones`, `TO authenticated`, `USING/WITH CHECK (current_rol()='PROPIETARIO' AND studio_id=current_studio_id())` — correcta, no cross-tenant |
| Lectura server-side | `dbGetIntegracionConfig` (`lib/db/supabase-data-admin.ts:3941`), service role |
| Escritura | `dbUpsertIntegracion` (`lib/supabase-data.ts:3583`), cliente autenticado, sujeto a RLS |
| Endpoint lectura credenciales | `GET /api/integrations/config?tipo=WHATSAPP` — solo `PROPIETARIO` de la sesión |
| Endpoint prueba conexión | `POST /api/integrations/whatsapp/probar` — solo `PROPIETARIO` |
| Envío texto | `enviarWhatsAppTexto(creds, to, texto)` — `lib/whatsapp.ts:22` |
| Envío plantilla | `enviarWhatsAppPlantilla(creds, to, plantilla, parametros)` — `lib/whatsapp.ts:52` |
| Prueba conexión | `probarWhatsApp(creds)` — `lib/whatsapp.ts:84` |
| Endpoint Graph API | `https://graph.facebook.com/{WHATSAPP_API_VERSION:-v21.0}/{phoneId}/messages` |
| Plantilla | `recordatorio_clase`, idioma `es`, categoría UTILITY, 5 params: `{{1}}`=estudio, `{{2}}`=clase, `{{3}}`=fecha, `{{4}}`=hora, `{{5}}`=sala (o `'tu estudio'`) |
| Cron | `lib/inngest/recordatorios.ts` — dispatcher `0 8 * * *` UTC → fan-out por estudio → `enviarRecordatoriosClasesProximas` (`lib/db/supabase-data-admin.ts:1429`) |
| Resolución studio→credenciales | El worker ya recibe `studioId` explícito; carga `integraciones` `.in('studio_id', [...])` en batch → `Map<studio_id, creds>` |
| Dedup envíos | `recordatorio_envios(sesion_id, socio_id, canal)` PK compuesta — evita reenvío en reintentos de Inngest |
| Webhook Meta entrante | **No existe** (solo hay webhook de Twilio, `app/api/webhooks/twilio-inbound`, no relacionado) |
| Env vars Meta actuales | Solo `WHATSAPP_API_VERSION` (opcional, default `v21.0`). No hay `.env.example` en el repo. No hay `META_*` ni `WABA_*` en ningún sitio. |
| UI actual | `components/configuracion/tab-integraciones.tsx` — 3 campos manuales (`token` password, `phoneId` texto, `plantillaAprobada` checkbox) + 6 pasos de instrucciones manuales en developers.facebook.com |
| Multi-tenant | Diseño correcto (batch por `studio_id`, sin token global), pero sin evidencia en seed/tests de dos estudios reales operando con tokens Meta distintos simultáneamente |

Namespace paralelo, **no confundir**: `lib/canales-estudio.ts` resuelve un botón `wa.me/<numero>`
estático desde el tema white-label (`redesSociales.whatsapp`) — es texto de contacto en la
landing/portal, cero relación con Cloud API.

## 2. Qué hay que cambiar (lista exacta)

**Base de datos (migración nueva, número correlativo a comprobar con `list_migrations`):**
- Ampliar `config` jsonb de `integraciones` (tipo `WHATSAPP`) con `wabaId`, `businessId`,
  `displayPhoneNumber`, `verifiedName` — o, más limpio dado que ya existe `ultimo_ok_en`/
  `ultimo_error`/etc. como columnas propias, promover `wabaId`/`businessId` a columnas
  reales si se quiere indexarlas/validarlas con CHECK. Decisión de diseño para Fase B, no
  tomada aquí.
- El token sigue en texto plano salvo que se decida cifrar (fuera del alcance mínimo, pero
  recomendable dado que hoy viaja plano — evaluar `pgsodium`/cifrado de aplicación en Fase B).

**Backend:**
- `lib/whatsapp.ts` — añadir función(es) para el intercambio de código por token de sistema
  de negocio (`GET /oauth/access_token` con `code` de Embedded Signup) y para verificar
  server-side el `waba_id`/`phone_number_id` recibidos contra la Graph API antes de marcar
  `connected`.
- Nueva ruta API, p.ej. `app/api/integrations/whatsapp/embedded-signup/route.ts` — recibe
  el `code`/`response` del SDK de Meta en el navegador, resuelve `studio_id` **siempre de la
  sesión autenticada** (nunca de payload del cliente), intercambia el código, valida contra
  Graph API, y llama a `dbUpsertIntegracion`.
- `lib/db/supabase-data-admin.ts::enviarRecordatoriosClasesProximas` — **sin cambios de
  lógica**, solo lee las mismas claves de `config` (o las nuevas si se renombran), el
  contrato `WhatsAppCredenciales{token, phoneId}` se mantiene.
- Webhook nuevo `app/api/webhooks/whatsapp/route.ts` — GET de verificación (`hub.challenge`
  contra `META_WEBHOOK_VERIFY_TOKEN`), POST de eventos con verificación de firma
  `X-Hub-Signature-256` (HMAC-SHA256 con `META_APP_SECRET`, mismo patrón de estilo que
  `lib/twilio-firma.ts` pero protocolo distinto). Resolver `studio_id` desde el
  `phone_number_id`/`waba_id` del payload contra `integraciones.config`.

**Frontend:**
- Nueva pantalla `/configuracion/whatsapp` (o sustituir la tarjeta actual en
  `tab-integraciones.tsx`) con el botón "Conectar WhatsApp" que carga el SDK de Facebook
  (`fbAsyncInit` + `FB.login` con `config_id` de Embedded Signup) — reemplaza los 3 campos
  manuales y las 6 instrucciones.
- El componente solo debe recibir del backend: `connected`, `status`, `displayPhoneNumber`,
  `verifiedName`, `connectedAt` — nunca `token`/`phoneId` crudos. Confirma que
  `GET /api/integrations/config` hoy SÍ expone `config` completo (incluye el token) al
  `PROPIETARIO` para rellenar el formulario de edición — con Embedded Signup ya no hace
  falta mostrarlo, así que ese endpoint deja de devolver el token para `tipo=WHATSAPP`.

**Variables de entorno nuevas** (nombres exactos a confirmar en Fase B, ninguno existe hoy):
`META_APP_ID`, `META_APP_SECRET`, `META_CONFIG_ID` (Embedded Signup config), `META_WEBHOOK_VERIFY_TOKEN`, y ya existente `WHATSAPP_API_VERSION`.

## 3. Riesgos

- **Coexistencia con conexiones manuales existentes**: cualquier estudio que ya tenga
  `token`/`phoneId` pegados a mano debe seguir funcionando sin tocar nada — el contrato
  `WhatsAppCredenciales{token, phoneId}` no puede romperse a mitad de migración.
- **Token en texto plano** ya es así hoy (riesgo preexistente, no introducido por esta
  migración, pero conviene abordarlo ya que se toca esta tabla).
- **`GRANT ALL ... TO anon`** en `integraciones` (heredado del patrón del repo) — RLS lo
  cubre hoy, pero cualquier función `SECURITY DEFINER` nueva para el intercambio OAuth debe
  seguir el patrón ya documentado en memoria del proyecto: `REVOKE FROM PUBLIC` +
  `GRANT` explícito a los roles correctos, verificado con `has_function_privilege` — este
  repo ha tropezado con el mismo gotcha de grants varias veces.
- **Plantilla por WABA**: no está confirmado que `recordatorio_clase` aprobada en un WABA
  se herede automáticamente a otro WABA nuevo conectado vía Embedded Signup — Meta trata
  cada WABA como entidad propia con su propio catálogo de plantillas. Hay que verificarlo
  en vivo con el primer estudio piloto antes de asumir que todos los recordatorios seguirán
  funcionando sin re-aprobar la plantilla en cada WABA nuevo.
- **Nada de webhook hoy**: construir la verificación de firma y la idempotencia desde cero,
  sin referencia previa de Meta en el repo (solo Twilio como estilo).
- **App Review de Meta / Business Verification**: puede bloquear producción si no se
  gestiona con antelación — depende de configuración manual en Meta Developer Dashboard,
  fuera del control del código.

## 4. Meta setup manual (pendiente de completar durante Fase C con la doc oficial vigente)

No se ha completado esta sección en esta pasada de auditoría — requiere consultar la
documentación oficial de Meta (Embedded Signup v4, vigente; v2 se deprecha 15-oct-2026) en
el momento de configurar la app, no anticiparla de memoria. Se documentará en
`META_SETUP.md` durante la Fase C/D de implementación, con: Meta App ID, Facebook Login for
Business, Embedded Signup config_id, permisos (`whatsapp_business_management`,
`whatsapp_business_messaging`), dominios permitidos, webhook config, requisitos de App
Review y Business Verification.

## 5. Plan de implementación (orden)

A. Auditoría — **completa, este documento**.
B. Diseño del modelo multi-tenant (columnas nuevas en `integraciones` o tabla dedicada,
   decisión de cifrado del token) — agente `tentare-arquitecto` + `tentare-supabase`.
C. Configuración Embedded Signup v4 en Meta Developer Dashboard (manual, documentada en
   `META_SETUP.md`).
D. Callback/onboarding: ruta API de intercambio de código + verificación server-side.
E. Guardado de conexión por studio (reutilizando `integraciones`/`dbUpsertIntegracion`).
F. Conectar con el sender actual (`lib/whatsapp.ts`, sin romper el contrato existente).
G. Migrar recordatorios: en la práctica, ningún cambio de lógica — mismo `Map` por
   `studio_id`, solo cambia el origen de las credenciales.
H. UX: pantalla `/configuracion/whatsapp` con el botón "Conectar WhatsApp".
I. Tests: los 10 casos del prompt original, usando el patrón ya existente en
   `e2e/credenciales-no-se-pierden.spec.ts` como base.
J. Documentación: `docs/whatsapp-embedded-signup.md`.

Compatibilidad: durante la migración conviven ambos caminos (token manual antiguo +
Embedded Signup nuevo) — no se desconecta ni se borra ninguna credencial existente sin
verificar antes que la nueva conexión funciona de verdad.

---

## Fase B — Diseño del modelo de datos y flujo (completa, por `tentare-arquitecto`)

### Hallazgo que reencuadra la Fase B

El repo tiene un TERCER patrón que la Fase A no cubrió: `public.integracion_credenciales`
(`studio_id, provider, access_token, refresh_token, expires_at, metadata jsonb`), usado hoy
por Google Calendar/Gmail/Klaviyo/Zoom. **Decisión: NO usarlo para WhatsApp.** Dos motivos:
(1) rompería en dos el `select().in('studio_id', [...])` en batch que ya usa el cron —
habría que cruzar dos tablas en memoria donde hoy hay una query; (2) el modelo
`access_token/refresh_token/expires_at` asume un grant OAuth2 clásico con refresh, y el
token de sistema de Embedded Signup no tiene refresh_token (no expira salvo revocación) —
forzarlo ahí violaría el contrato que ya cumplen los otros 4 proveedores (`if
(!data.refresh_token) return null`).

**Todo sigue en `public.integraciones` (`tipo='WHATSAPP'`), misma fila para conexión manual
y Embedded Signup**, distinguidas solo por qué claves de `config` tienen relleno (sin
columna `origen` nueva — es deducible: `config.wabaId` presente = vino de Embedded Signup).

### Decisiones

1. **Solo `phone_number_id` sube a columna real** (`integraciones.phone_number_id text`,
   con índice único parcial `WHERE tipo='WHATSAPP' AND phone_number_id IS NOT NULL`).
   Motivo: es el único campo que el webhook entrante necesita para resolver `studio_id`
   **sin sesión de usuario** — y esa resolución necesita la garantía de unicidad de un
   índice, que `config` jsonb no puede dar (dos estudios con el mismo número por
   typo/reconexión mal hecha = fuga cross-tenant real en el webhook). `waba_id`,
   `business_id`, `display_phone_number`, `verified_name` se quedan dentro de `config`
   jsonb (mismo patrón camelCase que ya usan `token`/`phoneId`/`plantillaAprobada`) — solo
   se leen para pintar UI/soporte, no necesitan índice ni CHECK.

2. **Cifrado del token: fuera de alcance de esta migración.** El token de WhatsApp no es
   más sensible que las otras 5 credenciales ya en texto plano en el repo (Kisi/Mailchimp
   en `integraciones.config`, Google/Gmail/Klaviyo/Zoom en `integracion_credenciales`).
   Cifrar solo WhatsApp daría una falsa sensación de riesgo cerrado. Cambio real que sí
   entra aquí (sin cifrado, gratis): `GET /api/integrations/config?tipo=WHATSAPP` deja de
   devolver `token` cuando la fila viene de Embedded Signup (`config.wabaId` presente) — no
   hay formulario que rellenar con él. Las conexiones manuales existentes siguen
   exponiéndolo igual que hoy (el formulario de edición lo necesita).

3. **Sin columna `status` nueva** — se reutiliza `saludIntegracion()` (`lib/integraciones/salud.ts`,
   ya existente): `APAGADA | SIN_PROBAR | FUNCIONA | FALLANDO`, derivados de
   `activo`/`ultimo_ok_en`/`ultimo_error`/`ultimo_error_en`. `connecting` es puramente de
   cliente (estado del popup `FB.login`, nunca persistido). Una conexión Embedded Signup
   nueva aterriza directo en `FUNCIONA` (se llama `registrarSaludIntegracion(...,{ok:true})`
   justo tras validar contra la Graph API, en el mismo paso que el upsert) — nunca pasa por
   `SIN_PROBAR`, que sigue existiendo para el flujo manual (guardar token sin probar aún).

4. **Flujo end-to-end**: `FB.login` con `config_id` (Facebook JS SDK) → cliente manda SOLO
   `{code}` a `POST /api/integrations/whatsapp/embedded-signup` (nunca `studioId` — se
   resuelve siempre de la sesión, reforzado además por el propio `WITH CHECK` de la RLS) →
   servidor intercambia `code`→token con `META_APP_SECRET`, y **valida contra la Graph API
   real** (`waba_id`, `phone_number_id`, `display_phone_number`, `verified_name`,
   `business_id`) antes de persistir nada — los datos que llegan del navegador en el
   `postMessage` de Embedded Signup son informativos, no de confianza. Si el
   `phone_number_id` ya pertenece a otra fila, el índice único de (1) lo bloquea con error
   explícito. Nada se guarda a medias: si la validación falla, `integraciones` no se toca.

5. **Coexistencia sin bifurcar código**: mismo `WhatsAppCredenciales{token, phoneId}` que ya
   consume `lib/whatsapp.ts` y el cron — el intercambio de código es solo un productor más
   de ese mismo shape. La UI decide qué pintar mirando `config.wabaId` (un `if`, no dos
   pantallas).

6. **Migración SQL propuesta** (número a reconfirmar con `list_migrations` remoto
   inmediatamente antes de aplicar — no fiarse del `ls` local, precedente de colisiones ya
   documentado en memoria del proyecto):
   `supabase/migrations/20260827150000_integraciones_whatsapp_embedded_signup.sql`
   ```sql
   alter table public.integraciones
     add column if not exists phone_number_id text;

   create unique index if not exists integraciones_whatsapp_phone_number_id_key
     on public.integraciones (phone_number_id)
     where tipo = 'WHATSAPP' and phone_number_id is not null;
   ```
   Sin política RLS nueva (ya cubierta por `owner_integraciones`), sin `GRANT`/`REVOKE`
   nuevo (no se crea ninguna función `SECURITY DEFINER` en esta fase).

7. **Grants**: no hace falta ninguna función `SECURITY DEFINER` nueva — la escritura pasa
   por `dbUpsertIntegracion` (cliente autenticado + RLS, igual que hoy) y la lectura del
   webhook usa el cliente `admin`/service-role ya existente en rutas server-only (un
   `SELECT` normal). Si una fase posterior decide envolver la resolución del webhook en una
   función Postgres, debe seguir el patrón ya documentado en memoria de este repo:
   `REVOKE EXECUTE ... FROM PUBLIC` + `GRANT` explícito + verificar con
   `has_function_privilege` para `anon`/`authenticated` — Postgres da `EXECUTE` a `PUBLIC`
   por defecto en funciones nuevas, y este repo ya tropezó con ello (`reservar_numero_factura`, PR #769).

### Fuera de la Fase B (para C en adelante)

- Valores reales de `META_APP_ID`, `META_APP_SECRET`, `META_CONFIG_ID`,
  `META_WEBHOOK_VERIFY_TOKEN` — configuración manual en Meta Developer Dashboard (Fase C).
- Implementación real de `lib/whatsapp.ts` (intercambio de código, validación Graph API) y
  de la ruta `/api/integrations/whatsapp/embedded-signup` (Fase D).
- Webhook `app/api/webhooks/whatsapp/route.ts` (verificación `X-Hub-Signature-256`,
  idempotencia) — diseño de alto nivel ya en la Fase A, implementación en Fase D/E.
- Verificar en vivo si `recordatorio_clase` se hereda entre WABAs o hay que re-aprobarla
  por WABA nuevo — sigue sin resolver, bloqueante para el primer estudio piloto.
- Cifrado transversal de `integraciones.config`/`integracion_credenciales`, si algún día se
  decide — iniciativa aparte, no parte de esta migración.
- Cambiar el `select`/mapeo del cron para leer la columna `phone_number_id` en vez de
  `config.phoneId` — cambio de una línea, se hace en la misma Fase D que escribe la columna
  nueva, no antes (evita una ventana con columna vacía y cron ya buscándola ahí).

---

## Revisión de código (`/code-review`) — 7 hallazgos confirmados, corregidos

Pasada de 8 ángulos independientes (3 de correctness, 3 de limpieza, altitud, convenciones)
+ verificación de 1 voto por candidato. 7 CONFIRMED + 1 PLAUSIBLE (fuera de alcance de esta
corrección, ver más abajo). Los 7 CONFIRMED, corregidos:

1. **Un solo fallo de entrega tumbaba la salud de TODO el estudio** — el webhook escribía
   `registrarSaludIntegracion` por cada `status` individual, saltándose el patrón
   `acumuladorSalud()` que el cron ya usa para exactamente este caso (un `failed` de un
   número mal escrito no puede pintar en rojo un token perfectamente sano). Corregido:
   `app/api/webhooks/whatsapp/route.ts` acumula por `studio_id` durante todo el payload y
   escribe una sola vez al final.
2. **"Desconectar" dejaba `phone_number_id` huérfano** — `dbUpsertIntegracion`
   (`lib/supabase-data.ts`) no incluía esa columna en su upsert, así que una fila
   "desconectada" seguía siendo resoluble por el webhook (resucitando su salud) y bloqueaba
   la reconexión del mismo número vía el índice único. Corregido en dos sitios: la columna
   ahora se sincroniza con `config.phoneId` en cualquier escritura de `dbUpsertIntegracion`
   (null en Desconectar), y el `SELECT` del webhook filtra `activo = true` como defensa
   adicional.
3. **La suscripción al webhook bloqueaba la respuesta y tragaba errores en silencio** —
   `suscribirWabaAWebhook` se esperaba (`await`) antes de responder pese a que el comentario
   decía lo contrario, y su fallo no se registraba en ningún sitio. Corregido con `after()`
   (mismo patrón ya usado en `app/api/stripe/webhook/route.ts`): corre tras enviar la
   respuesta, y si falla, se registra con `Sentry.captureMessage`.
4. **HTTP 409 para cualquier fallo, no solo el conflicto real** — `dbGuardarConexionWhatsappEmbeddedSignup`
   gana un flag `conflict: true` solo en el caso 23505; la ruta responde 409 únicamente ahí
   y 500 para el resto (service role ausente, cualquier otro error de Postgres).
5. **El toast de éxito nunca se veía** — `showToast` seguido de `window.location.reload()`
   síncrono no dejaba a React pintar nada. Corregido con el mismo patrón que usan
   Stripe/Google/Zoom en el mismo archivo: el query param `whatsapp_connected=1` sobrevive
   a la recarga y un `useEffect` nuevo lo lee para mostrar el toast.
6. **Se perdía el enlace "Docs" de WhatsApp** — la rama nueva específica de WHATSAPP no lo
   renderizaba, a diferencia de la rama genérica de la que dependía antes. Corregido
   añadiéndolo dentro de la propia rama.
7. **`businessId` nunca se revalida contra Meta** — cierto, pero el campo no se lee en
   ningún sitio del repo (solo display, nunca gatea nada) — impacto cosmético, no de
   seguridad. Corregido el comentario de cabecera de la ruta para no reclamar una garantía
   que no cubre este campo en concreto, en vez de fabricar una llamada extra a la Graph API
   para validar un dato que nadie consume.

**Sin corregir a propósito (PLAUSIBLE, no CONFIRMED)**: `lib/hooks/use-whatsapp-embedded-signup.tsx`
inicializa el SDK de Meta solo dentro de `<Script onLoad>`, sin el *polling* de respaldo que
`components/auth/turnstile-widget.tsx` (hook hermano) documenta haber necesitado tras un bug
real de producción. El verificador confirmó el mecanismo pero acotó el disparador real a una
ventana más estrecha de lo que parecía (a diferencia del widget de Turnstile, que se
desmonta y remonta en cada apertura de modal, `window.FB` es un objeto global e idempotente
que persiste durante toda la sesión) — queda documentado como riesgo de bajo disparo, no
corregido en esta pasada.

`npx tsc --noEmit`, `eslint` y `node --test` (14/14) en verde tras las correcciones (mismos
2 errores preexistentes y no relacionados de siempre en `components/network/mapa-resultados.tsx`).

---

## Fase D — Callback/onboarding, implementada

Migración `20260827150000_integraciones_whatsapp_embedded_signup.sql` aplicada en remoto
(`dwqvdycjcffqwfkzapvi`) y en el repo. `get_advisors` (security) sin hallazgos nuevos sobre
`integraciones`.

Código nuevo:
- `lib/whatsapp.ts`: `intercambiarCodigoWhatsApp(code)` (`GET /oauth/access_token` con
  `client_id`/`client_secret`/`code`, server-only, usa `META_APP_ID`/`META_APP_SECRET`) y
  `validarConexionEmbeddedSignup(token, phoneNumberId, wabaId)` (valida contra la Graph API
  real que el token da acceso al número y al WABA antes de que nada se persista).
- `lib/db/supabase-data-admin.ts::dbGuardarConexionWhatsappEmbeddedSignup(studioId, datos)`:
  persiste con service role (el callback no tiene sesión de navegador con la que la RLS
  pudiera operar, a diferencia del guardado manual). Traduce la violación del índice único
  de `phone_number_id` (23505) a un mensaje claro de "ese número ya está conectado a otro
  estudio", nunca un error técnico crudo.
- `app/api/integrations/whatsapp/embedded-signup/route.ts` (nueva ruta, `POST`): solo
  `PROPIETARIO` de la sesión (mismo límite que `/config` y `/probar`); recibe únicamente
  `{code, wabaId, phoneNumberId, businessId}` del cliente — **nunca `studioId`**, resuelto
  siempre de `verificarSesionStaff`. Cadena completa: intercambio de código → validación
  real contra Meta → persistencia → `registrarSaludIntegracion(...,{ok:true})`, aterrizando
  directo en `FUNCIONA` (nunca `SIN_PROBAR`). Si el intercambio o la validación fallan, no
  se guarda nada — nunca una conexión a medias.
- `app/api/integrations/config/route.ts`: deja de devolver `token` cuando la fila viene de
  Embedded Signup (`config.wabaId` presente) — no hay formulario que lo necesite ahí,
  aplicando la decisión de exposición mínima de la Fase B §2.

`npx tsc --noEmit` en verde para todo lo nuevo (los 2 únicos errores del árbol son
preexistentes y no relacionados: `components/network/mapa-resultados.tsx`, módulos
`react-leaflet`/`leaflet` sin tipos).

**Sin tocar en esta fase** (fuera de alcance, según diseño de Fase B): el cron de
recordatorios sigue leyendo `config.token`/`config.phoneId` exactamente igual que antes —
cero cambios en `enviarRecordatoriosClasesProximas`; el contrato `WhatsAppCredenciales`
tampoco cambió.

---

## Fase H — UX, implementada

Botón real "Conectar WhatsApp" con el SDK de Meta, sustituyendo el formulario manual como
camino principal — sin romper el formulario manual para quien ya lo usa.

- `lib/hooks/use-whatsapp-embedded-signup.tsx` (nuevo, mismo patrón que
  `components/auth/turnstile-widget.tsx`: un hook que carga su propio `<Script>` y expone
  una función de un solo uso). Carga el JS SDK de Meta, hace `FB.login({config_id, response_type:
  'code', override_default_response_type: true, extras:{setup:{}}})`, captura el `code` del
  callback y `waba_id`/`phone_number_id`/`business_id` del `postMessage` `WA_EMBEDDED_SIGNUP`
  (informativos, revalidados server-side en Fase D — nunca de confianza aquí), y llama a
  `POST /api/integrations/whatsapp/embedded-signup`.
- Sin `NEXT_PUBLIC_META_APP_ID`/`NEXT_PUBLIC_META_CONFIG_ID` (§9 de META_SETUP.md — hasta
  que alguien complete la Fase C en el dashboard real), `disponible` es `false`: el botón
  "Conectar WhatsApp" no aparece y la tarjeta cae al flujo manual existente — degradación
  explícita, mismo criterio que ya usan Stripe/Google/Zoom/Klaviyo en este mismo archivo
  para sus respectivos client IDs.
- `components/configuracion/tab-integraciones.tsx`: rama nueva para `WHATSAPP` en las
  acciones de la tarjeta (Conectar-vía-Meta / Gestionar+Probar / Conectar-manual-fallback) y
  en el modal — una fila conectada por Embedded Signup (detectada por `config.wabaId`
  presente, vía `GET /api/integrations/config`) muestra un resumen de solo lectura
  (nombre verificado + número, sin ningún campo editable) en vez del formulario de
  token/phoneId, evitando que "Guardar" sobreescriba una conexión válida con un token
  vacío (la API ya no lo manda al navegador para esas filas, ver Fase D). Una fila del
  flujo manual sigue abriendo exactamente el mismo formulario de siempre.

`npx tsc --noEmit` y `eslint` en verde para todo lo nuevo de Fase D+H (únicos errores del
árbol: los 2 preexistentes de `components/network/mapa-resultados.tsx`, sin relación).

**Sin verificar en navegador real** (sin credenciales de Meta reales en este entorno — la
Fase C sigue pendiente de completarse a mano en el dashboard): el flujo de `FB.login` en sí
mismo no se ha probado contra un popup real de Meta. Cuando alguien complete META_SETUP.md
y dé de alta las 4 variables de entorno, el primer intento real debería hacerse con un
estudio de pruebas, no uno con clientas reales.

**Sin tocar**: la UI de desconexión reutiliza `desconectar(cat)` ya existente sin cambios —
mismo semántica de "vacía `config` y pone `activo=false`" para ambos orígenes.

---

## Fase E — Webhook entrante, implementada

No es un inbox: procesa actualizaciones de ESTADO de los mensajes salientes (recordatorios)
para que la salud de la tarjeta de Integraciones se entere de un fallo (token revocado,
plantilla rechazada) sin esperar al próximo recordatorio fallido del cron. Mensajes
entrantes se reconocen (200) pero no se procesan — construir un inbox real de WhatsApp es
otra funcionalidad, no pedida aquí, mismo criterio que ya usa el webhook de Twilio
(medición, no bandeja).

- `lib/meta-firma.ts` (nuevo): `firmaMetaValida()`, HMAC-SHA256 sobre el CUERPO CRUDO con
  `META_APP_SECRET`, comparación en tiempo constante — mismo estilo que
  `lib/twilio-firma.ts`.
- `app/api/webhooks/whatsapp/route.ts` (nuevo):
  - `GET`: responde `hub.challenge` solo si `hub.mode=subscribe` y `hub.verify_token`
    coincide con `META_WEBHOOK_VERIFY_TOKEN` — verificación inicial que Meta exige antes de
    dejar guardar la URL en el dashboard.
  - `POST`: fail-closed sin `META_APP_SECRET` (503, para que Meta reintente cuando esté
    configurado — mismo criterio que `twilio-inbound`); firma inválida → 403. `studio_id`
    se resuelve SIEMPRE contra la columna `phone_number_id` de la Fase D, nunca contra otro
    dato del payload. Reutiliza la infraestructura de idempotencia YA EXISTENTE de Stripe
    (`webhook_events`/`reclamar_webhook_event`, 0032/M10) con un ámbito nuevo `'whatsapp'`
    en `lib/webhook-idempotencia.ts` — cero tablas nuevas.
- `lib/whatsapp.ts::suscribirWabaAWebhook(token, wabaId)` (nuevo): `POST /{WABA_ID}/subscribed_apps`
  — sin esto, el webhook nunca recibe NADA de un WABA por mucho que la URL esté bien dada de
  alta a nivel de app (la suscripción es POR WABA). Se llama desde
  `app/api/integrations/whatsapp/embedded-signup/route.ts` justo tras guardar la conexión,
  best-effort (un fallo no deshace la conexión — el número ya sirve para enviar, solo se
  queda sin recibir eventos hasta reintentar).

`npx tsc --noEmit` y `eslint` en verde para todo lo nuevo (mismos 2 errores preexistentes y
no relacionados de siempre en `components/network/mapa-resultados.tsx`).

**Sin verificar contra Meta real** (mismo motivo que Fase H: sin credenciales reales en este
entorno). Cuando se complete META_SETUP.md §6 (dar de alta la URL del webhook en el
dashboard), el primer evento real debería confirmarse contra un estudio de pruebas.

**Descartado a propósito**: no se creó ningún inbox de mensajes entrantes ni tabla nueva
para guardarlos — no estaba pedido y habría sido una funcionalidad de producto aparte, no
"soportar el webhook". Si en el futuro se quiere un inbox real de WhatsApp, es una decisión
de producto propia (mismo criterio que ya se aplicó al descartar "valorar a la alumna" en
`autoservicio-instructora-561-562-563.md`), no una extensión trivial de este webhook.

---

## Fase I — Tests, implementada (con una verificación bloqueada, documentada)

**Unitarios** (`node --test --experimental-strip-types`, patrón del repo):
- `lib/meta-firma.test.ts` (nuevo, 6 casos): firma válida, cuerpo alterado tras firmar,
  secreto equivocado, sin header, sin el prefijo `sha256=`, longitud distinta — cubre la
  pieza de seguridad crítica que guarda el webhook de la Fase E.
- `lib/webhook-idempotencia.test.ts` (ampliado, +1 caso): el ámbito nuevo `'whatsapp'` se
  aísla igual que `'connect'`/`'billing'`, y un mismo wamid con DOS estados distintos
  (`delivered`→`read`) se trata como dos eventos reales, no como un duplicado — la clave
  incluye el estado a propósito.
- **14/14 en verde** (`node --test lib/meta-firma.test.ts lib/webhook-idempotencia.test.ts`).

**E2E** (`e2e/whatsapp-embedded-signup.spec.ts`, nuevo, mismo andamiaje que
`e2e/credenciales-no-se-pierden.spec.ts`): 3 casos — el modal de solo lectura aparece con
`config.wabaId` presente (y NUNCA el campo de token ni el botón Guardar, que sobreescribiría
una conexión válida con un token vacío); "Desconectar" manda de verdad la petición
(contador de intentos, no solo el cambio de texto en pantalla — mismo criterio que
`test-4xx-necesita-contador-de-intentos` de la memoria del proyecto); una fila SIN `wabaId`
(flujo manual) sigue abriendo el formulario de siempre, sin regresión.

⚠️ **No se pudo confirmar en verde en este entorno — bloqueo de infraestructura, no del
código nuevo.** Al ejecutar la suite (`next dev` local vía `playwright.config.ts`), los 3
casos se quedan colgados en la pantalla de "Iniciar sesión": la sesión mockeada en
`localStorage` nunca autentica. Para descartar un bug propio, se ejecutó también
`e2e/credenciales-no-se-pierden.spec.ts` **sin tocar, tal cual está en el repo** — falla
EXACTAMENTE igual (mismo síntoma, mismo punto). Es el mismo tipo de límite ya documentado en
memoria del proyecto (`e2e-local-no-concluyente.md`, `dev-server-manual-worktree-404-apis.md`):
este worktree concreto no reproduce las condiciones (env dummy de Supabase + `E2E_TEST=1`)
que sí tiene el pipeline de CI. El test está escrito y sigue el patrón exacto de uno ya en
`main`; hace falta correrlo en CI (o en un entorno con el `.env.local` de e2e correcto) antes
de darlo por verificado en verde.
