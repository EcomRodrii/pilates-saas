# Google OAuth ("Continuar con Google")

Google es **otro proveedor de la misma identidad de Supabase Auth** (`auth.users`), no un
sistema de login paralelo. No hay tabla `profiles` en este repo: el "perfil" de una
propietaria vive en `auth.users.user_metadata`, y el del resto del staff en su fila de
`instructores` (`auth_user_id` → `auth.users.id`). Google no cambia nada de eso — solo
cambia cómo se obtiene la sesión.

```
auth.users (id = identidad real de Tentare)
    ├── identity: email      (contraseña)
    └── identity: google     (OAuth)
```

## 1. Cómo funciona

- **Login/registro**: `signInWithGoogle()` (`lib/auth-context.tsx`) llama a
  `supabase.auth.signInWithOAuth({ provider: 'google' })` con `redirectTo` apuntando a
  `/login`. Google redirige de vuelta ahí con el resultado en la URL.
- **Por qué vuelve a `/login` y no a un callback dedicado**: este proyecto no usa
  `@supabase/ssr` ni middleware — es un único cliente `supabase-js` en el navegador
  (`lib/db/supabase.ts`). `detectSessionInUrl` solo está activo en `/login` y
  `/clave-nueva` (`RUTAS_RETORNO_AUTH_STAFF`), a propósito, para no capturar por
  accidente sesiones de clientas del portal en páginas públicas (hallazgo #9, 2026-07-30).
  Cualquier `redirectTo` de Google **tiene que ser una de esas dos rutas**.
- Al volver, el `useEffect` post-login que ya existía en `app/login/page.tsx` (vincular
  invitación, crear estudio pendiente, resolver destino) se dispara igual que con
  email/password — es agnóstico del proveedor, no hizo falta tocarlo.
- El destino final lo sigue decidiendo `/api/auth/destino-post-login` →
  `resolverDestinoPostLogin()` (`lib/network/routing-post-login.ts`): con estudio real →
  `/dashboard`; sin estudio → `/network/reanudar` o `/network/inicio` según el estado del
  perfil de Network. Un alta por Google sin invitación cae en el mismo sitio que hoy cae
  un alta por email sin invitación — el alta pública real sigue congelada salvo por
  invitación, Google no la reabre.

## 2. Configuración en Google Cloud (Google Auth Platform)

1. Crear (o reutilizar) un proyecto en [Google Cloud Console](https://console.cloud.google.com/).
2. **APIs & Services → OAuth consent screen**: tipo *External*, con el nombre y dominio de
   Tentare. Scopes: solo `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`
   (los que ya pide `signInWithGoogle`) — no añadir ningún scope de Calendar/Gmail aquí,
   eso es una integración de negocio distinta con sus propias credenciales
   (`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` que ya existen en el repo para
   `lib/google-calendar.ts`/`lib/gmail.ts` — **no reutilizarlas**).
3. **Credentials → Create credentials → OAuth client ID**, tipo *Web application*.
4. **Authorized JavaScript origins**:
   - `https://www.tentare.app`
   - `https://tentare.app`
   - `http://localhost:3000` (desarrollo)
5. **Authorized redirect URIs** — el callback de gotrue, NO `/login`:
   - `https://<project-ref>.supabase.co/auth/v1/callback`
   (el project-ref exacto está en `get_project_url`/Dashboard de Supabase).
6. Guardar el **Client ID** y el **Client Secret** que genera Google — van solo en el
   Dashboard de Supabase (paso siguiente), nunca en este repo.

## 3. Configuración en Supabase

**Authentication → Providers → Google** (Dashboard del proyecto):
- Activar el proveedor.
- Pegar el **Client ID** y **Client Secret** de Google Cloud.
- Scopes: dejar los que Supabase pide por defecto (`openid email profile`) — coincide con
  lo que pide `signInWithGoogle` en el cliente.

**Authentication → URL Configuration**:
- **Site URL**: `https://www.tentare.app`.
- **Redirect URLs**: añadir `https://www.tentare.app/login`, `https://tentare.app/login` y,
  para previews/desarrollo, `http://localhost:3000/login` — sin esto gotrue rechaza el
  `redirectTo` aunque el proveedor esté bien configurado (open-redirect protection).

**Authentication → Settings → "Allow manual linking"**: **activarlo**. Por defecto Supabase
enlaza automáticamente identidades que comparten un email verificado; eso es exactamente lo
que Fase 9-11 de este cambio pide evitar (nunca fusionar cuentas en silencio por string de
email). Con manual linking activado, un email que ya existe con contraseña y entra con
Google del mismo email **no se fusiona solo** — la app tiene que ofrecer el flujo explícito
de "Conectar Google" descrito abajo.

No hace falta ninguna variable de entorno nueva en Vercel para que esto funcione en
producción: el Client ID/Secret viven en el Dashboard de Supabase, no en el proyecto
Next.js. `supabase/config.toml` solo declara el proveedor (deshabilitado) para quien
quiera probarlo con `supabase start` en local, vía `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID`/
`SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET` en `.env.local` si algún día se activa ahí.

## 4. Identity linking — comportamiento por caso

| Caso | Comportamiento |
|---|---|
| Google nuevo, sin cuenta previa | `auth.users` nuevo + identity `google`. Cae en la rama "sin estudio" del post-login, igual que hoy un alta por email sin invitación. |
| Cuenta con email/password, pulsa "Continuar con Google" con el mismo email **desde `/login`** | Con manual linking activado, gotrue **no fusiona**: crea o rechaza según si ese email ya tiene cuenta — el mensaje de `mensajeDeError` en `lib/auth-context.tsx` lo traduce. La forma correcta de asociar Google a esa cuenta es entrar con email/contraseña primero y conectar Google desde Configuración → Perfil → "Métodos de acceso". |
| Usuario **ya autenticado** conecta Google desde "Métodos de acceso" | `linkGoogle()` → `supabase.auth.linkIdentity({ provider: 'google' })`. Es la única vía soportada para asociar Google a una cuenta existente — nunca se busca por email desde el cliente. |
| Ese Google ya es identity de OTRA cuenta de Tentare | `linkIdentity` lo rechaza (`mensajeDeError`: "Esta cuenta de Google ya está conectada a otra cuenta de Tentare"). |
| Desconectar Google | `unlinkGoogle()` → `supabase.auth.unlinkIdentity(...)`. La UI (`tab-perfil.tsx`) solo ofrece el botón si quedan ≥2 identidades; gotrue lo rechazaría igualmente si no (`unlink_identity_not_allowed`), la UI solo evita mostrar un botón que fallaría siempre. |
| OAuth cancelado / callback falla | Google/gotrue vuelven a `/login` con `error_description` en la URL; un `useEffect` en `app/login/page.tsx` lo detecta y muestra un mensaje, sin dejar el botón en un estado colgado. |
| Multi-estudio / multi-sede (instructora en varias sedes) | No afectado: la resolución de rol/estudio sigue siendo `instructores.auth_user_id`/`studios.owner_auth_user_id` sobre el mismo `auth.users.id` (P2-14), independiente de qué identity autenticó la sesión. |

**Explícitamente NO implementado**: merge automático de dos cuentas de Tentare distintas
que resulten tener el mismo email (Fase 11) — si eso ocurre, es un caso de soporte manual,
no algo que la app decida sola.

## 5. RLS

No se ha tocado ninguna política. Todas siguen sobre `auth.uid()` y las relaciones
`instructores.auth_user_id` / `studios.owner_auth_user_id` ya existentes — Google solo
cambia cómo se obtiene el JWT, el `sub` (auth.users.id) es el mismo de siempre.

## 6. Migraciones

Ninguna. No hay tabla nueva, ninguna columna nueva, ningún trigger nuevo — todo lo
necesario (identities múltiples por usuario) es nativo de `auth.users`/`auth.identities`
en Supabase.

## 7. Probar en local

1. Seguir el paso 2-3 de arriba creando credenciales de Google Cloud con
   `http://localhost:3000` como origin y `https://<project-ref>.supabase.co/auth/v1/callback`
   como redirect URI (usar el proyecto remoto de desarrollo, no local — Supabase local no
   expone un dominio público al que Google pueda redirigir).
2. Activar el proveedor Google en el Dashboard de ese proyecto remoto de desarrollo (no en
   producción) y añadir `http://localhost:3000/login` a Redirect URLs.
3. `npm run dev`, ir a `/login`, pulsar "Continuar con Google".

## 8. Si Google OAuth deja de funcionar

- **"Iniciar sesión con Google no está disponible ahora mismo"**: el proveedor está
  deshabilitado en el Dashboard de Supabase, o el Client Secret caducó/se revocó en Google
  Cloud — revisar Authentication → Providers → Google.
- **Google redirige con error antes de llegar a `/login`**: revisar Authorized redirect
  URIs en Google Cloud contra la URL real de callback de Supabase
  (`https://<project-ref>.supabase.co/auth/v1/callback`) — un desajuste ahí es el fallo más
  común y Google lo rechaza con un mensaje explícito en su propia pantalla, no en Tentare.
- **Vuelve a `/login` sin sesión y sin error visible**: falta esa URL en Authentication →
  URL Configuration → Redirect URLs del proyecto Supabase (gotrue descarta el `redirectTo`
  silenciosamente si no está en la lista).
- **Una cuenta se queda sin poder entrar tras desconectar Google**: no debería poder pasar
  — `unlinkGoogle()` exige ≥2 identidades — pero si ocurriera, restaurar acceso es un caso
  de soporte manual desde el Dashboard de Supabase (Authentication → Users), no algo que la
  app resuelva sola.
