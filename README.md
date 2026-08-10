This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Desarrollo en local

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

### Ojo: el alta y el login NO funcionan contra la Supabase de producción

El captcha (Cloudflare Turnstile) se exige **a nivel de proyecto en Supabase**, no en el cliente.
Si el navegador no manda token, gotrue rechaza el alta **y el login** con:

```
captcha protection: request disallowed (no captcha_token found)
```

Pasa en todo entorno sin `NEXT_PUBLIC_TURNSTILE_SITE_KEY` — local y las preview de Vercel.
Hay dos caminos, y el primero es el bueno.

#### 1. Supabase en local (recomendado)

No toca nada de producción. En `supabase/config.toml` el captcha está desactivado
(`[auth.captcha]` comentado) y las confirmaciones de email también
(`enable_confirmations = false`), así que el alta funciona de un tirón.

Necesita Docker. Si no lo tienes, `colima` va de sobra y es más ligero que Docker
Desktop: `brew install colima docker && colima start`.

```bash
npx supabase start          # aplica supabase/migrations + seed.sql y levanta el stack
```

Apunta `.env.local` a lo que imprima el comando, y **comenta la site key de
Turnstile** si la tienes puesta:

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<la ANON_KEY que imprime>
# NEXT_PUBLIC_TURNSTILE_SITE_KEY=...   ← comentada: en local no hay captcha
```

Lo de comentarla no es opcional. La Supabase local no pide captcha, pero si la
variable está puesta el widget se monta igual y, al enviar, el formulario espera
un token que **nunca llega**: se queda 30 segundos en «Enviando…» y acaba en
«No hemos podido comprobar que no eres un robot».

**`TURNSTILE_SECRET_KEY` (opcional, solo producción).** Es la otra mitad del par,
y **no** es pública: la usa `/api/public/interes-lanzamiento` para verificar el
token contra el `siteverify` de Cloudflare (`lib/auth/captcha-servidor.ts`). Sin
ella ese endpoint no verifica nada y solo queda el límite por IP — que es como
estuvo hasta ahora. En local déjala sin poner: el verificador detecta que no hay
secreto y deja pasar sin llamar a nadie. El resto de pantallas con captcha no la
necesitan: ahí quien verifica el token es Supabase, no la app.

⚠️ Si se pone el secreto, la site key pública **tiene que estar puesta también**
en ese mismo entorno. Con secreto y sin site key el navegador no emite token, el
servidor lo exige, y el formulario deja de aceptar altas.

Para volver a producción, deshaz esas tres líneas. `npx supabase stop` apaga los
contenedores y `colima stop` la VM.

Los correos no salen a internet: van a Mailpit, en http://127.0.0.1:54324. Ahí ves
el enlace de confirmación y cualquier aviso que dispare la app.

#### 2. Contra la Supabase de producción

Solo si necesitas datos reales. Hace falta que el navegador consiga un token válido:

```
NEXT_PUBLIC_TURNSTILE_SITE_KEY=0x4AAAAAAD_8wUO3n50mElU0
```

Es la site key de producción, y es pública (viaja en el bundle). La clave de *prueba* de
Cloudflare **no sirve**: Supabase valida el token contra el secret real del proyecto.

Y además hay que añadir `localhost` en Cloudflare → Turnstile → el widget → *Hostname
Management*. Sin eso el widget da error y el botón de enviar se queda deshabilitado aunque la
variable esté puesta. Ten en cuenta que eso afloja un poco el control anti-bots del alta de
producción: un token emitido desde `localhost` pasa a ser válido (el desafío hay que resolverlo
igual).

En las **preview de Vercel** este camino no vale: el hostname es `*.vercel.app` y Turnstile no
admite comodines de subdominio. Para verificar pantallas con sesión sin pelearse con el captcha,
usa la suite e2e (`e2e/`), que siembra la sesión y mockea el backend.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
