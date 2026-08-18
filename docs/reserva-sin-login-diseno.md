# Reserva sin login primero: pagar antes de tener cuenta — diseño técnico

> Estado del repo auditado: `f26fcfbc` (18 ago 2026), rama
> `claude/checkout-sin-login-diseno`. Documento de diseño, no código — la
> implementación es un paso posterior. Sigue el mismo formato que
> `docs/checkout-embebido-diseno.md` (Fase 3 del "Booking Experience
> Engine"), del que este diseño es la continuación natural: aquella fase
> construyó el mecanismo de pago embebido; esta decide **cuándo** se dispara
> y qué pasa con la identidad de quien paga.

## 0. El hallazgo que cambia el encargo, en una frase

**El pedido del fundador asume que hoy existe un "pagar una clase suelta y
reservarla en el mismo paso", y no existe.** El modelo de dinero de Tentare
es "compra un derecho (plan/bono) → canjéalo en clases sin pagar en el
momento de reservar" (`crearReservaPublica`, `lib/db/supabase-data-admin.ts:1414`,
exige `tieneEntitlementActivo` cuando `exigirPlanResuelto`) o "reserva sin
pagar nada" (si el estudio no exige plan). No hay ningún camino, hoy, donde
reservar UNA clase dispare un cobro de esa clase en concreto.

Lo que SÍ existe, y resuelve el 90% del pedido sin inventar nada: un tipo de
plan `PUNTUAL` (`lib/types.ts:7`, `TipoPlan = 'MENSUAL' | 'BONO' | 'PUNTUAL'`)
que es literalmente "una sesión, comprada una vez" — con `sesiones: 1` y
`tiposClaseIds` opcionalmente acotado a un tipo de clase concreto
(`lib/types.ts:496`). Comprar un plan PUNTUAL que cubre el tipo de la clase
elegida **es** "pagar esa clase", en el vocabulario que el resto del
producto ya usa. Y el checkout embebido de ese plan (PaymentIntent + Payment
Element dentro del Shadow Root, sin salir de la web del estudio) **ya está
construido y en `main`**: `components/checkout-widget/checkout-embebido.tsx`,
`components/checkout-widget/lista-planes.tsx`,
`app/api/public/checkout-embebido/route.ts`,
`lib/billing/entregar-plan-comprado.ts`. Documentado, con riesgos ya
revisados, en `docs/checkout-embebido-diseno.md`.

Este diseño se apoya en esa pieza para el 90% del pedido (§2-§4) y señala
explícitamente, sin construirla, la pieza que sí sería genuinamente nueva —
cobrar el `precio_puntual` de una SESIÓN concreta sin pasar por un plan de
catálogo (§9) — porque el fundador puede querer una u otra según cómo hable
con las propietarias de esto, y no es la misma cantidad de trabajo.

## 1. Lo que ya existe y hay que entender antes de tocar nada

### 1.1 El step-machine actual de Modo A (`app/reservar/[slug]/page.tsx`)

```
type Step = 'login' | 'registro' | 'contrato' | 'confirm' | 'done' | 'espera' | 'pendiente';
```
(línea 242). `openBooking(sesionId)` (línea 969) decide el paso de entrada:

- No autenticada → `'login'` (envía enlace mágico, `handleEnviarEnlace`,
  línea 1019, vía `enviarEnlace` de `use-socia-session.ts`, que llama
  `supabasePortal.auth.signInWithOtp` con `emailRedirectTo` de vuelta a esta
  misma página con `?sesion=`).
- Autenticada, sin ficha (walk-in `socia === null` pero `autenticado`) →
  `'registro'` (nombre + teléfono, sin contraseña — comentario explícito en
  línea 1064: "P0 reservar sin cuenta... el enlace mágico YA verifica el
  email, así que \[pedir contraseña\] era un paso de más").
- Con ficha pero sin contrato firmado → `'contrato'`.
- Todo en regla + hay clase elegida → `'confirm'`.
- Sin clase elegida (acceso genérico) → cierra directo.

`handleConfirm` (línea 1116) hace el alta de la ficha walk-in si hace falta
(`crearAltaWalkIn`, línea 948, vía `addSocioFromPortal` →
`POST /api/public/socio` `{accion:'registrar'}` → `registrarSociaPublica`) y
LUEGO reserva (`addReserva` → `POST /api/public/reserva` →
`crearReservaPublica`). **El orden real hoy es: verificar email (magic
link) → completar ficha → reservar** — ya NO es "crear contraseña antes de
nada" (eso se corrigió en la auditoría Momence, P0), pero sigue siendo
"demuestra tu email antes de poder reservar", que es exactamente lo que el
fundador quiere invertir.

### 1.2 Modo B (`app/widget-bundle/main.tsx`) ya tiene un patrón más cercano al pedido, para reservas SIN pago

`manejarReservar` (línea 101): si no hay `socia`, guarda la reserva
pretendida (`pendienteReserva`) y abre el formulario de acceso
(`accesoAbierto`), **sin bloquear el calendario**. En cuanto `socia` pasa a
tener valor (login resuelto), un `useEffect` (línea 109) completa la reserva
sola y avisa con un banner. Es "elige clase primero, verifica identidad
después, la reserva se completa cuando la identidad está lista" — el mismo
espíritu que pide el fundador, pero para reservas SIN dinero de por medio
(la clase se reserva directamente cuando no exige plan, o falla con el gate
de "sin plan" que entonces hay que resolver comprando uno). No hay hoy un
tercer estado "pago pendiente" en este flujo.

### 1.3 El checkout embebido de un plan (Fase 3, ya en `main`) — la pieza a reutilizar

`ListaPlanes` (`components/checkout-widget/lista-planes.tsx`) ya soporta
comprar SIN `socioId` (guest): `crearCheckoutEmbebido` llama a
`POST /api/public/checkout-embebido` con `socioId: null` — el endpoint
(`app/api/public/checkout-embebido/route.ts:88-98`) solo lo bloquea si
`studios.compra_publica_modo === 'EXIGIR_REGISTRO'` (el default,
`lib/db-types.ts:638`), devolviendo `409 {necesitaRegistro:true}`. Con el
estudio en el otro modo, un guest puede pagar sin haber tocado el formulario
de acceso en absoluto.

El webhook (`app/api/stripe/webhook/route.ts:584-618`, rama
`pi.metadata?.origen === 'plan_web_embebido'`) llama a
`entregarPlanComprado` (`lib/billing/entregar-plan-comprado.ts:108`), que:

1. Si `compra.socioId` es `null`, busca por email en `socios` de ese estudio
   (`.ilike('email', ...)`, línea 141) — reutiliza si existe, crea "ficha
   fantasma" si no (**sin `auth_user_id`** — el insert de la línea 154 no
   escribe esa columna).
