# Fase 9 — "API pública v1": diagnóstico y alcance recomendado

> Estado del repo auditado: `origin/main` @ `effc1d30` (17 ago 2026). Fotografía para
> decisión, no código — este documento es de diseño, no hay implementación aquí.
>
> Continúa la serie `docs/*-widget-diseno.md` (Fases 0-8, todas en `main`) y
> `docs/oauth-arquitectura.md` (servidor OAuth 2.0 para Zapier, Fases 0-5, también en
> `main`). Este último es el hallazgo central del documento: **ya es, en la práctica,
> la API pública que "Fase 9" pide construir.**

## 0. Conclusión primero

El brief original (`docs/booking-engine-architecture.md:84`, escrito en la Fase 0, antes
de que existiera nada de OAuth) dibujaba "Public API (Fase 9, no empezada)" como una
tercera pata junto al widget embebido, separada. Eso era correcto **en ese momento**. Ya
no lo es: entre la Fase 0 y hoy se construyó `/api/oauth/v1/*` (servidor OAuth 2.0 completo
— Authorization Code + PKCE, refresh con rotación y reuse-detection, scopes, rate limiting,
auditoría por llamada, UI de gestión en Configuración → API) para dar acceso a terceros a
`clientas`, `reservas` (crear/cancelar/listar), `notas` y `tareas`. Es exactamente el tipo
de superficie que "API pública v1" pediría: listar/crear socias, crear/cancelar una
reserva, escribir una nota operativa — con autenticación por aplicación, no por sesión de
staff ni por widget.

**Mi recomendación es no construir una "Fase 9" grande.** Construir un segundo mecanismo
de acceso externo (API keys por estudio, rutas `/api/v1/...` nuevas) para hacer casi lo
mismo que `/api/oauth/v1/*` ya hace duplicaría la capa de autenticación pública (dos
sitios donde auditar scopes, dos sitios donde revisar rate-limit, dos superficies que
`tentare-seguridad` tiene que repasar por separado) sin que hoy exista una necesidad real
que lo justifique: Zapier es el único consumidor real, y el propio `docs/oauth-arquitectura.md`
ya deja anotado, como trabajo pendiente **cuando se pida**, ampliar exactamente esta capa
(triggers/scopes que faltan) en vez de sustituirla.

Lo que sí encuentro que falta — genuino, pequeño, y op­cional — está en la §3.

## 1. Qué existe ya (verificado en código, no en memoria de fases previas)

### 1.1 El servidor OAuth (`app/api/oauth/*`, `docs/oauth-arquitectura.md`)

| Endpoint | Auth | Qué hace |
|---|---|---|
| `/oauth/authorize`, `/api/oauth/authorize` | sesión de staff | Pantalla de consentimiento, PROPIETARIO/MANAGER |
| `/api/oauth/token` | client_id+secret | Canje de code / refresh (PKCE S256 obligatorio) |
| `/api/oauth/me` | Bearer | Test de conexión — lista blanca, nunca objeto crudo |
| `/api/oauth/revoke`, `/consentimientos` | sesión de staff | Revocar/listar apps conectadas |
| `GET/POST /api/oauth/v1/clientas` | Bearer + `clientas:leer`/`:escribir` | Listar / crear socia |
| `GET/POST /api/oauth/v1/reservas` | Bearer + `reservas:leer`/`:escribir` | Listar / crear reserva |
| `POST /api/oauth/v1/reservas/cancelar` | Bearer + `reservas:escribir` | Cancelar (con penalización si aplica) |
| `POST /api/oauth/v1/notas` | Bearer + `notas:escribir` | Nota operativa (nunca ficha clínica) |
| `POST /api/oauth/v1/tareas` | Bearer + `tareas:escribir` | Crear tarea |

Cada acción reutiliza la función de negocio server-side ya existente
(`crearReservaPublica`, `cancelarReservaPublica`, `registrarSociaPublica`) — cero lógica
de reglas duplicada, mismo patrón que el resto del repo. Rate limiting por bucket
(`enforceRateLimit`, 20-60 req/min según endpoint) respaldado en Postgres
(`rate_limit_hit`, fail-open si el service role no está configurado). Auditoría
fire-and-forget en `oauth_auditoria_accesos` por cada llamada Bearer.

**12 scopes ya definidos en `lib/oauth-crypto.ts`**, de los que solo 7 tienen endpoint
real: `clientas:leer/escribir`, `reservas:leer/escribir`, `notas:escribir`,
`tareas:escribir` (y `/me`). **Sin endpoint todavía pero con scope reservado**:
`pagos:leer`, `instructores:leer`, `notas:leer`, `tareas:leer`, `leads:leer/escribir`.
Es decir, el patrón de "añadir un endpoint de lectura más" ya está anticipado en el
propio catálogo de scopes — no hace falta diseñar un mecanismo nuevo para eso, solo
escribir la ruta.

