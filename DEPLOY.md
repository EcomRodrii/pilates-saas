# Despliegue — variables de entorno e integraciones

Notas prácticas de configuración en producción (Vercel). No es un inventario
exhaustivo de env; recoge lo que suele fallar al conectar integraciones.

## ⚠️ Regla de oro: `NEXT_PUBLIC_*` se incrusta en el build

Las variables que empiezan por `NEXT_PUBLIC_` se **inyectan en tiempo de build**
de Next.js. Si añades o cambias una en Vercel, **no tiene efecto hasta que
redespliegues** (push o "Redeploy"). Las que no llevan `NEXT_PUBLIC_` (claves de
servidor) sí se leen en runtime.

## Stripe — cobros a socias (Connect)

Los estudios cobran en **su propia** cuenta de Stripe vía Connect (OAuth de
cuentas Standard, `scope=read_write`). Para que aparezca el botón
**Configuración → Integraciones → Conectar con Stripe** y el flujo funcione:

| Variable | Dónde se usa | Valor |
|---|---|---|
| `STRIPE_SECRET_KEY` | servidor: checkout, cobros, callback | `sk_live_…` (clave secreta de la plataforma) |
| `NEXT_PUBLIC_STRIPE_CONNECT_CLIENT_ID` | cliente: construye la URL OAuth de Connect | `ca_…` (client ID de Connect) |
| `STRIPE_WEBHOOK_SECRET` | webhook de la plataforma | `whsec_…` |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | webhook de cuentas conectadas | `whsec_…` |

### Pasos para habilitar "Conectar con Stripe"

1. **Activa Connect** en el Stripe Dashboard.
2. En **Connect → Settings → OAuth / Integración**, copia el **`client_id`**
   (`ca_…`; hay uno de live y otro de test — usa el de live en producción).
3. En esa misma pantalla, añade a los **redirect URIs** autorizados:
   `https://www.tentare.app/api/stripe/connect/callback`
   (si no está en la lista, Stripe rechaza el OAuth).
4. En Vercel añade `NEXT_PUBLIC_STRIPE_CONNECT_CLIENT_ID=ca_…` (Production).
5. **Redeploy** (por la regla de oro de arriba).
6. En la app: *Conectar con Stripe* → completar OAuth → el estudio queda con
   `stripe_account_id` y ya puede cobrar.

Nota: la URL de redirección se calcula desde `NEXT_PUBLIC_APP_URL` y, si no está,
desde `window.location.origin` (en prod → `https://www.tentare.app`). No es
imprescindible para Connect, pero conviene fijar `NEXT_PUBLIC_APP_URL`.

### Suscripción del SaaS (la plataforma cobra al estudio)

Flujo aparte (`/suscripcion`), con la clave de plataforma y estos precios:
`STRIPE_PRICE_BASE`, `STRIPE_PRICE_ESTUDIO`, `STRIPE_PRICE_CADENA` (`price_…`).

## Otras integraciones / jobs

- **Supabase**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY` (esta última, solo servidor).
- **Emails (Resend)**: `RESEND_API_KEY` y `RESEND_FROM` (`Tentare <hola@tentare.es>`
  con dominio verificado; sin verificar, cae al sandbox `onboarding@resend.dev`).
- **Crons** (`vercel.json`): protegidos con `CRON_SECRET` (header
  `Authorization: Bearer <CRON_SECRET>`). Incluye el semanal de riesgo de
  concentración por instructor (`/api/cron/dependency-risk`).
- **Google Calendar**: `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (+ secreto de servidor).
- **OAuth state**: `OAUTH_STATE_SECRET` (firma el `state` de los OAuth).
