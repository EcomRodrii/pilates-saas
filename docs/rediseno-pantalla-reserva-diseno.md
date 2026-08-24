# Rediseño de la reserva: de modal a pantalla propia — Fase 1 (auditoría + arquitectura)

> Pedido del fundador: dejar de usar el modal/popup como experiencia PRINCIPAL de
> "Reservar clase" y convertirlo en una pantalla/panel de reserva propio de
> Tentare — inspirado en el patrón de Momence (`momence.com/[estudio]/[clase]/[id]`,
> probado en vivo contra `secretstudiofit.com/reserva`), pero construido con la
> arquitectura, componentes y lógica ya existentes de Tentare. Este documento es
> la Fase 1 de 5: auditoría de lo que existe + diseño de la arquitectura nueva.
> **No se ha tocado ni una línea de código de producto en esta fase.**

Relacionado: `docs/booking-engine-architecture.md` (Fase 0 de un plan más amplio,
14-ago — su §3.4 está desactualizado: decía "no hay checkout embebido" y desde
entonces sí lo hay, ver más abajo), `docs/checkout-embebido-diseno.md`,
`docs/reserva-sin-login-diseno.md`.

---

## 0. Referencia — qué hace Momence y qué adoptamos

Probado en vivo (`secretstudiofit.com/reserva` → "Reservar ahora" en una clase real):

- Al pulsar "Reservar", Momence **no abre un modal — navega a una URL propia**
  (`momence.com/[estudio]/[clase]/[id]`), página completa, no un overlay.
- **Un único scroll continuo**, sin pasos separados: datos de contacto, nº de
  plazas, resumen de precio (base + IVA + total, siempre visible), código
  promocional (colapsado, un clic lo expande justo encima del pago) y el campo
  de tarjeta, todo en la misma pantalla.
- **Dos columnas en escritorio** (clase a la izquierda, formulario a la derecha)
  → **una columna en móvil**, sin recortes.
- Login **opcional y no bloqueante** ("¿Tienes un paquete? Inicia sesión aquí"),
  y un bloque de planes/bonos disponibles justo encima del formulario (upsell
  en el mismo sitio donde ibas a pagar una suelta).
- Precio siempre desglosado antes de pedir la tarjeta.

**Qué adoptamos**: clase → **ruta propia** (no modal) → un solo scroll con
resumen + datos + bonos + código promo + pago → confirmación, con la identidad
de Tentare (oliva/arena, serif de titulares).

**Qué mejoramos sobre Momence**: Tentare ya tiene resuelto con más cuidado el
flujo "pagar y reservar sin login previo" (crea la cuenta sola tras el pago,
sin pedir contraseña — Momence solo ofrece login visible, no ese camino
silencioso). Y podemos mantener el pago **embebido de verdad, sin salir del
dominio del estudio** — Momence salta a `momence.com`; Tentare ya tiene
`PaymentElement` embebido y puede quedarse dentro de la propia página/widget.

---

## 1. Qué existe hoy (auditado, archivo:línea)

### 1.1 Puntos de entrada a "Reservar clase" — hay DOS modales, no uno

- `SlotRow`/`TarjetaClase` (`components/reserva/reserva-calendario.tsx:606,624,645`)
  → `abrirSlot(slot)` (`:394`) → monta **`BookingSheet`** (`:1088`), modal propio,
  JSX inline, **sin `PublicSheet`**.
- Dentro de `BookingSheet`, confirmar → `onReservar()` (`:1261,1335`) → prop del
  padre → en `page.tsx:1913` es `handleReservarCalendario` (`page.tsx:1328`).
- `handleReservarCalendario` bifurca: si la socia YA está autenticada + con
  ficha + contrato aceptado + gate de riesgo OK → reserva **directo** vía
  `addReserva()`, sin abrir ningún modal de pasos. Si no → `openBooking(slot.id)`
  (`page.tsx:1025`), que monta el modal grande **`PublicSheet`** con el estado
  `loginStep`.
