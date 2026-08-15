# Fase 2 — Login y registro dentro del widget embebido (Modo B): diseño técnico

> Estado del repo auditado: `origin/main` @ `38b93b24` (15 ago 2026). Este documento
> es una fotografía para decisión, no código — la implementación es un paso posterior,
> condicionado a los spikes de §9.
>
> Continúa `docs/booking-engine-architecture.md` (Fase 0, §3.1) y coexiste con
> `docs/checkout-embebido-diseno.md` (Fase 3) sin depender de él — este diseño
> resuelve identidad/`socioId` antes de que exista ningún checkout embebido.

## 0. Corrección sobre lo que decía la Fase 0 — verificado, no asumido

La auditoría de Fase 0 podía leerse como si faltaran endpoints de login/registro
públicos. **No es así, y cambia el alcance real de esta fase**:

- `app/api/public/socio/route.ts` **ya existe, ya usa `registrarSociaPublica`, y
  ya es CORS-aware** (`respuestaPreflightWidget`/`conCorsWidget`,
  `lib/cors-widget.ts:14-67`). Acepta `accion: 'registrar'` para el alta de una
  walk-in ya autenticada por magic link — exactamente el caso que este diseño
  necesita.
- `app/api/public/session/route.ts` **ya existe y ya es CORS-aware** — bootstrap
  de sesión desde un JWT verificado.
- `lib/reservar/api-publica.ts` (`postPublicoWidget`) **ya existe**: un cliente
  mínimo pensado explícitamente para el bundle Modo B (fuera de
  `StudioProvider`), que añade `?studioId=` a la URL para que el preflight de
  `cors-widget.ts` pueda resolver la lista blanca.
- Ambos endpoints se tocaron en el mismo PR #1090 que ya documenta la Fase 0.

**Consecuencia real para el alcance de esta fase**: no hace falta ningún
endpoint nuevo de registro. El endpoint de login/bootstrap tampoco es nuevo. Lo
que falta es exclusivamente:
1. Una UI de login/registro dentro del Shadow Root que llame a lo que ya existe.
2. Resolver el problema de transporte de sesión de un magic link que hoy solo
   sabe volver a una ruta top-level de `tentare.app`, no al DOM de un tercero.
3. Turnstile dentro del Shadow Root.
4. Ajustar rate limiting para el patrón de uso nuevo.

---

## 1. Alcance exacto de esta fase

**Se construye dentro del Shadow Root:**
- Login con dos caminos: contraseña (`signInWithPassword`) para quien ya tiene
  cuenta, y magic link (`signInWithOtp`) para quien no. Ambos ya existen como
  métodos en `lib/use-socia-session.ts:80-107` — se portan al bundle, no se
  reinventan.
- Registro de visitante nueva (nombre + teléfono + email ya conocido por el
  magic link + checkbox de contrato), reusando `POST /api/public/socio` con
  `accion: 'registrar'` vía `postPublicoWidget`.
- Turnstile invisible (mismo patrón `execution:'execute'`+`appearance:'interaction-only'`
  ya medido en producción) montado dentro del propio Shadow Root.
- Bootstrap y persistencia de sesión ya existente en `usar-sesion-widget.ts` —
  sin cambios de fondo, solo pasa a alimentar también los formularios nuevos.
- Logout.

**Se deja deliberadamente fuera y deriva a la página completa (`/reservar/[slug]`, Modo A):**
- El **retorno físico del magic link** no se resuelve completo dentro del
  Shadow DOM del sitio del estudio — se resuelve en una pestaña/ventana de
  `tentare.app` que el propio widget abre, y que se cierra sola tras avisar al
  widget (detalle en §2). No es "sacar a la clienta a un iframe" en el sentido
  que se quiere evitar (no hay redirect de la página del estudio, no pierde su
  sitio de origen), pero **sí es honesto decir que no es 100% dentro del Shadow
  Root de principio a fin** — es la única forma viable de que
  `detectSessionInUrl` capture el fragmento del email sin controlar el dominio
  del estudio.
- **`establecerPassword`** (fijar contraseña tras un magic link) — es una
  operación de cuenta, no de conversión inmediata; queda para el portal, no en
  el widget. Añadirlo aquí sumaría un segundo formulario a un flujo que ya
  tiene login + registro + captcha + posible ventana emergente.
- Cualquier pantalla de "olvidé mi contraseña" — deriva a `/reservar/[slug]`
  completo con un enlace, igual que el resto del portal.

