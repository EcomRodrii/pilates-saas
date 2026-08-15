# Booking Experience Engine — Auditoría de arquitectura (Fase 0)

> Estado del repo auditado: `origin/main` @ `68bca886` (14 ago 2026, tras PR #1090
> "Growth Widget Modo B" y PR #1096 "Zapier"). Este documento es una **fotografía**,
> no una fuente viva — si el código cambia, este documento no se actualiza solo.

## Cómo leer esto

Es la Fase 0 del plan "Tentare — Booking Experience Engine": transformar el widget
embebible actual (un calendario) en un sistema completo de descubrimiento, login,
compra y gestión de reserva, sin salir de la web del estudio. Antes de tocar código
nuevo, esta auditoría responde a una pregunta por dominio: **¿qué existe ya, y es
reutilizable tal cual, con fricción, o no aplica?**

Metodología: 7 agentes de exploración en paralelo, uno por dominio (auth, reservas,
bonos/planes, Stripe, Theme Builder, CORS/RLS/rendimiento, tests/analytics/estado),
sobre el código real de `main`. Cada hallazgo cita fichero y línea. Donde un agente
señaló incertidumbre (trabajó parcialmente desde una rama desactualizada), se
verificó el dato contra `origin/main` antes de incluirlo aquí.

---

## 1. Arquitectura actual

```text
                    TENTARE (Next.js monolito, role-gateado)
                              │
      ┌───────────────────────┼───────────────────────┐
      │                       │                        │
  Panel staff          Portal instalable         Widget público
 app/(dashboard)/       app/portal/[slug]      app/reservar/[slug]
      │                       │                        │
      │              StudioProvider (god context,      │
      │               lib/studio-context.tsx)           │
      │                       │                        │
      └───────────┬───────────┘              ┌─────────┴─────────┐
                   │                          │                   │
             lib/supabase-data.ts      Modo A: iframe       Modo B: script
             (RLS, sesión staff)      (mismo /reservar,     embebido sin iframe
                   │                    ?embed=1)          (app/widget-bundle/,
                   │                          │              esbuild → widget.js,
                   ↓                          ↓              Shadow DOM, PR #1090)
            Supabase (Postgres)      /api/public/* (6 de 22 con CORS)
         RLS por rol + studio_id      service-role, sin RLS,
                                       autorización a mano por ruta
```

**El widget de hoy (Modo A + Modo B) es una vista distinta de la MISMA página
`/reservar/[slug]`**, no una app paralela. Modo B añade un segundo runtime
(esbuild, sin Next) que monta el mismo componente `<ReservaCalendario>` en un
Shadow Root, con su propio hook de datos (`lib/widget/`) que evita `StudioProvider`
por completo — porque `useStudio()` arrastra ~15 dominios de negocio y un import de
`next/navigation` que rompe un bundle pensado para correr en el DOM de un tercero.

### Las tres capas de autorización pública

1. **`/api/public/*`** (22 rutas) — service-role, RLS bypasseada por diseño;
   cada ruta re-implementa a mano su propia autorización (JWT verificado,
   filtro por `studio_id`). Solo 6 tienen CORS (§6).
2. **RLS** — protege exclusivamente al panel (`authenticated` = sesión de staff).
   Una visitante/socia del widget **nunca** tiene una sesión con RLS aplicable
   directamente sobre `socios`/`reservas`/`suscripciones`/`recibos`.
3. **RPC de Postgres con lock** (`reservar_plaza`, `cancelar_reserva_plaza`,
   `aceptar/expirar_oferta_lista_espera`, `resolver_reserva_pendiente`) —
   viven en la base de datos, agnósticas de quién las llama. Son la pieza más
   reutilizable de todo el sistema.

---

## 2. Arquitectura objetivo

```text
                         TENTARE CORE
                    (dominios de negocio en lib/*
                     y las RPC de Postgres — sin duplicar)
                              │
             ┌────────────────┼─────────────────┐
             │                │                 │
             ↓                ↓                 ↓
       Portal web       Booking Engine       App futura
      (sin cambios)          │             (no en alcance)
                    ┌─────────┴──────────┐
                    │                    │
              Embedded Widget       Public API (Fase 9,
              (Modo A + B)           no empezada)
                    │
             ┌──────┼──────┐
             ↓      ↓      ↓
        Core Booking  Auth   Commerce/Checkout
        (§4 Fase 1)  (§4 F2)      (§4 F3)
```

La diferencia con hoy no es "construir una segunda app" — es que el widget deja
de ser una vista fina sobre `/reservar/[slug]` y pasa a tener sus **propios**
módulos ligeros (`lib/widget/*`) que llaman a la MISMA capa `lib/*`/RPC que ya
usa el panel y el portal, nunca reimplementándola. El límite entre "reutilizar"
y "construir de cero" está trazado dominio a dominio en la §3.

---

## 3. Componentes reutilizables por dominio

### 3.1 Autenticación

**Reutilizable tal cual:**
- `verificarUsuarioSupabase()` (`lib/auth-server.ts`) y `socioAutenticado()`/
  `resolverSociaAutenticada()` (`lib/db/supabase-data-admin.ts:2256-2294`) —
  lógica server-side agnóstica del transporte, ya usada por `/api/public/session`.
- El patrón `supabasePortal` (cliente Supabase dedicado, `storageKey: 'sb-portal-auth'`
  propio para no pisar la sesión de staff, `lib/db/supabase-portal.ts:8-15`).
- `POST /api/public/session` como endpoint de bootstrap, ya CORS-aware.

**Con fricción real — no trivial:**
- **Third-party storage partitioning.** `lib/use-socia-session.ts:93-98` ya
  documenta que el viaje de sesión entre pestañas es frágil dentro de un
  `<iframe>` embebido (Safari ITP, Chrome recortando cada vez más el acceso a
  storage de terceros). Un login **nuevo** dentro del widget (no solo
  "recordar sesión existente") choca de lleno con esto.
- **`detectSessionInUrl`** — el retorno de un magic link depende de rutas
  top-level (`/login`, `/clave-nueva`, `/reservar/[slug]`); un widget en
  Shadow DOM sin navegación de página completa no puede capturar el
  fragmento de URL del email de vuelta sin trabajo adicional.
- **Turnstile a nivel de proyecto Supabase** (no por endpoint) — montar el
  script de Cloudflare y coordinarlo dentro del Shadow DOM del sitio del
  estudio no es trivial de aislar.
- **Google OAuth es staff-only y ni siquiera está en `main`** (vive en una
  rama sin mergear, solo para propietaria/instructoras vía
  `lib/auth-context.tsx`). Extenderlo a socias del widget es trabajo nuevo.
- **RLS no cubre a la socia directamente** — cualquier escritura nueva del
  widget (login, registro, checkout) debe pasar por una ruta `service_role`
  nueva con autorización escrita a mano, sin red de seguridad de RLS debajo
  (mismo patrón de riesgo que ya causó dos incidentes corregidos en el panel,
  ver §5).
- **Deduplicación de identidad**: hay unicidad `(studio_id, email)` en
  `socios` y claim automático por email verificado al iniciar sesión
  (`resolverSociaAutenticada`), pero **no existe** ninguna deduplicación
  cross-tenant ni entre cuenta de staff y cuenta de socia — comparten el
  mismo `auth.users` de Supabase sin tratamiento especial.

### 3.2 Reservas, aforo y lista de espera

**Reutilizable tal cual:**
- `lib/booking-logic.ts` completo — funciones puras sin I/O (`heredaOverride`,
  `esCancelacionTardia`, `puedeReservarPor*`, `debeCancelarPorMinimoNoAlcanzado`,
  `siguienteEnEspera`). Candidato directo a paquete compartido.
- `lib/ocupacion.ts` completo (`ratioOcupacion`, `colorOcupacion`).
- Las RPC de Postgres (`reservar_plaza`, `cancelar_reserva_plaza`,
  `aceptar_oferta_lista_espera`, `expirar_oferta_lista_espera`,
  `resolver_reserva_pendiente`) — agnósticas del frontend.
- `crearReservaPublica`/`cancelarReservaPublica`/`fetchAforoPublico` y sus
  rutas `/api/public/*` — ya diseñadas como API pública.

**Hallazgo importante: la lista de espera YA EXISTE, completa.** No es una
feature a construir en Fase 5 — es un motor multi-fase ya en producción:
entrada FIFO con `reservar_plaza`, promoción automática vía
`promocionar_siguiente_espera`, plazo configurable de aceptación
(`studios.lista_espera_plazo_aceptacion_minutos`, con override por tipo de
clase) resuelto por un cron cada 5 min migrado a **pg_cron + pg_net**
(no Inngest). Lo que falta para el widget no es el motor — es exponer
**aceptar una oferta de lista de espera** en `/api/public/*`: hoy solo vive
en `app/api/reservas/aceptar-oferta-espera/route.ts`, gateado a sesión de
panel/portal, no accesible desde fuera con CORS.

**Acoplado hoy al panel/portal (no en `/api/public/*`):**
- Aceptar oferta de lista de espera (arriba).
- Resolución de aprobación manual de reserva (`resolver-pendiente`) — correcto
  que sea solo-staff, no es una carencia.
- `SpotPicker`/`SpotPickerPublico` — componentes React embebidos directamente
  en `page.tsx`/`reserva-calendario.tsx`, sin extracción como pieza de
  librería aislada (fricción menor, refactor mecánico).
- Todo el ciclo de penalizaciones (cobro por no-show) — correctamente
  server-only, sin superficie pública, y **nunca probado con un cobro real**
  (ver §3.4).

### 3.3 Bonos, planes y "commerce"

**El modelo real es más simple de lo que sugería el brief original**: no hay
un concepto genérico de "producto" activo (el módulo `productos_pos` existe
en código pero está **congelado**, `lib/frozen-features.ts`). Todo lo que un
checkout necesita modelar es `PlanTarifa` con `tipo ∈ {MENSUAL, BONO, PUNTUAL}`.

**Reutilizable tal cual:**
- `lib/bono-logic.ts` — `tieneEntitlementActivo`, `bonoConsumible`,
  `hayAlgoQueContratar`, `seArreglaComprando`: pura, testeada, es la fuente
  única de "¿puede reservar sin pagar, y con qué bono concreto?".
- `POST /api/stripe/checkout` — **ya es semipúblico y apto**: valida importe
  y concepto en servidor (nunca del body), soporta guest checkout
  (compra de plan sin ficha previa) vía `studios.compra_publica_modo`.
- Suscripciones múltiples simultáneas por socia (un MENSUAL + un BONO a la
  vez) ya funcionan — resuelto por `planCubreTipoClase`/`bonoConsumible`
  eligiendo, entre los candidatos que cubren la clase, el que caduca antes.

**Falta construir:**
- Un endpoint público de **catálogo de planes** — hoy los `planesTarifa`
  llegan mezclados dentro de `/api/public/studio-data`; un checkout que
  quiera listar "¿qué le puedo vender a esta visitante?" de forma aislada
  necesita confirmar si ese payload ya basta o hace falta uno dedicado.
- No hay cobro directo "pago por clase suelta" — el precio `PUNTUAL` es solo
  informativo hasta que se compra como plan (mismo checkout que un bono).

### 3.4 Stripe y pagos — el hallazgo más importante de esta auditoría

**Hoy NO hay checkout embebible — es Stripe Checkout hospedado, con redirect
de página completa a `checkout.stripe.com`.** Verificado por grep exhaustivo:
cero uso de `elements.create('payment')`, `PaymentElement` o
`confirmPayment` en todo el repo. El único mecanismo es
`stripe.checkout.sessions.create()` → `session.url` → navegación completa.

Esto es la pieza que **más cambia** de arquitectura de todo el plan, y merece
tratarse como su propio proyecto, no como una tarea dentro de "Fase 3":

- El código actual (`app/reservar/[slug]/page.tsx:1088`) usa
  `(window.top ?? window).location.href = data.url` explícitamente para
  **escapar del iframe** del Modo A. En Shadow DOM (Modo B) `window.top`
  **ya es** la ventana de nivel superior — el truco no aplica, pero el
  problema de fondo persiste de otra forma: cualquier redirect de
  `window.location` saca a la clienta de la web del estudio entera, no de un
  iframe hijo.
- Para un checkout verdaderamente in-widget hace falta sustituir
  `checkout.sessions.create` por `paymentIntents.create` + Stripe Elements
  (Payment Element) montado dentro del Shadow Root. Es técnicamente viable
  (Stripe.js soporta shadow roots), pero:
  - El guardado de tarjeta ocurre hoy **en el webhook**, leyendo el
    PaymentIntent de la Checkout Session — cambia qué IDs/metadata viajan.
  - `entregarPlanComprado` (`lib/billing/entregar-plan-comprado.ts:76-84`)
    deriva sus ids de idempotencia de `session.id` — con PaymentIntent habría
    que derivarlos de `paymentIntent.id`.
  - 3DS off-session hoy falla explícitamente pidiendo que la clienta pague
    "desde un enlace de cobro normal" — con Payment Element in-widget se
    resuelve con el modal nativo de Stripe, pero exige testing específico en
    Shadow DOM (z-index, focus-trap).
  - Bizum probablemente sigue necesitando redirect (método con acción
    externa) — sería un fallback explícito, no parte del flujo embebido.
- **Lo que SÍ es reutilizable tal cual**: el guardia test/live
  (`lib/billing/modo-stripe.ts`), la idempotencia y resolución de tenant del
  webhook (`lib/billing/webhook-tenant.ts`, nunca confía en `metadata`
  sola — resuelve por la cuenta Connect que firma el evento), el guardado de
  caducidad de tarjeta, reembolsos, dunning. Es la capa de **backend** de
  dinero, sólida y no acoplada a Checkout Sessions.
- **Penalizaciones (cobro por no-show) nunca se ha probado con un cargo
  real** — confirmado explícitamente en `docs/STRIPE-CHECKLIST-LANZAMIENTO.md`.
  Con solo 1 de 204 socias con tarjeta guardada en producción hoy, todo el
  camino off-session está muy poco ejercitado con datos reales.

### 3.5 Theme Builder y apariencia

El Theme Builder del panel es un sistema **completo y maduro**
(`lib/theme-schema.ts`, 640 líneas: colores, tipografía curada, radios,
estilos de botón/tarjeta, variantes de forma por bloque, preview en vivo vía
`postMessage` a un iframe real) — pero **casi nada de esto llega al widget
embebido hoy**.

- **Modo A** (`/reservar/[slug]`) usa un sistema **deliberadamente más
  pequeño y separado** (`lib/reservar/apariencia-widget.ts`, documentado así
  en su propio comentario de cabecera): fondo, una fuente por nombre vía
  Google Fonts, radio único, ocultar pie, texto claro/oscuro/auto. Nunca
  colores completos, ni variantes de forma, ni tipografía curada del panel.
- **Modo B** (`app/widget-bundle/main.tsx`) es aún más limitado: solo
  `data-color` (un color), tema fijo en modo día (`MODO_TOKENS.dia`), y
  **colores semánticos (`success`/`warning`/`destructive`) hardcodeados** —
  no derivados de la marca del estudio, porque **no existe en ningún sitio
  del sistema** un cálculo de esos tres colores a partir de un color base
  (verificado por grep en `theme-runtime.ts`/`theme-schema.ts`/`portal-paleta.ts`
  sobre `main`: cero ocurrencias).

**Lo que sí es reutilizable como plantilla:**
- El propio mecanismo de `apariencia-widget.ts` (resolución de campos
  sueltos → CSS) es el patrón correcto a extender, no a sustituir.
- `lib/theme-variantes.ts` (`VARIANTES_PORTAL`) — catálogo puro de presets de
  forma por bloque, sin React ni Zod, ya resuelve exactamente lo que pide la
  Fase 6 del brief original ("presets Minimal/Boutique/Modern/..."). Ya
  enlazado al `ThemeConfig`.
- `MODO_TOKENS`/`lib/portal-paleta.ts` — soporta día/noche completo con
  contraste AA verificado.
- El preview en vivo del panel (`components/theme/theme-preview.tsx`) ya
  demuestra el patrón correcto (iframe real + `postMessage` con whitelist de
  claves) — aplicable a un preview del Modo B si se decide construirlo.

**Falta construir:** derivación de colores semánticos desde la marca; un
puente `data-*`/config remota → subconjunto de `ThemeConfig` pensado para
Shadow DOM (no JSON de DB directo); decidir si el bundle sigue leyendo solo
atributos `data-*` explícitos (ligero, sin llamada nueva) o empieza a pedir
la configuración visual publicada del estudio vía un endpoint CORS-aware
nuevo (más rico, una petición más).

### 3.6 Analítica

- Catálogo de 13 tipos de evento ya definido (`lib/reservar/eventos.ts`), tabla
  `widget_eventos` en producción con RLS de solo-lectura para
  PROPIETARIO/MANAGER. **7 de 13 tipos están wired** (`widget_loaded`,
  `widget_viewed`, `class_selected`, `booking_started`, `checkout_started`,
  `booking_completed`, `lead_started`); **6 sin ningún caller**
  (`class_list_viewed`, `class_detail_viewed`, `recommendation_started`,
  `recommendation_completed`, `lead_completed`, `booking_abandoned`).
- **No existe ningún panel que lea `widget_eventos`** — "Crecimiento web" no
  está construido. La sección `/interno/crecimiento` que existe en el repo es
  sobre leads B2B internos de Tentare, sin relación.

---

## 4. Arquitectura de fases — validada contra el estado real

El orden del brief original (0→10) es correcto en términos de dependencias.
Ajustes que esta auditoría revela necesarios respecto al plan tal cual estaba
escrito:

| Fase | Ajuste respecto al plan original |
|---|---|
| **1 — Core Booking** | Menos trabajo del esperado: el motor de reservas/aforo/lista de espera ya existe completo. El trabajo real es extraer `SpotPicker` como componente aislado y decidir el payload de "solo calendario" (ver §3.6, `liviano`). |
| **2 — Auth** | Más trabajo del esperado, y con riesgo real de UX: el problema de fondo no es "falta código de login", es **third-party storage partitioning** en un contexto embebido — un problema de plataforma (Safari/Chrome), no solo de producto. Necesita spike de validación antes de comprometer alcance. |
| **3 — Commerce + Checkout** | El commerce (planes/bonos) está prácticamente listo. **El checkout NO** — es el cambio de arquitectura más grande de todo el plan (Checkout hospedado → Payment Element embebido). Recomendación: tratarlo como su propia fase con diseño dedicado, no como una tarea dentro de Fase 3. |
| **5 — Waitlist** | Ya está construida casi entera. Solo falta exponer "aceptar oferta" con CORS. Esta fase puede adelantarse — es la de menor esfuerzo de todo el plan. |
| **6 — Theme Builder del widget** | Hay más infraestructura reutilizable de la esperada (`VARIANTES_PORTAL`, `MODO_TOKENS`, el patrón de `apariencia-widget.ts`), pero falta una pieza nueva real: derivación de colores semánticos. No es trivial ni está empezada en ningún sitio. |
| **8 — CRO + Analytics** | El catálogo de eventos y la tabla ya existen; "conectar los eventos que faltan" es trabajo real pero acotado (6 tipos). El panel "Crecimiento web" es 100% nuevo. |

---

## 5. Riesgos y deuda técnica

Consolidado de los siete audits, priorizado por lo que bloquea o compromete
fases próximas (no por orden de aparición):

1. **Checkout embebido de verdad es un cambio de API de Stripe, no una
   adaptación.** Ver §3.4. Es el ítem de mayor riesgo técnico de todo el plan.
2. **CORS cubre hoy exactamente los 6 endpoints que el Modo B usa — por
   diseño, no por descuido.** Cualquier endpoint nuevo de login/checkout/cuenta
   llamado desde el dominio del estudio necesita `respuestaPreflightWidget`/
   `conCorsWidget` explícitamente o falla en silencio en el navegador de la
   visitante (nunca en local, donde suele probarse same-origin).
3. **RLS no protege nada de lo que el widget público toca.** Toda la
   seguridad de escritura nueva (login, checkout, cuenta) recae en código
   escrito a mano en `/api/public/*`, sin red de seguridad de base de datos
   debajo — el mismo patrón que ya causó dos incidentes de seguridad
   corregidos en el panel (migraciones `0118`, `0112`). Cada endpoint nuevo
   necesita el mismo nivel de escrutinio que esos dos tuvieron.
4. **Rate limiting es fail-open por diseño** — correcto para lectura de
   catálogo, no aceptable sin revisión explícita para login (fuerza bruta) o
   checkout (abuso de pago). Los límites actuales (20-30/60s en escritura) se
   dimensionaron para "ver + reservar", no para un flujo de sesión completo
   con login+checkout+cuenta.
5. **El bundle no tiene code-splitting.** `main.tsx` importa
   `<ReservaCalendario>` completo de forma estática; esbuild produce un único
   IIFE. Login+checkout+cuenta en el mismo entry point sin lazy-loading hará
   crecer el tiempo de interactividad del widget de forma lineal con cada
   feature — sin ninguna línea base de tamaño documentada para medir esa
   deriva (no se encontró ninguna auditoría de tamaño previa del bundle).
6. **El modo `liviano` de `studio-data` es binario, no pensado para crecer.**
   Un checkout/cuenta necesita campos hoy exclusivos del modo `completo`
   (bonos comprados, contenido de portal); activar `liviano:false` trae de
   vuelta 11 queries irrelevantes para un simple checkout.
7. **Cero cobertura E2E del bundle real.** El proyecto `webkit-publico` de
   Playwright cubre `/reservar/[slug]?embed=1` (Modo A, dentro de Next), pero
   ningún test carga `public/widget.js` ni ejercita el Shadow DOM real —
   toda la verificación del Modo B hasta ahora ha sido manual.
8. **20 políticas RLS "multiple permissive" y 73 índices sin usar** quedaron
   aparcados explícitamente en el advisor de rendimiento del 6 ago (decisión
   de no tocar seguridad sin revisión dedicada). Antes de que el widget meta
   más escritura concurrente, vale la pena revisar si alguna toca las tablas
   que el widget ahora tocaría.
9. **Deduplicación de identidad cross-tenant no existe.** Mismo `auth.users`
   de Supabase para staff y socias, sin tratamiento especial si el mismo
   email tiene ambos roles en estudios distintos.

---

## 6. Cambios de base de datos necesarios (previstos, no ejecutados)

Ninguno de estos se ha creado — es la lista de lo que las fases siguientes
probablemente necesitarán, para que la numeración de migraciones no
colisione al planificarlas:

- **Fase 2 (Auth)**: ninguna tabla nueva prevista — reutiliza `socios`/`auth.users`.
  Posible columna de auditoría si se añade tracking de "login iniciado desde
  widget" vs portal.
- **Fase 3 (Checkout embebido)**: si se sustituye Checkout Session por
  PaymentIntent + Payment Element, revisar si `recibos`/`entregar-plan-comprado`
  necesitan una columna para el nuevo tipo de identificador de idempotencia
  (hoy derivado de `session.id`).
- **Fase 5 (Waitlist)**: ninguna — solo falta una ruta pública nueva sobre
  la RPC ya existente.
- **Fase 6 (Theme del widget)**: posible tabla/columna para una configuración
  visual "publicada" específica del widget embebible, separada de
  `studio_theme` (mismo criterio que ya separa `apariencia-widget` del tema
  completo) — a decidir en diseño de esa fase, no antes.
- **Fase 8 (Analytics)**: ninguna — la tabla `widget_eventos` ya soporta los
  13 tipos; solo falta wiring de callers y una vista/RPC de agregación para
  el panel "Crecimiento web".

---

## 7. APIs necesarias (nuevas rutas públicas previstas)

| Ruta prevista | Fase | Reutiliza |
|---|---|---|
| `POST /api/public/lista-espera/aceptar-oferta` | 5 | RPC `aceptar_oferta_lista_espera` ya existente, solo falta exponerla con CORS y auth de socia (mismo patrón que `reserva`) |
| `POST /api/public/checkout-embebido` (o similar) | 3 | Sustituye/complementa `checkout.sessions.create`; diseño propio, ver §3.4 |
| Endpoint de catálogo de planes dedicado (a confirmar si hace falta) | 3 | Puede que `studio-data` ya baste — confirmar antes de crear uno nuevo |
| `POST /api/public/login` / registro dentro del widget | 2 | Reutiliza `verificarUsuarioSupabase`/`registrarSociaPublica`; el reto no es la ruta, es el transporte de sesión (§3.1) |
| Lectura agregada de `widget_eventos` para el panel | 8 | Nueva query/RPC de agregación, sin tabla nueva |

---

## 8. Estrategia de migración

1. **Nunca romper Modo A.** El iframe sigue siendo la vía de fallback mientras
   el Modo B gana funcionalidad — cualquier fase que amplíe el widget debe
   verificar que `/reservar/[slug]` (fuera de Shadow DOM) sigue funcionando
   igual.
2. **Cada fase se valida de punta a punta antes de la siguiente**, siguiendo
   la metodología ya usada en el resto de este repo (tsc/eslint/tests +
   verificación funcional real, nunca "compila" como criterio de cierre) —
   coherente con la metodología que pide el brief original.
3. **CORS y rate limiting se amplían endpoint por endpoint, nunca en bloque.**
   Cada ruta pública nueva se añade explícitamente a `lib/cors-widget.ts` y
   se dimensiona su límite según el patrón de uso esperado, no por copiar el
   valor de una ruta parecida.
4. **El checkout embebido (Fase 3) se trata como su propio proyecto de
   diseño**, con `tentare-stripe` involucrado desde el principio — no es una
   tarea dentro de una fase mayor, dado el cambio de API que implica (§3.4).
5. **La Fase 5 (waitlist) puede adelantarse** dentro del orden general — es
   la de menor esfuerzo real (una ruta sobre una RPC ya existente) y no
   depende de que Auth/Checkout estén terminadas.
6. **Ninguna fase se marca cerrada sin verificación E2E real del Modo B**
   (hoy inexistente) — la ausencia actual de cobertura E2E del bundle es una
   deuda a cerrar en paralelo, no al final.

---

## Resumen para decisión

De las 10 fases del plan original, **la Fase 5 (waitlist) es casi gratis**
(el motor ya existe), **la Fase 1 (core booking) es más barata de lo
esperado** (el aforo/reglas ya existen, falta extracción de componentes), y
**la Fase 3 (checkout embebido) es la más cara y arriesgada de todo el plan**
— no por falta de infraestructura de pagos (que es sólida), sino porque el
mecanismo de cobro actual (Checkout hospedado con redirect) es
arquitectónicamente incompatible con "nunca salir del widget", y sustituirlo
por Payment Element embebido es un proyecto de Stripe en sí mismo, con
implicaciones en webhook, idempotencia y 3DS que tocan código ya maduro y
probado en producción.

**Fase 0 completa. Recomendación: aprobar explícitamente el alcance de Fase
3 (checkout embebido) como su propio hito de diseño antes de empezar
implementación de Fase 1**, dado que su resultado (¿Payment Element viable
en Shadow DOM de terceros, con qué fallback para Bizum/3DS?) condiciona
cuánto vale la pena invertir en las fases 1-2 si el checkout final va a
seguir necesitando un redirect parcial.