- Tercer entrypoint: ficha de detalle de clase (`page.tsx:1838`). Cuarto: botón
  "Acceder" de cabecera, `openBooking('')`. Quinto (fuera de alcance de
  "clases"): citas 1:1, `page.tsx:1978`.

**Implicación para el rediseño**: el "camino rápido" (socia ya lista, reserva
en un clic sin ningún paso extra) y el "camino largo" (login→datos→pago→...)
son dos experiencias distintas hoy. La pantalla nueva tiene que decidir
explícitamente si el camino rápido sigue siendo una confirmación ligera (no
tiene sentido mandar a una socia que ya tiene todo listo a una pantalla nueva
completa) o si también pasa a vivir en la ruta nueva.

### 1.2 Máquina de estados actual — `loginStep`, un único `useState`

10 valores: `'login' | 'datos' | 'pago' | 'registro' | 'contrato' | 'confirm' |
'espera' | 'pendiente' | 'done'`. Vive en `page.tsx`, sin ningún cambio de URL
asociado — confirmado por grep: `useRouter`/`useSearchParams` se usan
(`page.tsx:7,333-334`) solo para leer query params al montar y UNA llamada a
`router.replace()` (`page.tsx:682`) que limpia params, nunca navega a una URL
nueva. **No existe hoy ningún patrón de ruta dedicada** tipo
`/reservar/[slug]/clase/[id]` — todo el flujo es estado de React dentro de un
componente de ~3100 líneas.

Cada paso mantiene su propio par `useState` de loading/error (~15 pares
independientes: `datosCargando`/`datosError`, `stripeLoading`/`stripeError`,
`confirmando`/`confirmandoRef`, etc.) — sin ningún hook/reducer compartido.

### 1.3 Disponibilidad, aforo, lista de espera, selector de sitio

- Decisión autoritativa: RPC `reservar_plaza` (`FOR UPDATE`, bloqueo de fila),
  llamada desde `crearReservaPublica` (`lib/db/supabase-data-admin.ts:1611`).
- `SpotPicker` (`components/reserva/spot-picker.tsx`) **ya está extraído como
  componente aislado**, 100% prop-driven — su propio comentario de cabecera ya
  dice que está pensado para reutilizarse fuera de la hoja actual.
- Lista de espera: motor completo ya en producción (FIFO, promoción automática,
  plazo configurable de aceptación vía cron pg_cron cada 5 min) — no hay que
  construir nada aquí, solo decidir cómo se ve en la pantalla nueva.

### 1.4 Bonos/créditos vs pago vs gratis

- `lib/bono-logic.ts` (`tieneEntitlementActivo`, `bonoConsumible`,
  `hayAlgoQueContratar`) — puro, testeado, fuente única de "¿puede reservar sin
  pagar, y con qué bono?".
- El gate real está en el servidor (`crearReservaPublica`,
  `lib/db/supabase-data-admin.ts:1548-1583`), nunca en el cliente.
- El bono se consume DESPUÉS de que la RPC confirme `CONFIRMADA`
  (`lib/studio-context.tsx:2818`), nunca antes — cero escritura optimista.

### 1.5 Pagos — dos mecanismos coexistiendo (esto es lo que MÁS cambió desde
`docs/booking-engine-architecture.md`, cuya §3.4 hay que dar por desactualizada)

**A) Stripe Checkout hospedado** (`handleContratarPlan`, `page.tsx:1349-1400`):
`POST /api/stripe/checkout` → `session.url` → `(window.top ?? window).location.href`
(escapa del iframe a propósito). Usado para contratar un plan suelto, sin
reservar una clase en el mismo paso.

**B) Checkout embebido con Stripe Elements** (`components/checkout-widget/checkout-embebido.tsx`,
ya construido y en producción — PR reciente, contradice el "no existe" de la
auditoría de 14-ago): `<Elements>` + `<PaymentElement>`, `redirect: 'if_required'`
(solo navega si hace falta 3DS). Flujo completo: `openBooking` detecta clase
que exige plan + plan PUNTUAL disponible + sin login → salta directo a
`loginStep='datos'` → `handleDatosContinuar` → `POST /api/public/checkout-embebido`
→ `clientSecret` → `loginStep='pago'` → `<CheckoutEmbebido>`. La reserva **no
se crea en el cliente** tras el pago — la crea el webhook de Stripe
(`app/api/stripe/webhook/route.ts:812-834` → `reservarPlazaTrasPagoPublico`),
idempotente por `PaymentIntent`.