**Trade-off honesto, sin prometer de más**: "login y registro dentro del
widget" en esta fase significa *la visitante nunca abandona la web del estudio
ni ve un redirect de página completa de la web del estudio*, no *cero
ventanas/pestañas de Tentare en ningún momento*. Con Third-Party Storage
Partitioning activo (Safari ITP ya, Chrome en despliegue progresivo de
Privacy Sandbox), no existe ningún mecanismo cross-site 100% silencioso para
completar un magic link sin al menos un salto de contexto a un origen de
primera parte de Tentare. Prometer "todo el flujo, sin excepción, dentro del
Shadow Root" sería vender algo que la plataforma no permite garantizar.

---

## 2. Flujo de login recomendado dentro del widget

**Decisión: contraseña como camino primario dentro del widget; magic link con
patrón "pestaña + postMessage", fallback explícito para quien no tiene
contraseña todavía — no una alternativa igual de fluida.**

- `signInWithPassword` (`lib/use-socia-session.ts:99-107`) es una petición
  POST directa a la API de Supabase Auth, **no** pasa por ninguna ruta de
  `lib/cors-widget.ts` — es la propia API de gotrue, pensada por diseño para
  llamarse desde cualquier origen con la clave anon. No hay preflight que
  resolver. Es la opción de menor fricción real dentro del Shadow Root.
- El magic link choca de lleno con el problema que señaló la Fase 0:
  `emailRedirectTo` apunta hoy a `${window.location.origin}/reservar/${slug}...`
  (`use-socia-session.ts:84`) — dentro del widget, `window.location.origin` es
  el dominio del **estudio**, no de Tentare. Aunque se fuerce el `redirectTo`
  a `tentare.app`, `detectSessionInUrl` solo procesa el fragmento en la
  pestaña que carga esa URL — y esa pestaña sería `tentare.app`, no la ventana
  del sitio del estudio donde vive el Shadow Root.

**Mecanismo concreto para el magic link dentro del widget** (nuevo — el
patrón `postMessage` con validación de origen ya es una convención aceptada
en este repo, ver `lib/theme-preview-puente.ts`, aunque ese caso es entre dos
orígenes que Tentare controla, no aplica igual aquí):

1. El widget pide el email, pide el token de Turnstile, llama a
   `signInWithOtp` con `emailRedirectTo` fijo a
   `${ORIGEN_TENTARE}/widget-auth-retorno?slug=${slug}` (ruta nueva, top-level,
   dentro de Next — no del bundle esbuild).
2. En vez de "revisa tu correo y vuelve" pasivo, el widget abre — solo cuando
   la visitante pulsa un botón explícito tras confirmar que envió el enlace,
   nunca automáticamente — una `window.open(ORIGEN_TENTARE, '_blank',
   'width=420,height=600')` a una pantalla de espera de Tentare. Esa pestaña,
   al recibir el retorno de `detectSessionInUrl` (mismo mecanismo que ya usa
   `supabasePortal`, `lib/db/supabase-portal.ts:15`), hace
   `window.opener?.postMessage({ tipo: 'tentare-widget-auth', ok: true,
   access_token, refresh_token }, EL_ORIGEN_DEL_ESTUDIO)` y se cierra sola.
3. El bundle (`app/widget-bundle/main.tsx`), que ya conoce `ORIGEN_TENTARE` de
   forma síncrona vía `document.currentScript` (líneas 44-51), añade un
   listener `window.addEventListener('message', ...)` que **valida
   `event.origin === ORIGEN_TENTARE`** antes de aceptar nada — mismo principio
   de lista blanca que ya aplica `lib/cors-widget.ts` a las peticiones HTTP,
   aplicado aquí al mensaje. Al recibir el mensaje válido, llama
   `supabasePortal.auth.setSession({ access_token, refresh_token })` para que
   el propio SDK del widget quede autenticado sin haber navegado nunca.
4. Si el navegador bloquea el `window.open` (popup blocker) o la visitante
   cierra la pestaña sin completar el enlace, el widget se queda igual que
   hoy: sin sesión, con el CTA derivando a `/reservar/[slug]` completo — el
   fallback de Modo A que ya documenta `usar-sesion-widget.ts:17-19` sigue
   siendo la red de seguridad.