2. Crea la suscripción `ACTIVA` y el recibo `COBRADO`, ambos con ids
   derivados determinísticamente de `idsDe(sessionId/paymentIntentId)`
   (línea 91-99) — **idempotencia real ante reintentos de webhook**: un
   `INSERT` duplicado choca por PK (`23505`, `YA_EXISTIA`) y se ignora en
   vez de duplicar.

Es decir: **"Customer → Booking(entitlement) sin User" ya existe en este
repo, para planes.** Lo que falta es (a) que ese entitlement se traduzca en
una RESERVA concreta de la clase que la persona eligió, y (b) el "User"
(cuenta con la que puede volver): hoy la ficha fantasma se queda sin
`auth_user_id` hasta que la clienta, en otra sesión, pasa por
`/reservar/[slug]` y hace login por su cuenta — `registrarSociaPublica`
(línea 2627) la adopta entonces (comentario línea 2657: "el bono ya cobrado
queda invisible para siempre en la fantasma \[si no se adopta\]"). **No hay
ningún email de "aquí tienes tu acceso" enviado tras ese pago hoy.**

### 1.4 Cómo se crea una cuenta sin contraseña, mecanismo exacto

No hay ningún uso de `supabase.auth.admin.*` (Admin API) en todo el repo —
verificado por grep. El único mecanismo de crear/activar una cuenta sin
contraseña es **client-side**: `supabasePortal.auth.signInWithOtp({email,
options:{emailRedirectTo, captchaToken}})` (`lib/use-socia-session.ts:90`).
Con `shouldCreateUser` no explícito (default `true` en supabase-js), esta
llamada **crea el usuario de Auth si no existe y manda el email en el mismo
paso** — si ya existe, manda el mismo email de acceso sin crear nada
duplicado. Es el mecanismo que ya usa TODO login/alta del widget hoy; no
hace falta inventar nada del lado de Supabase Auth, solo dispararlo en un
momento distinto del flujo (§3).

### 1.5 RLS: no es un problema aquí, y por qué

`crearReservaPublica`, `registrarSociaPublica`, `entregarPlanComprado`
corren SIEMPRE con `getSupabaseAdmin()` (service-role, sin RLS) — la
autorización vive en TypeScript (comparar email, studioId, `auth.uid()`
resuelto en la ruta vía `verificarUsuarioSupabase`), nunca en política de
fila. El JWT que exige `app/api/public/reserva/route.ts:34` y
`app/api/public/socio/route.ts:36` es una decisión de esa RUTA concreta
(`verificarUsuarioSupabase`), no una restricción de las funciones de
`supabase-data-admin.ts` que llaman por debajo — la prueba es que
`entregarPlanComprado` ya las bypasea desde el webhook sin ningún JWT.
**Conclusión: "reservar sin sesión previa" es un problema de qué ENDPOINT
llamar (uno nuevo, sin exigir JWT, con su propia autorización basada en el
pago verificado por Stripe) — no un problema de RLS que haya que reabrir.**

### 1.6 El candado de aforo que hay que preservar

`reservar_plaza` (última firma en `supabase/migrations/20260730192445_aprobacion_manual_reserva.sql:30`,
6 argumentos: `p_studio_id, p_sesion_id, p_socio_id, p_reserva_id,
p_permite_lista_espera, p_requiere_aprobacion`) hace `SELECT ... FOR UPDATE`
sobre la sesión antes de decidir `CONFIRMADA`/`LISTA_ESPERA`/rechazo —
cualquier camino nuevo de "reservar tras pago" tiene que pasar por AQUÍ, no
reimplementar el recuento de aforo en TypeScript. Es la única forma de que
"dos reservas simultáneas por la última plaza" (edge case #10 del pedido)
no produzca overbooking.

## 2. Arquitectura elegida: dos rutas de "pagar sin cuenta", no una

El pedido del fundador habla de "el precio de la clase". En este código ese
precio puede significar dos cosas distintas, y **la UI debe mostrar solo una
de las dos según cómo tenga configurada la clase el estudio** — nunca
ambigüedad ni un tercer sistema paralelo:

**Ruta A — la clase se cubre con un plan (caso normal, `exigirPlanResuelto`
true o el estudio simplemente vende bonos/mensualidades)**: "pagar la clase"
= comprar el plan `PUNTUAL` (o el bono/mensualidad que la propietaria
decida ofrecer en ese paso) que la cubre, y reservarla automáticamente en
cuanto el pago se confirma. **100% reutilización**: `ListaPlanes` +
`CheckoutEmbebido` + `entregarPlanComprado`, con UNA pieza nueva: que
`entregarPlanComprado` sepa reservar la sesión elegida además de entregar el
plan (§4).

**Ruta B — el estudio vende la clase suelta a un precio propio, sin exigir
plan (`!exigirPlanResuelto` y `sesiones.precio_puntual` fijado)**: cobro
directo del importe de esa sesión, sin pasar por `planes_tarifa`. Esto SÍ es
nuevo de verdad (§9) — `precio_puntual` hoy solo alimenta el margen del
Decision OS (`lib/decision/margen-clase.ts:78`), nadie lo cobra.

La UI decide la ruta con un solo dato ya resuelto en servidor (nunca
adivinado en el cliente): `heredaOverride(reglasTipo.exigirPlan,
pol.exigirPlan)` — la misma función que ya usa `crearReservaPublica`
(`lib/db/supabase-data-admin.ts:1445`, `lib/booking-logic.ts`). Se expone en
la respuesta de disponibilidad pública (`GET /api/public/disponibilidad` o
el payload de `useDatosWidget`, a extender) como
`requierePlan: boolean` por sesión — no se recalcula en el cliente.

**Recomendación de alcance para un primer PR: solo Ruta A.** Es la que
reutiliza infraestructura ya construida y revisada
(`docs/checkout-embebido-diseno.md §9` ya cerró los riesgos de Shadow
DOM/CSP/3DS para este mecanismo de pago), cubre el caso más común (estudios
que venden bonos/mensualidades, que es la mayoría de estudios de Pilates
reformer — ver `docs/checkout-embebido-diseno.md` y el resto de este
programa), y no obliga a diseñar un segundo PaymentIntent con metadata
distinta antes de validar que el primero funciona en producción con un
cobro real (que, según `.claude/tentare-os.md`, **no ha pasado todavía ni
para planes**: "Fase 3 dinero — construida, NO probada con un cobro real").
Construir Ruta A y B a la vez multiplica esa deuda de verificación sin
necesidad.

## 3. El nuevo step-machine

### 3.1 Modo A (`/reservar/[slug]`)

Se añade un tipo de sesión que hoy ya distingue el paso 'confirm' de si hace
falta gate: cuando `evaluarGate`/`requierePlan` dice que la socia (guest,
sin `socia` todavía) no puede reservar sin plan, en vez de caer al modal de
login-primero se entra en un paso nuevo:

```
type Step =
  | 'login'      // se mantiene: acceso EXPLÍCITO ("¿Ya tienes cuenta? Entra")
  | 'datos'      // NUEVO: nombre + apellidos + email + teléfono, sin contraseña
  | 'pago'       // NUEVO: CheckoutEmbebido con el plan resuelto para esta clase
  | 'registro' | 'contrato' | 'confirm' | 'done' | 'espera' | 'pendiente';
```

Transición de entrada de `openBooking(sesionId)` (línea 969), reescrita:

```
No autenticada, sesión SIN clase elegida (acceso genérico)
  → 'login' (sin cambios: aquí no hay nada que pagar, es solo "quiero entrar")

No autenticada, CON clase elegida:
  requierePlan === false → 'confirm' directo tras 'datos' (walk-in gratuita,
                            mismo criterio que Ruta actual, solo que SIN pedir
                            login antes — la identidad se resuelve al reservar,
                            no antes)
  requierePlan === true  → 'datos' → 'pago' → confirmación

Autenticada (ya con socia+ficha+contrato) → 'confirm' (sin cambios)
Autenticada sin ficha (walk-in ya verificada por link) → 'registro' (sin cambios,
  camino de quien SÍ decidió entrar por 'login' primero, se conserva tal cual)
```

`'login'` NO desaparece: sigue siendo la puerta para quien prefiere entrar
primero (persona recurrente, quiere ver "Mis reservas" antes de decidir). Lo
que cambia es que **ya no es la única puerta ni la que se abre por
defecto** al elegir una clase — el CTA principal de la tarjeta de clase pasa
a ser "Reservar clase →" (spec punto 1), que entra directo a `'datos'` (o a
`'confirm'` si no hace falta plan), con un enlace secundario discreto "¿Ya
tienes cuenta? Entra" que lleva a `'login'` para quien lo prefiera — nunca
al revés.

Paso `'datos'` — copy exacto pedido por el fundador:

> No necesitas crear una cuenta. Al completar tu reserva crearemos
> automáticamente tu acceso para que puedas gestionar tus próximas clases.

Campos: nombre, apellidos, email, teléfono. Sin contraseña — mismo criterio
que ya fijó la auditoría Momence para el paso `'registro'` actual (línea
1064-1069). CTA: "Continuar al pago →" si `requierePlan`, o "Reservar →" si
no.

Paso `'pago'`: reutiliza `CheckoutEmbebido` tal cual
(`components/checkout-widget/checkout-embebido.tsx`), con el plan resuelto
por el servidor para esa clase (§4.1) y el resumen pedido explícitamente por
el fundador (clase, fecha/hora, instructora, precio) pintado ENCIMA del
`PaymentElement` — no dentro del propio componente de Stripe. CTA del botón
de pago: **"Pagar y reservar →"**, nunca "Comprar" (spec punto 3) — cambio
de copy sobre `FormularioPago` dentro de `checkout-embebido.tsx` (hoy
genérico para cualquier plan, hay que parametrizarlo).

### 3.2 Modo B (`app/widget-bundle/main.tsx`) — recomendado como Fase 2, no en el primer PR

Modo B ya resuelve "elige clase antes que login" para reservas gratuitas
(§1.2). Añadir el mismo `'datos' → 'pago'` aquí es mecánicamente el mismo
cambio, pero el componente que hoy decide `requierePlan` para abrir
`ListaPlanes` es distinto (`hayPlanesActivos`, línea 134, gatea el botón
"Planes" genérico, no una clase concreta) y el flujo de `manejarReservar`
(línea 101) tendría que aprender a: detectar `requierePlan` para el slot
elegido, resolver el plan concreto que lo cubre (no "elige un plan de la
lista", sino "el plan ya resuelto para ESTA clase", igual que en Modo A),
y encadenar el pago antes de completar `onReservar`. Es alcance real, no
trivial, y Modo B tiene menos superficie de prueba manual que Modo A (vive
dentro de un Shadow DOM en la web de terceros). **Recomendación: cerrar
Modo A primero, verificarlo con un cobro real de prueba
(`docs/STRIPE-MODO-TEST.md`), y portar el mismo patrón a Modo B en un
segundo PR** una vez que el mecanismo de "reservar automáticamente al
resolver el pago" esté probado en el modo con más tráfico/visibilidad de
diagnóstico.

## 4. El endpoint y la entrega idempotente

### 4.1 `POST /api/public/checkout-embebido` — extensión, no endpoint nuevo

Se añade un campo opcional al body ya existente
(`app/api/public/checkout-embebido/route.ts:60-67`):

```ts
{ studioId, planId, socioId, socioEmail, socioNombre, origenLead,
  sesionId?: string }   // NUEVO — la clase que se quiere reservar al pagar
```

Cuando `sesionId` viene, el endpoint:

1. Resuelve `tipoClaseId`/`inicio` de esa sesión (igual que
   `crearReservaPublica` líneas 1427-1437: sesión cancelada/pasada → 409, no
   se crea intención de cobro por una clase que ya no se puede reservar).
2. Comprueba que `planId` la cubre (`tiposClaseIds` vacío o la incluye) —
   400 si no, para que el cliente nunca pueda pagar un plan que no sirve
   para la clase que cree estar reservando.
3. Añade `metadata.sesionId = body.sesionId` al `paymentIntents.create(...)`
   (línea 143-149) — **el único cambio en la creación del PaymentIntent**;
   el resto (importe del plan leído de servidor, `idempotencyKey`, `fee`,
   `payment_method_types: ['card']`) se queda exactamente igual.

No se valida aforo aquí — validarlo en el momento de crear el PaymentIntent
y volver a validarlo al confirmar el pago (con el candado real) es la
distancia mínima entre "avisar pronto si ya no hay sitio" (UX) y "la
decisión que cuenta" (servidor, con lock). Aviso temprano opcional de UX:
si `GET` de disponibilidad ya marca la sesión llena y sin lista de espera,
el paso `'pago'` ni se ofrece — pero eso es de lectura, no autoritativo.

### 4.2 Webhook — misma rama, un paso más

`app/api/stripe/webhook/route.ts:584-618` (rama
`pi.metadata?.origen === 'plan_web_embebido'`) gana, tras la llamada
existente a `entregarPlanComprado`, un bloque nuevo **solo si
`pi.metadata.sesionId` está presente**:

```ts
const entrega = await entregarPlanComprado(admin, { ...igual que hoy... });
if (entrega.ok && pi.metadata.sesionId) {
  const { reservarPlazaTrasPagoPublico } = await import('@/lib/db/supabase-data-admin');
  const r = await reservarPlazaTrasPagoPublico({
    studioId, sesionId: pi.metadata.sesionId, socioId: entrega.socioId,
    paymentIntentId: pi.id,   // ← clave de idempotencia de la RESERVA, no reutiliza sessionId/reciboId
  });
  // best-effort tal como guardarCaducidadTarjeta/emitirPagoRealizado ya lo son
  // en esta misma rama — un fallo aquí NO debe hacer que el webhook devuelva
  // 500 y Stripe reintente cobrar dos veces; el dinero y el plan ya se
  // entregaron. Se reporta a Sentry y queda para conciliación manual (mismo
  // criterio que el resto de esta rama).
}
```

`reservarPlazaTrasPagoPublico` (función NUEVA, mismo fichero que
`crearReservaPublica` porque comparte casi toda su lógica de ventanas/gate,
`lib/db/supabase-data-admin.ts`) es una variante de `crearReservaPublica`
con dos diferencias explícitas, **igual que el patrón ya usado en Fase 3 de
reglas de reserva** (`p_omitir_penalizacion`, memoria del repo: "un
parámetro explícito nuevo... puesto a `true` solo por el caller automático",
nunca una condición implícita adivinada):

1. Se salta el gate de `exigirPlanResuelto` (el pago que se acaba de
   confirmar YA es la prueba de derecho — repetir el chequeo de
   `tieneEntitlementActivo` sería correcto por construcción pero redundante
   y con una carrera de milisegundos rara si el `INSERT` de la suscripción
   de `entregarPlanComprado` y la lectura del gate no ven la misma
   transacción; se evita comprobando el resultado de la entrega, no
   releyendo el estado).
2. Sigue pasando por `ventanaMinimaMinutos`/`antelacionMaximaDias` y, sobre
   todo, por `admin.rpc('reservar_plaza', ...)` **sin cambios** — el
   candado de aforo (§1.6) no se toca ni se bypasea nunca. Si la clase se
   llenó entre que se creó el PaymentIntent y que el pago se confirmó (dos
   personas pagando la última plaza a la vez, edge case #10), la RPC decide
   `LISTA_ESPERA` o rechaza igual que hoy — **el pago ya se ha cobrado en
   ese caso**, así que el resultado que ve la clienta en la pantalla de
   éxito tiene que poder decir "confirmada" O "en lista de espera, tu pago
   cubre esa clase en cuanto se libere un hueco", nunca fingir que siempre
   hay confirmación directa (mismo principio que ya aplica
   `crearReservaPublica` para reservas sin pago). Si la RPC rechaza sin
   lista de espera posible, la reserva no se crea pero el pago SÍ quedó
   cobrado (plan entregado) — se avisa igual en la pantalla de éxito
   ("clase completa, tu bono queda disponible para otra sesión") y por
   email; **no se devuelve dinero automáticamente por esto** (mismo
   criterio que el resto de reembolsos del repo: manual desde el panel,
   ver memoria `reembolsos-desde-el-panel`).

Idempotencia de la reserva en sí: `p_reserva_id` derivado
determinísticamente de `pi.id` (mismo patrón `idsDe()` que
`entregar-plan-comprado.ts:76-84`, extendido con un cuarto id
`reservaId: 'res-web-' + base`). Un reintento del webhook llama otra vez a
`reservar_plaza` con el MISMO `p_reserva_id` → choca por PK → se lee como
"ya reservada" y se trata como éxito, no como error (mismo criterio que
`entregarPlanComprado` con `YA_EXISTIA`/`23505`).

### 4.3 Creación de la cuenta — disparada por el CLIENTE tras el éxito, no por el webhook

Esta es la pieza que cierra el círculo del pedido sin construir nada nuevo
en Supabase Auth (§1.4): en cuanto `CheckoutEmbebido.onExito()` se dispara
(el `confirmPayment` del cliente resuelve sin error — no hace falta esperar
al webhook, igual que hoy `ListaPlanes`/`onComprado` ya asume esto), la
pantalla de éxito llama:

```ts
await supabasePortal.auth.signInWithOtp({
  email: datosCliente.email,
  options: { emailRedirectTo: `${origin}/reservar/${slug}?sesion=cuenta`, captchaToken },
});
```

— el MISMO mecanismo que `enviarEnlace` (línea 90 de `use-socia-session.ts`)
usa hoy para login. Si el email ya es un usuario de Auth (clienta antigua
comprando otra vez sin haber hecho login en este dispositivo), Supabase
manda el mismo tipo de email sin duplicar cuenta — **cero riesgo de
enumeración nuevo** porque la respuesta de `signInWithOtp` no distingue
"existe"/"no existe" (comportamiento ya vigente hoy en el propio flujo de
login, no una propiedad nueva de este diseño) y la llamada ocurre siempre
DESPUÉS de que el pago ya se ha confirmado — nunca antes, nunca como
condición para poder pagar. Esto reconcilia el diseño con la regla ya
cerrada del repo sobre "cero consultas al servidor entre pasos que revelen
si una cuenta existe" (memoria `portal-puerta-unica-acceso`): esa regla es
sobre el LOGIN del panel de gestión, no sobre este flujo, pero el mismo
principio se respeta aquí por construcción, sin tener que reabrir nada.

Requiere captcha (Turnstile, `execution:'execute'`) — mismo componente que
ya usa el paso `'login'`, se reutiliza en la pantalla de éxito.

**Texto del email**: el que Supabase envía por defecto en el flujo de magic
link (plantilla ya configurada del proyecto, fuera del alcance de tocar
aquí — comparar con la nota sobre `supabase/templates/*.html` en memoria
`plantillas-correo-repo-vs-panel`, ese es el email de LOGIN genérico, no un
email de "reserva confirmada"). El email pedido por el fundando en el punto
6 ("Tu reserva está confirmada... hemos creado tu acceso...") es un email
DISTINTO — la confirmación de reserva de negocio, no el de Supabase Auth —
y ya existe una plantilla para eso: la que dispara `emitirReserva` en
`reservarPlazaTrasPagoPublico` (§4.2, reutilizada de
`crearReservaPublica`). Se le añade una variante de copy cuando la reserva
viene de un pago de guest recién creado (`fichaCreada` de
`entregarPlanComprado`, ya devuelto): un párrafo extra "Hemos creado tu
acceso a \[Estudio\] — revisa tu bandeja de entrada, te hemos mandado
también un enlace para entrar cuando quieras." No se crea plantilla nueva,
se añade una variante condicional a la existente (mismo criterio que
`CancelacionClaseEmail` con `bonoDevuelto`, memoria Fase 2c).

## 5. Pantalla de éxito

`'done'` (ya existe, línea 2376) gana, cuando la reserva viene de este
flujo nuevo (se sabe por el `Step` de origen, no hace falta un estado
nuevo):

- "¡Reserva confirmada!" (ya es el texto por defecto, línea 2357).
- Detalle de la clase (ya se pinta, `bookingSesion`).
- Línea nueva: "Hemos creado automáticamente tu cuenta con
  \[datosCliente.email\]".
- Dos CTA en vez del cierre actual: "Ver mi reserva →" (abre `MiCuenta`/el
  panel de "Mis reservas" del portal, mismo componente que ya usa Modo B —
  `components/cuenta-widget/mi-cuenta.tsx`) y "Gestionar mis reservas →"
  (mismo destino o al portal completo, `/portal/[slug]`, a decidir con
  `tentare-ux` en implementación — no hay hoy dos destinos distintos que
  representen esas dos frases, así que uno de los dos botones puede acabar
  siendo redundante y hay que resolverlo en diseño visual, no aquí).
- Mención expresa de que se envió email de confirmación — ya hay un patrón
  de este aviso en otras pantallas de éxito del repo, reutilizar el mismo
  copy/componente si existe (a verificar en implementación, `grep -rn
  "revisa tu email\|te hemos enviado"` sobre `app/reservar`).

Si la reserva quedó en `LISTA_ESPERA` (§4.2, caso "se llenó entre el intento
de pago y la confirmación"), el mismo paso `'done'` (o una variante,
`'espera'` ya existe en el step-machine actual) tiene que decirlo con
claridad — nunca "reserva confirmada" cuando no lo está.

## 6. Qué queda IGUAL

- `crearReservaPublica`, `registrarSociaPublica`, `entregarPlanComprado`,
  `reservar_plaza` (RPC): **sin tocar su firma ni su lógica interna** — se
  reutilizan tal cual, `reservarPlazaTrasPagoPublico` es código NUEVO que
  las orquesta, no las reemplaza.
- `POST /api/public/checkout-embebido`: se extiende (§4.1), no se duplica.
- El webhook `payment_intent.succeeded` / rama `plan_web_embebido`: se
  extiende (§4.2).
- `CheckoutEmbebido`/`FormularioPago`
  (`components/checkout-widget/checkout-embebido.tsx`): se reutiliza casi
  sin cambios — solo el copy del botón ("Pagar y reservar →" en vez de
  "Pagar" genérico) y el resumen de clase pintado antes del Payment Element.
- El paso `'login'` de Modo A y el flujo de acceso de Modo B
  (`FormularioAccesoWidget`): se conservan como puerta EXPLÍCITA para quien
  prefiere entrar antes de reservar — nunca se borran ni se ocultan, solo
  dejan de ser el paso por defecto.
- `signInWithOtp` (`use-socia-session.ts:90`): mismo mecanismo, se llama
  desde un sitio nuevo del flujo (§4.3).
- Modo B (`main.tsx`): sin cambios en este primer PR (§3.2, deferred).

## 7. Qué es genuinamente NUEVO

- Campo `sesionId` opcional en el body de `checkout-embebido` y su
  `metadata` correspondiente.
- `reservarPlazaTrasPagoPublico` en `lib/db/supabase-data-admin.ts`.
- Rama nueva (condicional a `metadata.sesionId`) dentro del bloque existente
  del webhook.
- Pasos `'datos'`/`'pago'` en el step-machine de `page.tsx`, y su UI.
- Variante de copy en el email de confirmación de reserva
  (`fichaCreada`/guest).
- `signInWithOtp` disparado en `onExito` de la pantalla de pago (nuevo
  SITIO de llamada, mecanismo existente).
- Campo `requierePlan` (o equivalente) expuesto por sesión en el payload
  público de disponibilidad, para que el cliente sepa qué paso pintar sin
  adivinar el gate (§2).
- Copy nuevo: "No necesitas crear una cuenta..." (paso `'datos'`), "Pagar y
  reservar →", "Hemos creado automáticamente tu cuenta con...".

## 8. Seguridad — checklist contra el punto 13 del pedido

- **Precio**: sigue viniendo SIEMPRE de `planes_tarifa.precio` leído en
  servidor (`checkout-embebido/route.ts:73-80`, sin tocar) — el `sesionId`
  nuevo NUNCA se usa para calcular importe, solo para saber qué reservar
  después. Un cliente que mande un `sesionId` de otro estudio se rechaza en
  el paso 2 de §4.1 (`tipo_clase_id` de esa sesión comparado contra
  `studioId` del body, igual criterio que el resto de `/api/public/*`).
- **Manipulación de `studioId`/sesión**: mismo patrón ya usado en
  `crearReservaPublica` — todo `.eq('studio_id', ...)` explícito, nunca
  confiar en que un id "parece" de ese estudio.
- **Idempotencia de pago**: `idempotencyKey` del PaymentIntent, sin cambios
  (§4.1) — el `sesionId` no entra en esa clave a propósito (dos personas
  comprando la MISMA clase a la vez con el mismo plan no deben compartir
  idempotencyKey, o una pagaría por la otra).
- **Idempotencia de reserva**: `p_reserva_id` derivado de `pi.id` (§4.2) +
  el candado real de `reservar_plaza` (`FOR UPDATE`) — cubre "doble click en
  Pagar y reservar" (el segundo click reutiliza el mismo `clientSecret`, no
  crea un PaymentIntent nuevo — comportamiento ya existente de
  `CheckoutEmbebido`, verificar que no se regenera el intent en cada
  render) y "dos reservas simultáneas por la última plaza" (candado de
  sesión, no de PaymentIntent).
- **Refresh tras el pago**: el estado de `'done'` no se recalcula desde cero
  al recargar — `bookingSesionId`/`loginStep` viven en estado de React sin
  persistencia; un refresh real pierde la pantalla de éxito (comportamiento
  YA existente para reservas normales, no empeora) pero NO puede crear una
  reserva nueva porque la creación vive en el webhook/servidor, disparada
  por el evento de Stripe, no por que el cliente vuelva a montar el
  componente. Confirmar en QA que no hay ningún `useEffect` que reintente
  `reservar_plaza` al remontar `CheckoutEmbebido` con el mismo
  `clientSecret`.
- **Pago fallido/abandono**: si `confirmPayment` falla o la clienta cierra
  la pestaña, no hay ningún estado `CONFIRMADA` que limpiar — nunca se
  reserva antes de que Stripe confirme el pago (a diferencia de un flujo
  "reserva primero, cobra después" que sí necesitaría lógica de reversión).
  El PaymentIntent huérfano (creado, nunca confirmado) no genera ningún
  efecto — Stripe lo cancela solo o expira sin acción de Tentare.
- **Rate limit**: bucket `checkout-embebido` ya existe
  (`app/api/public/checkout-embebido/route.ts:33-37`, `15/120s`) — se
  mantiene, sin bucket nuevo para el `sesionId` (no hay una llamada de
  servidor adicional que lo justifique).
- **RLS**: sin cambios de política — §1.5 confirma que este flujo no las
  necesita, todo corre con service-role y autorización en TS.

## 9. Ruta B, deferred explícitamente — cobro de `precio_puntual` sin plan de catálogo

Si en el futuro se pide de verdad "vender esta clase concreta a este precio
concreto, sin que sea un plan reutilizable", hace falta:

- Un endpoint nuevo (no una extensión de `checkout-embebido`, porque el
  origen del precio es distinto: `sesiones.precio_puntual` en vez de
  `planes_tarifa.precio`) — `metadata.origen: 'clase_web_embebido'`, rama
  nueva en el webhook (no reutiliza `entregarPlanComprado`, que asume
  siempre un `planId`).
- Una función `entregarReservaClaseSuelta` (nueva, en `lib/billing/`) que
  combine: resolver/crear socia (mismo patrón fantasma que
  `entregarPlanComprado`, líneas 141-155) + `reservar_plaza` con el mismo
  candado + un recibo `COBRADO` con `concepto: 'Clase suelta — <nombre>'` en
  vez de ligarlo a una suscripción (`suscripcion_id: null`).
- Decidir si `tipos_clase` necesita también un `precio_puntual` PROPIO
  (hoy solo existe a nivel de `sesiones`, por sesión individual — vender
  "esta clase de las 18:00 a 12€" es distinto de vender "todas las clases de
  Reformer sueltas a 12€", y hoy no hay ningún campo para lo segundo).

**No se construye en este PR.** Es trabajo real de diseño aparte (un
endpoint, una función de entrega, posiblemente una columna nueva), no una
extensión trivial de la Ruta A — mismo criterio que el propio repo ya aplica
a "Fase 3: dinero real" en otras iniciativas (necesita diseño propio con
`tentare-stripe`, memoria del proyecto).

## 10. Tests

### 10.1 Unitarios (`node --test`, `lib/**/*.test.ts`)

- `lib/db/supabase-data-admin.test.ts` (o fichero nuevo dedicado si el
  existente no cubre `crearReservaPublica` hoy — verificar primero):
  - `reservarPlazaTrasPagoPublico` con sesión disponible → `CONFIRMADA`,
    consume el candado de `reservar_plaza` (mock del RPC, verificar
    argumentos EXACTOS: `p_permite_lista_espera` resuelto igual que
    `crearReservaPublica`, sin gate de plan).
  - Sesión llena, con lista de espera permitida → `LISTA_ESPERA`, el pago
    igualmente se considera "entregado" (no se revierte nada).
  - Sesión llena, sin lista de espera → rechazo de la reserva, el plan
    sigue entregado (comprobar que la función NO deshace
    `entregarPlanComprado`).
  - Mismo `p_reserva_id` dos veces (simula reintento de webhook) →
    resultado idempotente, no dos filas en `reservas`.
  - Sesión cancelada/ya empezada entre el pago y el webhook → error
    controlado, sin excepción sin capturar.
- `lib/billing/entregar-plan-comprado.test.ts` (si existe; si no,
  confirmar con `find` antes de asumir el nombre): caso `sesionId` presente
  no rompe el camino existente sin `sesionId` (regresión).

### 10.2 E2E (Playwright, `page.route` mockeando Stripe/servidor — NUNCA una llamada real)

Nuevo fichero, ej. `e2e/reservar-pagar-sin-cuenta.spec.ts`, reutilizando el
andamiaje `e2e/socia-lista.ts` donde aplique (memoria del repo: "reutiliza
el andamiaje... en vez de rehacerlo"):

- **Clienta nueva, camino feliz**: elige clase que exige plan → paso
  `'datos'` → rellena nombre/apellidos/email/teléfono → paso `'pago'` →
  mock de `POST /api/public/checkout-embebido` con `clientSecret` falso +
  mock de la confirmación de Stripe.js (nunca real, ver
  `docs/checkout-embebido-diseno.md §9.1` sobre por qué no se puede probar
  el `PaymentElement` real en este entorno) → `onExito` dispara
  `signInWithOtp` (contador de llamadas > 0, mismo criterio que
  `expect(intentos).toBeGreaterThan(0)` de la regla de test de 4xx) → paso
  `'done'` con el copy de cuenta creada.
- **Clienta existente sin cuenta (ficha fantasma de una compra anterior)**:
  mismo flujo, pero el mock de `entregarPlanComprado`/la reserva refleja que
  el `socioId` se reutilizó (verificar que NO se manda un segundo alta).
  Este caso se verifica mejor en unitario (§10.1) que en e2e, porque el e2e
  no ve el webhook — el e2e solo puede comprobar que el CLIENTE no bloquea
  este camino con un "ya tienes cuenta, inicia sesión" en ningún punto
  (justo lo que NO debe pasar, spec punto 5).
- **Pago fallido**: mock de `confirmPayment` devolviendo error de tarjeta →
  se queda en `'pago'` con el error legible, NUNCA avanza a `'done'` — con
  contador de intentos de red (evitar el punto ciego ya documentado en
  `.claude/tentare-os.md`: "un test de camino de fallo SIN contador de
  peticiones es hueco").
- **Doble click en "Pagar y reservar"**: dos clicks sintéticos seguidos →
  solo una llamada de confirmación sale (verificar con el contador de
  intentos, no solo que la UI no se rompe).
- **Refresh tras el pago**: recargar la página tras `onExito` pero antes de
  que resuelva el mock del webhook → no debe haber ninguna llamada nueva de
  creación de reserva disparada por el remount.
- **Servidor dice no** (aforo lleno al momento de pagar, `AFORO_LLENO_SIN_ESPERA`
  simulado): mock de la creación de intención devolviendo 409 → error
  legible ANTES de llegar a Stripe, no se le pide pagar por algo que ya no
  existe.
- Extender `webkit-publico` (proyecto ya existente en
  `playwright.config.ts`) a este spec — es una pantalla pública sufrida por
  alguien externo (regla ya documentada en `.claude/tentare-os.md`).

**No hay forma, en este entorno, de probar un cobro real de PaymentIntent
end-to-end** (sin `STRIPE_SECRET_KEY`/`pk_test_` configuradas) — mismo
límite que ya reconoce `docs/checkout-embebido-diseno.md §9.1`. El primer
cobro real de este flujo concreto (con `sesionId`) debe probarse en un
estudio de pruebas con claves `sk_test_`/`pk_test_` propias
(`docs/STRIPE-MODO-TEST.md`) antes de ofrecerlo a un estudio real — no es
opcional, es la misma condición que ya aplica el repo a toda la Fase 3/F4 de
dinero (memoria `revision-pagos-clientas-2026-08`: "por Stripe NO ha pasado
ni un euro en prod").

## 11. Riesgos y qué NO se resuelve en esta fase

1. **Ruta B (cobro directo de `precio_puntual`) queda fuera** (§9) — si el
   fundador la necesita de verdad (no solo "un precio junto al nombre de la
   clase" sino "cobrar exactamente eso sin plan detrás"), es un diseño
   aparte.
2. **Modo B queda fuera de este primer PR** (§3.2) — mismo mecanismo,
   segundo PR, tras verificar Modo A con un cobro real.
3. **Los riesgos de Shadow DOM/CSP/3DS ya están evaluados y no se repiten
   aquí** (`docs/checkout-embebido-diseno.md §9`) — pero Modo A no vive en
   Shadow DOM (es una página normal, `app/reservar/[slug]/page.tsx`), así
   que ese riesgo concreto ni siquiera aplica al alcance de este PR; se cita
   solo porque el COMPONENTE `CheckoutEmbebido` se reutiliza tal cual y su
   documentación de riesgos sigue vigente para cuando se porte a Modo B.
4. **"Pagar y reservar" con lista de espera es una experiencia rara y sin
   precedente en este repo** (pagar y no tener plaza asegurada, solo un
   bono guardado): el copy exacto de esa pantalla necesita una pasada de
   `tentare-ux`/verificación visual real antes de lanzarse — no se cierra
   aquí el texto final, solo el comportamiento (§5, último párrafo).
5. **El "Ver mi reserva →" / "Gestionar mis reservas →" del punto 7 del
   pedido puede ser un único CTA en la práctica** — no hay hoy dos
   pantallas distintas del portal público que merezcan dos botones
   separados; se deja como decisión de implementación/UX, no de
   arquitectura.
6. **No se ha verificado en navegador real** (mismo tipo de limitación que
   el resto de fases de dinero de este repo, sin credenciales de Stripe de
   prueba en este entorno) — el spike de §9.1 de
   `docs/checkout-embebido-diseno.md` ya cubre el mecanismo de pago en sí;
   lo que NO está verificado aquí es el step-machine nuevo (`'datos'`/
   `'pago'`) dentro del propio `page.tsx`, que si tiene algún efecto de
   React mal encadenado con `bookingSesionId`/`loginStep` (el propio
   fichero tiene comentarios de al menos tres bugs históricos de este
   estilo, líneas 992-997 y 1142-1148) puede introducir una regresión en el
   camino EXISTENTE de login-primero si no se prueba con cuidado en
   implementación.
7. **El email de "cuenta creada" del punto 6 depende de una variante nueva
   de copy sobre una plantilla existente** (§4.3) — si en implementación se
   descubre que esa plantilla no admite bloques condicionales fácilmente,
   puede hacer falta una plantilla dedicada; no se asume una u otra en este
   diseño, solo que NO hace falta un evento de notificación nuevo (se
   reutiliza `emitirReserva`, mismo criterio que Fase 2a de reglas de
   reserva: "cero eventos nuevos salvo el mínimo imprescindible").

## 12. Criterio de aceptación (spec punto 15), mapeado a piezas concretas

Una persona nueva puede: abrir `/reservar/[slug]` → elegir clase (sin
cambios) → pulsar "Reservar clase →" (nuevo CTA, §3.1) → paso `'datos'`
(nuevo) → paso `'pago'` si la clase exige plan (`CheckoutEmbebido`
reutilizado, §3.1/§4.1) → `onExito` dispara `signInWithOtp` (§4.3) mientras
el webhook, en paralelo, entrega el plan + reserva la clase de forma
idempotente (§4.2) → pantalla `'done'` con el detalle y el aviso de cuenta
creada (§5) → email de confirmación con el acceso (§4.3) → puede volver más
tarde, pulsar el enlace del email, y `registrarSociaPublica`/`socioAutenticado`
la reconocen como la misma persona (mecanismo YA existente, §1.3-1.4) — todo
esto sin haber pasado nunca por el paso `'login'`.
