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
Hay dos caminos. El primero sería el bueno, pero hoy no arranca — así que en la
práctica toca el segundo.

#### 1. Supabase en local — HOY NO ARRANCA

Sería el camino bueno: `supabase/config.toml` ya trae el captcha desactivado
(`[auth.captcha]` comentado) y las confirmaciones de email también
(`enable_confirmations = false`), así que el alta funcionaría sin tocar nada de
producción.

**Pero `npx supabase start` no llega al final.** Hay cinco números de migración
duplicados —`0061`, `0069`, `0071`, `0072` y `0075`, los mismos que la lista
`HISTORICAS` de `lib/migraciones.test.ts`— y `schema_migrations.version` es clave
primaria, así que el segundo de cada par choca y el arranque se revierte entero.

En producción no se nota: allí están aplicadas con versión de *timestamp*, no con el
número del fichero. (Corolario: este repo **no usa `supabase db push`**; las
migraciones se aplican por MCP o dashboard, y el número del fichero es orden y
documentación, no la versión real.)

Lo que ya se descartó al intentar arreglarlo:

- **Sufijos tipo `0075a_`**: el CLI solo reconoce versiones numéricas y **se salta**
  esos ficheros sin avisar — la migración no se aplica y falla la siguiente que
  dependa de ella.
- **Mover el duplicado al final**: no hay huecos libres entre `0058` y el último
  número, y para el par `0075` ambos miembros tienen dependencias posteriores
  (`0077` y `0100` necesitan `limite_semanal`; `0089` necesita `migracion_batches`).

La salida real es renumerar la cola entera, que toca ~50 ficheros y conviene hacer
con cero ramas abiertas. Hasta entonces, usa el camino 2.

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