**Catálogo de apps cerrado**: `oauth_clientes` es una tabla con una sola fila real
(Zapier) — no hay registro self-service de apps nuevas. Esto es la única limitación de
fondo real del sistema actual: si mañana un estudio quiere que **su propio desarrollador**
(no Zapier) llame a la API, hoy no hay manera de darle un `client_id` sin una migración
manual de datos. Documentado explícitamente como "fuera de esta fase" en
`docs/oauth-arquitectura.md:104-106` — no es un descuido, es una decisión ya tomada de
no construirlo hasta que haga falta.

### 1.2 El "otro" público: `/api/public/*` (usado por el widget, sin auth de aplicación)

Son 20+ rutas (`evento`, `socio`, `disponibilidad`, `checkout-embebido`, `aforo`,
`reserva`, `studio-data`, `aceptar-oferta-espera`...) que **no son una API para
terceros** — son el backend privado del widget embebido, con dos mecanismos de auth
distintos según la ruta y **nunca mezclados en el mismo handler** (regla ya establecida,
ver `/api/mi-disponibilidad` vs `/api/public/disponibilidad` en `.claude/tentare-os.md`):

- **JWT de Supabase Auth de la socia** (`verificarUsuarioSupabase`) cuando hay sesión de
  portal — `studio-data`, `reserva`, `checkout-embebido`.
- **Token firmado de un solo propósito** (`verificarTokenInstructora`, JWT con `scope`
  ligado a `instructorId`+`studioId`) para los deep-links sin cuenta — `disponibilidad`,
  `baja`, `aceptar-sustitucion`.
- **Sin autenticación de identidad, solo `slug`** para el catálogo público
  (`studio-data` sin sesión devuelve *solo* clases/salas/planes, nunca datos
  personales — el propio comentario del código lo deja explícito en
  `app/api/public/studio-data/route.ts:9-12`).

Confirmo con esto una cosa importante para el diseño: **el catálogo público de horarios
YA es accesible sin ninguna clave** (`POST /api/public/studio-data` con `{slug}`, CORS
habilitado para el bundle embebible). No es una "API pública v1" en el sentido de tener
un contrato versionado y documentado para terceros — es un endpoint interno con la forma
que el widget necesita hoy — pero el dato en sí (horarios/clases/aforo del catálogo) ya
sale del perímetro sin fricción. Cualquier propuesta de "Fase 9" que reintroduzca este
mismo dato detrás de una clave de API estaría añadiendo fricción a algo que hoy es
gratis, no cerrando un agujero.

### 1.3 No hay claves de API propias de Tentare

Grep de `api_key`/`apiKey`/`API_KEY` en todo el repo: los únicos resultados son claves de
**servicios terceros que Tentare consume** (Resend, Twilio, Kisi, Fiskaly) — cero
resultados de un concepto "clave de API emitida por Tentare a un estudio". Todo acceso
externo hoy pasa por OAuth (Zapier) o por los tres mecanismos de `/api/public/*` de arriba.
No hay que "migrar" nada — es simplemente que la pregunta "¿API keys o ampliar OAuth?" ya
tiene un precedente de un solo lado.

## 2. El tamaño real de producción (por qué esto importa para el alcance)

- 1 estudio (`studio-1`/`tentare`) con datos reales, tope 202 socias sembradas en el
  estudio más grande. 1 sola socia real con tarjeta guardada en Stripe, 0 con SEPA (nota
  ya documentada en `.claude/tentare-os.md`, Fase 3 dinero de Decision OS).
- Un único cliente OAuth real (Zapier) — cero peticiones de un estudio pidiendo su propia
  integración custom, hasta donde el repo documenta.
- El propio `docs/oauth-arquitectura.md` ya lista, como "fuera de esta fase, para cuando
  se pida": los triggers/actions restantes del pedido original de Zapier (nuevo lead,
  pago realizado/fallido, cliente dado de baja, lista de espera, sustitución, clase
  completada) — es decir, ni siquiera el catálogo de Zapier está agotado todavía.

Con este tamaño, invertir en un segundo mecanismo de auth pública (self-service de apps,
API keys, versionado `/api/v1/` paralelo) antes de que exista un segundo consumidor real
es construir para una demanda hipotética — exactamente el patrón que este repo ya
rechazó una vez con los "god files" (PR #233, cerrado dos veces) y con el feature-freeze
de Kiosko/POS/VOD/Comunidad: no es que la idea esté mal, es que no hay señal de mercado
que la justifique hoy, y el coste de mantenerla (superficie de ataque, docs, tests,
`tentare-seguridad` de nuevo) es real incluso si no se usa.

## 3. Lo que sí tiene sentido, si/cuando se pide — alcance mínimo

No como "Fase 9: 10 endpoints nuevos", sino como **extensiones incrementales de lo que
ya existe**, una a la vez, cuando haya una petición real (de Zapier o de un estudio):

1. **`GET /api/oauth/v1/reservas/{id}` o filtro por `socioId`** — hoy solo se puede
   listar por `estado`; un consumidor que quiera "las reservas de esta clienta" pagina
   entera y filtra en cliente. Coste: una query más, mismo patrón, scope `reservas:leer`
   ya existe.
2. **`GET /api/oauth/v1/planes` (scope nuevo `planes:leer`)** — "consultar el plan/bono
   de una socia" es la pregunta de negocio real que un desarrollador externo haría (p.ej.
   para sincronizar con una hoja de cálculo de facturación). No existe hoy; sería el
   scope de lectura más pedido razonablemente, y reutiliza `suscripciones` (RLS abierta a
   todo el personal, ya documentada como decisión de producto — aquí se leería vía
   service-role igual que el resto de `/api/oauth/v1/*`, sin tocar esa RLS).