**Riesgo de esto, no maquillado**: `window.opener.postMessage` requiere que la
pestaña nueva NO tenga `rel="noopener"` y que ambas ventanas sigan vivas
durante el intercambio — es exactamente el tipo de mecánica que Safari con
"Prevent Cross-Site Tracking" activo puede degradar. **Esto va en la lista de
spikes obligatorios (§9), no se asume que funciona.**

---

## 3. Flujo de registro de una visitante nueva

Reutiliza `crearAltaWalkIn` (`app/reservar/[slug]/page.tsx:855-875`) como
plantilla exacta — mismos tres campos y mismo objeto `aceptacionContrato`:

```ts
// dentro del widget, tras autenticación (password o magic link vía postMessage)
// sin ficha de socia todavía (mismo chequeo que hoy hace resolverSociaAutenticada,
// que devuelve 404 en /api/public/session cuando el email no tiene socia en el estudio)
postPublicoWidget(`${ORIGEN_TENTARE}/api/public/socio`, {
  accion: 'registrar',
  studioId,
  id: crypto.randomUUID(),
  nombre: form.nombre.trim(),
  telefono: form.telefono.trim(),
  aceptacion: {
    fecha: new Date().toISOString(),
    firma: form.nombre.trim(),
    versionTexto: textoLegalCompleto(studioConfig), // mismo mecanismo, lib/legal-textos.ts:147
    origen: 'PORTAL',
  },
  referidoPor: null,      // el widget hoy no propaga ?ref= — fuera de esta fase, ver §8
  origenLead: null,
}, { studioId, origenCors: 'query-studio-id' });
```

**Campos mínimos**: nombre y teléfono, igual que el walk-in de Modo A — no se
añade ningún campo nuevo. El email no se pide en este formulario porque ya lo
demostró al autenticarse (viene del JWT, nunca del body — mismo criterio de
seguridad de `app/api/public/socio/route.ts:35` donde `email: user.email`, no
`body.email`).

**Consentimiento/contrato**: se reutiliza `textoLegalCompleto(studioConfig)`
(`lib/legal-textos.ts:147`) tal cual — el bundle necesita `studioConfig`
(política de privacidad + términos del estudio) en su payload de datos
públicos. Hay que confirmar si `useDatosWidget`/`cargarDatosPublicos` ya trae
esos dos campos en el modo `liviano` que usa el bundle — si no, es un campo
más a añadir al payload existente, no un endpoint nuevo (spike §9.5).

**No se inventa un contrato "simplificado" para el widget.** El texto legal
completo tiene que ser exactamente el mismo objeto que ve la socia en Modo A y
en el portal — es la base de la detección de "consentimiento vigente" que ya
usa la penalización por no-show (comparación de texto guardado vs. texto
actual). Un texto distinto en el widget rompería esa comparación en silencio.

---

## 4. Sesión persistente y logout

**Honesto, no optimista**: "recuérdame en tu próxima visita" solo es tan
fiable como el storage de terceros lo permita en cada navegador.

- El mecanismo de persistencia ya existe y no cambia: `supabasePortal` con
  `persistSession: true` (`lib/db/supabase-portal.ts:13`), `storageKey:
  'sb-portal-auth'` propio. El widget corre en el DOM del estudio pero usa el
  `localStorage` de **ese mismo origen del estudio** (el script se ejecuta con
  el origin del documento anfitrión, no de un iframe) — así que, a diferencia
  del caso de iframe que documenta `use-socia-session.ts:93-98`, el
  localStorage del widget **NO es de tercero respecto al navegador**: es de
  primera parte para el sitio del estudio. El problema de ITP/partición no
  aplica aquí de la misma forma que a un iframe — pero sí aplica a las
  llamadas de RED que ese storage necesita hacer contra `*.supabase.co`
  (refresh de token, `signInWithOtp`), que sí son cross-site desde el punto
  de vista de fetch/CORS aunque no de storage.
- Consecuencia práctica: una vez logueada, la sesión persiste en el navegador
  de la visitante en ESE sitio del estudio concreto (recuerda entre visitas al
  mismo estudio). Lo que NO persiste — y no debe prometerse — es la sesión
  saltando entre el widget de un estudio y `tentare.app`/el portal instalable
  en el mismo navegador si hay partición activa entre esos dos orígenes
  distintos.
- **Fallback honesto**: si `getSession()` no encuentra nada, simplemente se le
  vuelve a pedir login — sin ningún mensaje que sugiera un fallo. Es el
  comportamiento normal, no una degradación a explicar.
- **Logout**: `supabasePortal.auth.signOut()` tal cual, igual que
  `use-socia-session.ts:118-122` — sin diferencia para el widget.