**Códigos de descuento — SÍ EXISTEN ya** (el pedido original asumía que no; lo
confirmé con grep, hay que corregir esa suposición): campo plegado en
`page.tsx:2336-2358`, resolución server-side en `resolverDescuentoCheckout`
(usada tanto en `/api/public/checkout-embebido` como en `/api/stripe/checkout`),
consumo atómico vía RPC `consumir_codigo_descuento` en el webhook.

### 1.6 Autenticación e invitada

- `use-socia-session.ts` + `supabasePortal` (cliente Supabase dedicado,
  `storageKey: 'sb-portal-auth'`, distinto del de staff).
- Invitada sin login previo: tras pagar, `handlePagoExitoso` (`page.tsx:1216-1222`)
  llama al MISMO mecanismo passwordless (`enviarEnlace`) que el login normal —
  no hay endpoint de "alta" separado, y la respuesta es indistinguible entre
  "cuenta nueva" y "cuenta que ya existía" (decisión de diseño documentada en
  `docs/reserva-sin-login-diseno.md §4.3`).

### 1.7 Animaciones, portales, responsive

- CSS puro en `app/globals.css:432-435` (`@keyframes sheet-backdrop-in`/`sheet-pop-in`),
  usado por `PublicSheet`. `BookingSheet` es JSX propio, con su propia
  animación (`reserva-calendario.tsx:461`).
- **Ningún modal público usa `createPortal`** — `PublicSheet` y `BookingSheet`
  son `position: fixed` inline en el árbol normal. `components/ui/dashboard-sheet.tsx`
  (panel staff) sí usa portal — es deliberado que el público NO lo haga: dentro
  de un iframe (Modo A) o Shadow DOM (Modo B), un portal a `document.body` del
  documento PADRE rompería el aislamiento. Cualquier pantalla nueva debe
  respetar esta misma restricción.
- `dvh` sí se usa (`page.tsx:1409,1532`); no encontré `svh` ni
  `env(safe-area-inset-*)` en los ficheros auditados — falta confirmarlo con un
  grep más amplio en Fase 4, no asumir que no existe en ningún sitio del repo.
- El gotcha de breakpoints ya documentado en sesiones anteriores (dentro del
  iframe, `sm:`/`md:` de Tailwind miden el ancho del IFRAME, no el viewport
  real) es la razón de que el widget tenga su propio sistema de tokens
  responsive (`cq(...)`, `lib/reservar-publico-tokens.ts`) en vez de
  breakpoints Tailwind — cualquier pieza nueva de la pantalla de reserva sigue
  ese mismo patrón, no Tailwind `sm:`/`md:` directo.

### 1.8 Los dos modos de embebido — restricción dura para el diseño de rutas

- **Modo A**: iframe a `/reservar/[slug]?embed=1` — sigue siendo una página de
  Next real, con Next Router disponible DENTRO del iframe.
- **Modo B**: bundle standalone (`app/widget-bundle/main.tsx` → esbuild →
  `public/widget.js`), Shadow DOM en la web de un tercero, **sin Next Router,
  sin Server Components, sin App Router** — es un runtime de React puro montado
  a mano, nunca pasa por `next build`.

---

## 2. Qué es reutilizable tal cual (capa de negocio — no se toca)

- `lib/booking-logic.ts`, `lib/bono-logic.ts`, `lib/ocupacion.ts` — puros,
  testeados.
- RPC de Postgres (`reservar_plaza`, `cancelar_reserva_plaza`,
  `aceptar_oferta_lista_espera`, `resolver_reserva_pendiente`) — agnósticas del
  transporte, no dependen de cómo se pinte la pantalla.
- `crearReservaPublica`/`cancelarReservaPublica`/`reservarPlazaTrasPagoPublico`
  (`lib/db/supabase-data-admin.ts`).