3. **`GET /api/oauth/v1/horarios` (scope nuevo `horarios:leer`, sin PII)** — la única
   pieza que de verdad falta del catálogo "horarios públicos" mencionado en el brief: hoy
   ese dato sale por `/api/public/studio-data`, con forma pensada para el widget (bundle
   completo) y sin contrato versionado documentado para terceros. Si un estudio quisiera
   pintar sus horarios en su propia web sin usar el widget/iframe, este sería el endpoint
   — de solo lectura, sin datos personales, bajo rate limit generoso porque no hay riesgo.
   Sin necesidad de scope siquiera si se sirve por slug igual que `studio-data` (ya es
   público de facto); con scope solo si se quiere medir/atribuir uso por app.
4. **Cerrar el hueco de "leads" ya prometido en Fase 5** (`leads:leer/escribir`, scope ya
   reservado en `lib/oauth-crypto.ts` sin endpoint) — "nuevo lead" es de los triggers que
   Zapier original pedía y quedó fuera. Si el objetivo de "Fase 9" es completar la
   promesa a Zapier, esto pesa más que inventar un mecanismo nuevo.

Cada uno de estos es una ruta nueva bajo `/api/oauth/v1/`, siguiendo el patrón exacto ya
establecido (`verificarTokenOAuth` → `tieneScope` → query filtrada por `ctx.studioId` →
`auditarAccesoOAuth`) — no una migración de esquema, no una función `SECURITY DEFINER`
nueva (las rutas ya usan `getSupabaseAdmin()` + filtro manual, no RPC), no un rediseño de
autenticación. El gotcha de grants de Postgres (`REVOKE ... FROM PUBLIC` + `GRANT`
explícito + `has_function_privilege`) **no aplica** a ninguna de estas cuatro extensiones
porque ninguna toca una función `SECURITY DEFINER` — son queries `select`/`insert`
directas vía service-role, igual que las rutas `v1` existentes.

## 4. Lo que decididamente NO construiría

- **API keys por estudio**: serían un segundo modelo de autorización más débil que OAuth
  (sin scopes por defecto salvo que se reimplemente esa lógica, sin rotación, sin
  revocación granular, sin PKCE) resolviendo un problema — "un estudio quiere dar acceso
  a un desarrollador propio sin pasar por el catálogo cerrado de Zapier" — que si es real
  se resuelve mejor abriendo el registro self-service de `oauth_clientes` (ya identificado
  como el trabajo pendiente real en `docs/oauth-arquitectura.md:104-106`) que con un
  mecanismo paralelo.
- **`/api/v1/...` como namespace nuevo**: ya existe versionado real en
  `/api/oauth/v1/*`. Crear un segundo `/api/v1/` sin `oauth/` en el path fragmentaría
  documentación y superficie de seguridad sin necesidad — y el propio nombre induciría a
  pensar que hay DOS APIs públicas cuando debería haber una.
- **Rate limiting nuevo**: `enforceRateLimit`/`rate_limit_hit` ya cubre esto, mismo patrón
  para cualquier ruta nueva bajo `v1/`.
- **Documentación pública tipo "developer portal"** (Swagger/OpenAPI, portal de docs):
  prematuro con un solo consumidor real (Zapier, que ya tiene su propia integración
  construida por Tentare, no un desarrollador externo leyendo specs). Si aparece un
  segundo consumidor real, ahí sí valdría la pena — no antes.

## 5. Qué haría falta para reabrir esto en grande

Señal que justificaría invertir en registro self-service de apps / un developer portal
real: **un estudio o partner real pidiendo integrar algo que Zapier no cubre**, o un
segundo agente (además de Zapier) queriendo conectarse. Hasta entonces, el trabajo de
mayor valor por esfuerzo es cerrar los triggers/scopes que `docs/oauth-arquitectura.md`
ya deja pendientes uno a uno, no releer el brief de Fase 0 al pie de la letra.

## 6. Resumen para decidir

| Opción | Coste | Beneficio hoy | Recomendación |
|---|---|---|---|
| "Fase 9" completa (API keys, `/api/v1/` paralelo, self-service, docs públicas) | Alto (nueva capa de auth, nueva superficie de seguridad, docs) | Bajo (0 consumidores reales esperando esto) | **No construir ahora** |
| Extender `/api/oauth/v1/*` con 2-4 endpoints de lectura (§3) | Bajo (mismo patrón, sin migración de esquema) | Medio (cierra huecos ya identificados en Fase 5, sirve a Zapier y a un eventual segundo consumidor) | **Sí, uno a uno, cuando se pida** |
| No tocar nada | Cero | — | Válido también si no hay ninguna petición pendiente ahora mismo |