---

## 5. Captcha

**Se exige, sin excepción — Turnstile dentro del Shadow Root, misma
combinación `execution:'execute'`+`appearance:'interaction-only'` ya medida en
producción.**

No es una decisión libre: el captcha está activado **a nivel de proyecto de
Supabase**, así que `signInWithOtp`/`signInWithPassword` fallarán en gotrue
sin un token válido, tenga el widget su propia UI de captcha o no — no hay
forma de "decidir no exigirlo" sin desactivarlo para TODO el proyecto, lo que
reabriría el acceso completo del panel/portal a fuerza bruta. No está sobre
la mesa.

Lo que sí es una decisión de diseño es **cómo montar el script de Cloudflare
dentro de un Shadow Root**:
- `TurnstileWidget` (`components/auth/turnstile-widget.tsx`) usa `next/script`
  para cargar el script global de Cloudflare — inapropiado tal cual para el
  bundle esbuild (no pasa por Next). Se necesita una versión mínima que cargue
  el script con una etiqueta `<script>` normal inyectada una vez en el
  `document.head` (el script de Cloudflare es global por diseño, no puede
  vivir dentro del Shadow Root — pero Turnstile pinta su iframe en el punto
  del DOM que se le indique vía `render(container, {...})`, y ese container
  SÍ puede ser un nodo dentro del Shadow Root).
- Cloudflare Turnstile soporta explícitamente renderizar dentro de un Shadow
  DOM (necesidad común de web components) — no es un salto de fe, pero **no
  está medido en este repo todavía** contra `execution:'execute'`+
  `appearance:'interaction-only'` en ese contexto concreto. Va al spike (§9).
- Riesgo de abuso si el spike revela que Turnstile no aísla bien dentro del
  Shadow Root: el rate limit de `enforceRateLimit` (fail-open,
  Postgres-respaldado) sigue siendo la segunda capa — nunca la única, pero
  tampoco cero protección si el captcha fallara en algún navegador concreto.

---

## 6. CORS/rate limiting

**Cero endpoints nuevos necesarios (§0)** — las dos rutas que hacen falta
(`/api/public/session`, `/api/public/socio`) ya están en `lib/cors-widget.ts`
desde PR #1090. Lo único nuevo:

1. **Una ruta top-level nueva, `/widget-auth-retorno`** (dentro de `app/`,
   pasa por Next normal — NO por el bundle esbuild), para el retorno del
   magic link descrito en §2. No necesita CORS (`lib/cors-widget.ts` es solo
   para el bundle Modo B llamando cross-origin; esta ruta la carga el propio
   navegador con navegación normal). Necesita sí una whitelist de qué hace
   tras autenticar: solo `postMessage` al `opener` y cerrarse, nada de UI
   compleja.
2. **Rate limiting**: `public-socio` (20/60s) y `public-session` (30/60s) ya
   existen y probablemente bastan — un login+registro típico son 2-4
   peticiones. Ojo con doble filo: el volumen de intentos de login por
   password (`signInWithPassword`) no pasa por ningún rate limit propio de
   Tentare (va directo a gotrue) — correcto que sea así (mismo criterio que
   el resto del portal), no hace falta duplicar limitador.
3. Nada que tocar en `respuestaPreflightWidget`/`conCorsWidget` — funciones
   agnósticas del endpoint, ya genéricas.

---

## 7. Seguridad no negociable

Confirmado contra el código real:

- `app/api/public/socio/route.ts:35` — el alta deriva `email: user.email` del
  JWT verificado (`verificarUsuarioSupabase`), **nunca** de `body.email`. El
  `id` de la nueva socia lo genera el cliente (`crypto.randomUUID()`), pero
  **no es una identidad** — es solo la PK de una fila que luego se vincula por
  `auth_user_id` derivado del token.
- `app/api/public/socio/route.ts:64` — cualquier operación sobre una socia YA
  existente resuelve `socioId` vía `socioAutenticado(user.userId,
  body.studioId)`, nunca acepta un `socioId` del body. El widget hereda este
  mismo patrón sin excepción.
- El mensaje `postMessage` del retorno de magic link (§2) valida
  `event.origin === ORIGEN_TENTARE` antes de usar el `access_token` — sin esa
  validación, cualquier script del sitio del estudio (o un tercero inyectado
  ahí) podría enviar un mensaje falso e intentar hacerse pasar por el retorno
  de Supabase. El token en sí sigue siendo el de Supabase Auth (firmado por
  Supabase, verificado server-side en `/api/public/session` vía
  `verificarUsuarioSupabase`) — el `postMessage` solo transporta un token ya
  legítimo, no autoriza nada por sí mismo.