- `components/reserva/spot-picker.tsx` — ya aislado, se monta tal cual en la
  pantalla nueva.
- `components/checkout-widget/checkout-embebido.tsx` — el `PaymentElement`
  embebido ya funciona; la Fase 2/3 de este rediseño lo reutiliza, no lo
  reconstruye.
- `resolverDescuentoCheckout` + la RPC `consumir_codigo_descuento` — el código
  promocional pedido en la Fase 2 del encargo YA EXISTE server-side; falta
  decidir su sitio en la nueva jerarquía visual, no construir la lógica.
- El motor de notificaciones/webhook de Stripe, idempotencia
  (`lib/billing/webhook-tenant.ts`, `lib/billing/modo-stripe.ts`).
- `lib/reservar-publico-tokens.ts` (sistema `cq(...)`) — el patrón responsive
  correcto para el widget, se extiende, no se sustituye por Tailwind.

## 3. Qué debe sustituirse (capa de presentación)

- El estado `loginStep` (10 valores en un único `useState`, sin URL) — pasa a
  ser pasos reales con su propia identidad (ruta o segmento), no un switch
  gigante dentro de un componente de 3100 líneas.
- `BookingSheet` y `PublicSheet`/`loginStep` como DOS mecanismos distintos de
  "abrir algo de reservar" con lógica de decisión duplicada (`abrirSlot` vs
  `openBooking`) — la pantalla nueva colapsa esto en un único punto de entrada.
- Los ~15 pares de `useState` de loading/error repetidos por paso.

---

## 4. Arquitectura de rutas propuesta

**Restricción dura, hay que decirlo con toda claridad**: una "ruta propia con
URL real" solo es literalmente posible en **Modo A** (iframe, sigue siendo
Next) y en la **página suelta** (`/reservar/[slug]` visitada directamente,
fuera de cualquier embebido). **Modo B no tiene Router de Next — nunca podrá
tener una URL propia real**, porque no es una app de Next en tiempo de
ejecución, es un bundle de React puro inyectado en el DOM de un tercero. Para
Modo B, "pantalla propia" solo puede significar: una vista que ocupa el
espacio completo del widget con la misma jerarquía visual y sin verse como un
modal flotante — pero **sin cambio de URL real**, porque no existe URL que
cambiar.

### 4.1 Modo A / página suelta — ruta real con Intercepting + Parallel Routes

Confirmado en `node_modules/next/dist/docs/.../intercepting-routes.md`: esta
versión de Next.js SÍ soporta Intercepting Routes + Parallel Routes, y la
propia documentación cita como ejemplo literal *"opening a shopping cart in a
side modal"* — exactamente nuestro caso.

Propuesta:
```
app/reservar/[slug]/
  page.tsx                          (como hoy — calendario/listado)
  @modal/
    (.)clase/[sesionId]/page.tsx    (navegación SPA interna → overlay sobre el calendario)
    default.tsx                     (nada, cuando no hay overlay activo)
  clase/[sesionId]/
    page.tsx                        (visita directa/refresh → pantalla COMPLETA, sin overlay)
```

- Clic en "Reservar" dentro de `/reservar/[slug]` → navegación soft de Next →
  Next intercepta y muestra `clase/[sesionId]` como overlay sobre el calendario
  (URL cambia a `/reservar/[slug]/clase/[sesionId]`, compartible).
- Visita directa a esa URL, o refresh, o "compartir enlace de esta clase" →
  Next renderiza la MISMA página pero como pantalla completa, sin overlay —
  gratis, es el comportamiento nativo de Intercepting Routes.
- Botón atrás del navegador cierra el overlay y vuelve al calendario (nativo,
  sin código de más) — soluciona de raíz el "modal en estados intermedios" que
  reportaba el fundador, porque ahora hay una URL real que el navegador sabe
  gestionar.
- Los pasos dentro de la reserva (datos/pago/confirmación) van como **query
  params o segmentos hijos** de esa misma ruta, a decidir en Fase 2 — pero cada
  uno con su propio `loading.tsx`/`error.tsx` de Next en vez de un par de
  `useState` a mano.

