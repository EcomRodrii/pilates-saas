# Verificación de email por OTP (sustituye al enlace de confirmación)

## Qué cambió

Antes, tras registrarse, Supabase Auth mandaba un email con `{{ .ConfirmationURL }}`
(un enlace) usando su plantilla por defecto (sin marca Tentare — no existía
`supabase/templates/confirmation.html`). Ahora manda un código de 6 dígitos
(`{{ .Token }}`), con plantilla propia, y la app tiene una pantalla dedicada
("Verifica tu correo") para escribirlo.

No es un sistema nuevo: sigue siendo Supabase Auth (`gotrue`) — `signUp()`,
`resend({type:'signup'})` y `verifyOtp({type:'signup'})` de siempre. Solo
cambia qué le enseñamos al usuario y qué hace con lo que recibe.

## Piezas

- **`supabase/config.toml`** — `otp_length = 6` (antes 8, nunca se mostraba),
  `otp_expiry = 600` (10 min, antes 1h), y `[auth.email.template.confirmation]`
  apuntando a `supabase/templates/confirmation.html` (plantilla nueva, con el
  código en vez del enlace).
- **`app/api/auth/otp/verificar/route.ts`** — gotrue no lleva la cuenta de
  intentos fallidos POR EMAIL (solo limita `/auth/v1/verify` por IP). Este
  endpoint añade ESE segundo cerrojo — 6 intentos / 15 min por email, con la
  RPC atómica `rate_limit_hit` que el proyecto YA tenía (I14,
  `lib/rate-limit.ts`) — antes de reenviar la verificación a gotrue con la
  clave anon. Devuelve los tokens de sesión al éxito; el cliente los hidrata
  con `supabase.auth.setSession()`.
- **`app/api/auth/otp/reenviado/route.ts`** — al reenviar un código, libera el
  cerrojo de intentos del código anterior (si no, un código recién llegado
  podía quedar inservible hasta 15 min por los fallos con el código viejo).
  Seguro porque el propio reenvío ya es escaso (gotrue: 2 emails/hora, 60s
  entre reenvíos, con captcha).
- **`lib/auth-context.tsx`** — `verificarOtpSignup(email, token)`, nueva
  función del contexto de auth, junto a las que ya existían
  (`signUp`/`reenviarConfirmacion`/etc.).
- **`components/auth/otp-input.tsx`** + **`components/auth/otp-verificacion.tsx`**
  — el input de 6 recuadros (paste, autofocus, backspace inteligente,
  `autocomplete="one-time-code"`) y la pantalla completa (estados
  vacío/foco/completo/verificando/éxito/error/bloqueado, reenvío con cuenta
  atrás, cambiar email). Reutilizado tal cual en los 4 puntos de entrada
  reales de la app (ver abajo).
- **`lib/otp-utils.ts`** — lógica pura (extraer dígitos de un texto pegado,
  formatear la cuenta atrás), testeada sin DOM en `lib/otp-utils.test.ts`.
- **`lib/auth/otp-pendiente.ts`** — el email a la espera de verificación
  sobrevive a un recargo/atrás en `sessionStorage` (mismo patrón que
  `lib/equipo/invitacion-pendiente.ts`).

## Dónde se usa

Los 4 sitios reales donde una cuenta puede quedar "sin confirmar" (los mismos
que ya llevan el botón de Google, ver `docs/GOOGLE-OAUTH.md`):

1. `app/login/page.tsx` — alta de staff (modo "Crear cuenta") y login con una
   cuenta sin confirmar.
2. `app/network/acceso/page.tsx` — login de Tentare Network con una cuenta sin
   confirmar.
3. `app/network/crear-perfil/page.tsx` (paso 1/12) — alta real de instructora.
4. `components/landing/network/SeccionRegistro.tsx` (en `/network/unirse`) —
   signup desde la landing pública.

Todos comparten `OtpVerificacion`, sin lógica duplicada. La única diferencia
visual es `sinTarjeta`: en `SeccionRegistro` ya hay una tarjeta blanca
alrededor (`.nw-reg-card`), así que el componente no pinta la suya para no
anidar dos.

## Por qué "código incorrecto" y "código caducado" son el MISMO mensaje

gotrue devuelve el mismo error (`otp_expired`, "Email link is invalid or has
expired") tanto si el código está mal escrito como si de verdad caducó — a
propósito, para no dar a quien lo prueba la pista de "casi aciertas". No se
fabrica en el cliente una distinción que gotrue niega deliberadamente por
seguridad. El único estado que SÍ se distingue de verdad es "demasiados
intentos", porque ese lo decide nuestro propio rate limit, no gotrue.

## Qué NO cambió

- **`app/clave-nueva`** (recuperación de contraseña) — sigue siendo el enlace
  de siempre, `resetPasswordForEmail` + `supabase/templates/recovery.html`.
  Comparte el `otp_length`/`otp_expiry` globales de gotrue con la confirmación
  de signup (es un único ajuste de `[auth.email]`), pero el token de
  recuperación sigue viajando dentro de la URL, nunca se le enseña a nadie —
  bajarlo a 10 min es un endurecimiento para ese flujo, no una regresión.
- **Cambio de email de una cuenta ya creada**
  (`components/configuracion/tab-perfil.tsx`) — sigue siendo
  `email_change.html`, con su propio enlace de doble confirmación. No pasa por
  OTP; no se tocó.
- **Google OAuth** — las cuentas de Google nunca pasaron por `enable_confirmations`
  (Google ya verifica el email en origen), así que no hay nada que migrar ahí.
- **RLS** — ninguna política depende de `email_confirmed_at` (comprobado con
  grep en todas las migraciones antes de tocar nada); la autorización sigue
  funcionando exactamente igual.

## Despliegue — paso manual necesario

`supabase/config.toml` y `supabase/templates/*.html` **no se aplican solos al
mergear**: no hay ningún paso de CI que haga `supabase db push`/`config push`
contra el proyecto remoto. Tras mergear este cambio, hay que aplicarlo a mano
una vez:

```bash
supabase link --project-ref dwqvdycjcffqwfkzapvi
supabase config push
```

O, si se prefiere no usar la CLI: reproducir a mano en el Dashboard
(`Authentication → Providers → Email`) los tres valores — longitud del OTP a
6, expiración a 600s, y pegar el HTML de `confirmation.html` en la plantilla
de "Confirm signup" — mismo patrón ya seguido para `recovery.html` y
`magic_link.html` cuando se dieron de alta.

## Cómo probarlo

1. Local: `.env.local` con las claves públicas del proyecto (ver
   `docs/GOOGLE-OAUTH.md` — mismo patrón), `npm run dev`, ir a `/login →
   Crear cuenta`.
2. El código real solo se genera contra el proyecto de Supabase de verdad
   (no hay stub local) — probarlo de extremo a extremo crea una cuenta e
   identity reales, igual que ya se advertía para Google.