---

## 8. Qué NO se aborda en esta fase

- **Google OAuth para socias.** Verificado contra `origin/main`: `signInWithOAuth`/
  `linkIdentity` en `lib/auth-context.tsx` ya está mergeado, pero sigue siendo
  exclusivamente staff — usa el cliente `supabase` normal (no `supabasePortal`),
  y su `redirectPath` solo resuelve a `/login` (`RUTAS_RETORNO_AUTH_STAFF`,
  `lib/auth-context.tsx:154-160`). No toca `supabasePortal` en ningún punto.
  Extenderlo a socias del widget queda fuera de esta fase — no hay ninguna
  pieza reutilizable de ese código para el caso de socias.
- **Fusión de cuentas cross-tenant / entre staff y socia.** Sigue sin existir
  ningún mecanismo de deduplicación — caso raro, fuera de alcance salvo pedido
  explícito.
- **`establecerPassword` dentro del widget** (§1) — se queda en el portal.
- **Recuperación de contraseña** dentro del widget — deriva a Modo A.
- **Propagar `?ref=` (código de referido) al registro desde el widget** — el
  bundle Modo B hoy no lee ni propaga query params de la página del estudio;
  añadirlo es una pieza separada, no incluida en este diseño.
- **Cualquier cosa que dependa de que esta fase "resuelva" el storage
  partitioning como problema de plataforma** — no se resuelve, se acota con el
  patrón de pestaña + `postMessage` de §2, y ese patrón en sí necesita el
  spike de §9 antes de darse por bueno.

---

## 9. Riesgos que requieren spike de validación antes de implementar

Concreto, no genérico — cada uno es una tarde de trabajo medible:

1. **El más crítico**: probar en **Safari real con "Prevent Cross-Site
   Tracking" activo** (no solo WebKit de Playwright — WebKit de Playwright no
   es Safari de iOS en temas de permisos) que el flujo completo de §2
   funciona: `window.open` desde un clic dentro del Shadow Root → completar el
   magic link en la pestaña nueva → `postMessage` de vuelta → `setSession`
   recibido y aplicado en el widget. Sin esto medido, todo el diseño del
   magic link es papel.
2. **Turnstile dentro de un Shadow Root** con la combinación
   `execution:'execute'`+`appearance:'interaction-only'` — confirmar que el
   iframe que Cloudflare inyecta se renderiza correctamente dentro del Shadow
   Root y sigue siendo invisible en reposo.
3. **Bloqueo de popups**: medir en Chrome/Safari/Firefox si `window.open()`
   disparado desde el manejador `onClick` (después de un `await` a Turnstile
   de ~3,5s) sigue contando como "resultado directo de una interacción del
   usuario", o si el retraso del captcha hace que el navegador lo bloquee. Si
   lo bloquea, el diseño de §2 necesita abrir la pestaña ANTES de esperar el
   token de Turnstile (con una pantalla de carga dentro de esa pestaña).
4. **Tamaño del bundle**: añadir Turnstile + los formularios de login/registro
   al `main.tsx` (sin code-splitting, riesgo ya señalado en Fase 0) — medir el
   delta de KB del `widget.js` resultante antes/después; no hay línea base
   previa documentada.
5. **Confirmar si `useDatosWidget`/el payload `liviano` ya trae
   `politicaPrivacidad`/`terminosServicio`** (§3) antes de asumir que hace
   falta ampliar el endpoint.
6. **E2E del bundle real**: la Fase 0 ya señaló que ningún test carga
   `public/widget.js` de verdad. Esta fase, más que ninguna otra hasta ahora,
   necesita al menos un spec que cargue el bundle compilado de verdad y
   ejercite login+registro sobre él.

---

**Resumen de una frase**: diseño de login y registro dentro del widget
embebido (Fase 2 del Booking Experience Engine) — contraseña como camino
primario en Shadow DOM, magic link resuelto con pestaña + `postMessage`
validado por origen, cero endpoints nuevos porque `/api/public/socio` y
`/api/public/session` ya estaban listos, con el bloqueo de popups y Safari
ITP real como los dos spikes que condicionan si el diseño sobrevive contacto
con navegadores reales.