**Camino rápido (socia ya lista, hoy resuelve en un clic sin modal)**: se
mantiene como confirmación ligera, NO se manda a la pantalla completa — sería
peor UX obligar a una socia que ya tiene todo listo a atravesar una pantalla
nueva para lo que hoy es un clic. Se valida esta decisión explícitamente en
Fase 2, no se decide unilateralmente aquí.

### 4.2 Modo B — pantalla completa sin URL, dentro del mismo Shadow Root

Sin Router, la "pantalla propia" se construye como una vista que reemplaza
visualmente al calendario dentro del MISMO contenedor del widget (mismo patrón
que ya usa `BookingSheet` hoy, pero ocupando el 100% del espacio del widget en
vez de flotar como modal con backdrop) — un `estadoWidget: 'calendario' |
'reserva'` en el componente raíz de `main.tsx`, sin backdrop ni z-index de
overlay, sin cambio de URL. Se mantiene la restricción ya documentada:
ningún `createPortal` a `document.body` del documento padre.

---

## 5. Estados del flujo — propuesta

Sustituye el `loginStep` de 10 valores por una secuencia con nombre, cada uno
responsable de su propio loading/error (vía Next `loading.tsx`/`error.tsx` en
Modo A, o un estado local acotado por paso en Modo B):

```
resumen        → ver la clase, decidir plazas/sitio
datos          → contacto (o se salta entero si ya autenticada — Fase 2 decide)
bono-o-pago    → elegir bono existente, o tarjeta + código promocional
confirmando    → esperando respuesta del servidor/webhook (nunca UI congelada)
exito          → reserva confirmada, acciones siguientes
error          → mensaje humano, nunca el error técnico crudo
```

Los estados especiales de hoy (`espera`, `pendiente`, `registro`, `contrato`)
se mapean como variantes de `bono-o-pago`/`confirmando`/`exito` según el
resultado real del servidor — no como pasos nuevos en la navegación.

---

## 6. Mobile — cómo va a funcionar

- Mobile-first de verdad: la pantalla nueva se diseña primero para 375px, y
  escritorio es la capa añadida (dos columnas), no al revés.
- `dvh` para altura de pantalla (ya en uso, se mantiene); revisar en Fase 4 si
  `svh`/`env(safe-area-inset-bottom)` hacen falta donde no se usan hoy.
- El sistema `cq(...)` de tokens propio del widget (no Tailwind `sm:`/`md:`),
  por el gotcha ya documentado del ancho del iframe.
- En Modo A, la ruta nueva (`clase/[sesionId]`) al ser una página real de Next
  tiene scroll natural del navegador — elimina de raíz la clase de bug
  "viewport de iframe vs viewport real" que afecta a los modales de hoy.
- En Modo B, la vista de pantalla completa hereda el mismo contenedor
  `position: fixed`/Shadow Root que ya gestiona bien el viewport del host hoy
  (ver `franjaVisible`/`tentareHostViewport`, ya construido para Modo A y
  parcialmente aplicable).

---

## 7. Preguntas abiertas para validar antes de Fase 2

1. **¿El "camino rápido" (socia ya lista) sigue siendo una confirmación ligera,
   o también pasa a la pantalla nueva?** Recomendación: se queda ligero — no
   forzar una pantalla completa para lo que hoy es un clic.
2. **¿Los pasos dentro de la reserva (datos/pago) son URLs propias
   (`/clase/[id]/pago`) o un único componente con estado interno sobre la
   misma URL de `/clase/[id]`?** Recomendación: un único componente con
   estado interno — cambiar de URL en cada micro-paso es más frágil (back
   button saliendo a medio pago) y Momence tampoco lo hace (todo en un scroll).
3. **¿Se atacan primero Modo A + página suelta (donde SÍ hay URL real) y Modo B
   se queda con el modal actual una fase más?** Recomendación: sí — Modo B no
   tiene el mismo problema de "estados intermedios rotos" reportado (no vive
   dentro de un iframe con su propio viewport), así que no es la prioridad del
   pedido original.

---

**Fase 1 completa. Sin cambios de código de producto en este documento.**
