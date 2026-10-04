# La app de iOS

Una sola app, «Tentare», en la App Store. Quien la abre entra con su usuario de
Tentare y aterriza en la app de SU estudio (`/portal/<slug>`, con la marca del
estudio). Más adelante, apps por estudio compiladas de este mismo proyecto.

## Qué es (y qué no)

Una **carcasa nativa** (Capacitor 8) alrededor de la web real. No hay una copia
de la web dentro de la app:

- La app abre `https://www.tentare.app/app` (`server.url` en
  `capacitor.config.ts`). Esa página —login con usuario de Tentare → su
  estudio— es de la web, no de este proyecto.
- Lo único empaquetado es la página de «Sin conexión» (`movil/www/index.html`),
  que iOS enseña si la web no carga (`server.errorPath`). Su botón vuelve a la
  URL de arranque: si un día cambia, cambia en los dos sitios.
- Dentro de la app solo se navega por `www.tentare.app` y `tentare.app`
  (`allowNavigation`). Cualquier otro sitio lo abre iOS fuera.
- La web sabe que la abre la app por dos vías: `esAppNativa()`
  (`lib/nativo/puente.ts`) en el navegador, y `TentareApp` al final del
  User-Agent en el servidor.

Consecuencia buena: un despliegue de Vercel llega a la app en el acto, sin pasar
por la revisión de Apple. Solo hay que publicar versión nueva cuando cambia lo
nativo (plugins, permisos, icono).

## El puente web ↔ nativo

`lib/nativo/puente.ts`, importable desde cualquier componente de cliente. En la
web no descarga nada de Capacitor (los plugins van con `import()` solo dentro de
la app) y cada función hace lo de siempre:

| Función | En la app | En la web |
|---|---|---|
| `esAppNativa()` | `true` | `false` |
| `abrirFuera(url)` | Safari por encima (SFSafariViewController) | `window.open` |
| `compartirFichero({ nombre, tipo, contenido })` | caché + hoja de compartir (Calendario para un .ics, Archivos/Imprimir para un PDF) | descarga, como hoy |
| `registrarPushNativo()` | permiso + token de APNs | `{ error: 'solo-en-la-app' }` |
| `datosRegistroToken(token)` | el `nativo` de `POST /api/notifications/subscribe` (`{ studioId, nativo }`) | `null` |
| `alPulsarAviso(handler)` | aviso pulsado → ruta interna | no hace nada |
| `alAbrirEnlace(handler)` | Universal Link / esquema propio → ruta interna | no hace nada |
| `loginConApple()` | hoja nativa → `{ idToken, nonce }` | `{ error: 'solo-en-la-app' }` |
| `loginConGoogleNativo(url)` | OAuth en Safari por encima → ruta de vuelta | `{ error: 'solo-en-la-app' }` |
| `pedirAccesoCalendario()` / `crearEventoCalendario(e)` / `borrarEventoCalendario(id)` | EventKit (`@ebarooni/capacitor-calendar`), acceso COMPLETO | `false` / `null` |
| `brilloAlMaximo()` | brillo a 1 y devuelve con qué restaurarlo (`@capacitor-community/screen-brightness`) | no hace nada |

Lo puro, con tests: `enlaces.ts` (qué enlace es de Tentare y a qué ruta va),
`nonce.ts`, `ficheros.ts`, `plataforma.ts`, `identidad-app.ts`. Los tipos del
contrato con el servidor (`RegistroTokenNativo`…) están en `tipos.ts`, que una
ruta de servidor puede importar sin arrastrar Capacitor.

⚠️ **Toda ruta que sale de un enlace o de un aviso es solo path + query.** Otro
host, `//otro-host`, un puerto, credenciales en la URL o un fragmento se
descartan (`rutaInternaDeEnlace`): lo que devuelve se le pasa a `router.push`.

### Iniciar sesión con Apple: dos nonces

- A Apple va el **SHA-256 en hex** del nonce; Apple lo firma en el claim `nonce`.
- A Supabase va el **nonce en crudo**:
  `supabase.auth.signInWithIdToken({ provider: 'apple', token: idToken, nonce })`.
  Supabase lo hashea y lo compara. Mandarle el hash falla siempre, sin pista.

Apple solo da el nombre la PRIMERA vez que alguien entra en la app con su
cuenta: `loginConApple()` lo devuelve en `nombre` y hay que guardarlo entonces.

El plugin nativo vive en el proyecto (`ios/App/App/SignInWithApplePlugin.swift`,
registrado en `TentareBridgeViewController.swift`), no como dependencia:
`@capacitor-community/apple-sign-in` 7.1.0 declara `capacitor-swift-pm from:
"7.0.0"`, que en SPM es «< 8», y Xcode no resolvería los paquetes con
Capacitor 8. Imita su contrato (nombre JS `SignInWithApple`, `authorize`, misma
respuesta): cuando publique la versión para Capacitor 8, se instala, se borran
esos dos ficheros Swift y la web no cambia.

### Iniciar sesión con Google

Google bloquea su login dentro de un WebView, así que va en un Safari por
encima. La vuelta tiene que llegar como enlace a la app, y lo fiable es el
**esquema propio**: `<bundle id>://auth/vuelta` (`app.tentare://auth/vuelta`),
que hay que añadir a las «Redirect URLs» de Supabase. Una redirección a
`https://www.tentare.app/…` dentro de ese Safari no la entrega iOS como
Universal Link: se quedaría cargando la web ahí dentro. El esquema lo declara
`Info.plist` (CFBundleURLTypes = el bundle id de cada app).

Por ese esquema vuelve un **código**, nunca los tokens (otra app podría registrar
el mismo esquema): PKCE. Como `supabasePortal` usa el flujo implícito (los
enlaces del correo dependen de él), el canje lo hace un cliente de auth de un
solo uso con PKCE y memoria como almacén, y la sesión se entrega a
`supabasePortal` con `setSession` (`lib/nativo/google.ts`). El botón está en la
entrada (`/app`, `components/nativo/BotonGoogle.tsx`) y en el acceso de la app
de cada estudio, siempre con Apple delante (guía 4.8).

## Compilar

Requisitos: un Mac con **Xcode** (de la App Store, no basta con las Command Line
Tools) y Node. **No hace falta CocoaPods**: el proyecto usa Swift Package
Manager.

```sh
sudo xcode-select -s /Applications/Xcode.app   # una vez, tras instalar Xcode
npm ci
npm run cap:sync      # identidad de la app + copia la web + Package.swift
npm run cap:open      # abre ios/App/App.xcodeproj (con SPM no hay .xcworkspace)
```

En Xcode: esperar a que resuelva los paquetes (descarga `capacitor-swift-pm` de
GitHub la primera vez), elegir un simulador y ▶︎. Sin Team ID se puede probar en
el simulador; para un iPhone de verdad hace falta firmar.

`npm run cap:sync` hay que repetirlo al cambiar `capacitor.config.ts`, añadir o
actualizar un plugin, o cambiar la identidad de la app.

### Qué hay en `ios/`

- `App/App/` — el código nativo: `AppDelegate.swift` (token de push),
  `SceneDelegate.swift` (enlaces que abren la app), `TentareBridgeViewController`
  y el plugin de Apple, `Info.plist`, `App.entitlements`, iconos y arranque.
- `App/CapApp-SPM/Package.swift` — lo regenera `cap sync`; no se edita.
- `tentare.xcconfig` — bundle id, nombre y equipo por defecto (ver abajo).
- Generado y fuera de git (`ios/.gitignore`): `App/App/public/`,
  `capacitor.config.json`, `identidad.local.xcconfig`.

## Firmar con la cuenta de Apple

1. Darse de alta en el Apple Developer Program (99 $/año). Con una cuenta de
   **persona física**, el vendedor que sale en la App Store es esa persona.
2. El **Team ID** está en developer.apple.com → Account → Membership details.
3. Pasarlo al compilar, sin tocar ficheros versionados:
   ```sh
   TENTARE_APPLE_TEAM_ID=XXXXXXXXXX npm run cap:sync
   ```
   Se guarda en `ios/identidad.local.xcconfig` (fuera de git). También se puede
   elegir en Xcode → target App → Signing & Capabilities, pero eso lo escribe en
   `project.pbxproj`: no se commitea (el repo es público).
4. Firma automática: Xcode crea el App ID y los perfiles.

### Capacidades en el portal de Apple

En developer.apple.com → Identifiers → `app.tentare`, activar (Xcode lo hace
solo con firma automática si los entitlements ya están, pero conviene mirarlo):

- **Push Notifications**
- **Sign in with Apple**
- **Associated Domains**

`App.entitlements` ya los pide: `aps-environment`, `applinks:www.tentare.app` y
`applinks:tentare.app`, y Sign in with Apple (`Default`).

### Clave de APNs (.p8)

Para que el servidor mande avisos push:

1. developer.apple.com → Keys → «+» → marcar **Apple Push Notifications
   service (APNs)**. Se descarga **una sola vez** un `AuthKey_XXXXXXXXXX.p8`.
2. Apuntar el **Key ID** y el **Team ID**.
3. Guardarlos como variables de entorno en Vercel (el envío lo programa otro
   carril). **Nunca** el `.p8` en el repo.

Una clave vale para todas las apps del mismo equipo; el aviso va a una app u
otra por el `apns-topic`, que es su bundle id (por eso `RegistroTokenNativo`
lleva `bundleId`).

⚠️ `aps-environment` es `development` en el repo. Una compilación desde Xcode a
un iPhone recibe por el APNs de **sandbox** (`api.sandbox.push.apple.com`); al
archivar para TestFlight/App Store el perfil lo cambia a `production` y hay que
mandar por `api.push.apple.com`. Un token de uno no vale en el otro.

## Lo que la web tiene que tener para que esto funcione

En el servidor (PR #2487):

- **`/app`**: login con usuario de Tentare → `/portal/<slug>` (o `/equipo` si es instructora).
- **Universal Links**: `https://www.tentare.app/.well-known/apple-app-site-association`
  (rewrite a `/api/app/aasa`; 404 hasta que exista `APPLE_TEAM_ID`). ⚠️ `tentare.app`
  sin `www` redirige con un 308 y Apple no sigue redirecciones: los enlaces al ápice
  no abrirán la app; los de `www` (los que manda Tentare) sí.
- **Token de avisos**: `POST /api/notifications/subscribe` con `{ studioId, nativo }`;
  se guarda como `apns://<bundleId>/<token>` y lo envía el canal PUSH por APNs
  (`APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY`, `APNS_ENTORNO`).

Pendiente:

- **Supabase Auth**: proveedor Apple con el bundle id (`app.tentare`) entre sus
  Client IDs; `app.tentare://auth/vuelta` en Redirect URLs para Google.
- **Borrar la cuenta desde la app** (guía 5.1.1(v)): hoy la alumna lo solicita desde
  Perfil → Privacidad y datos y lo ejecuta su estudio en 30 días.

## Iconos y pantalla de arranque

```sh
npm run iconos:ios
```

Sale del kit de marca (`docs/marca/`), como `scripts/regenerar-marca.mjs`: icono
de 1024 px a sangre y **sin canal alfa** (App Store Connect rechaza un icono con
transparencia) y arranque claro y oscuro de 2732 px.

## TestFlight y revisión

1. App Store Connect → Apps → «+»: plataforma iOS, nombre, idioma principal
   español, bundle id `app.tentare`, un SKU.
2. Xcode: destino «Any iOS Device» → Product → Archive → Distribute App → App
   Store Connect → Upload. Subir `CURRENT_PROJECT_VERSION` (build) en cada
   subida.
3. TestFlight: probadores internos al momento; externos, tras una revisión beta.
4. Para la App Store: capturas de iPhone 6,9" (la app es solo de iPhone:
   `TARGETED_DEVICE_FAMILY = 1`), URL de privacidad y de soporte, la ficha de privacidad
   («App Privacy») y una cuenta de prueba para el revisor.

Puntos de la revisión que tocan a esta app:

- **4.2 (funcionalidad mínima)**: una web metida en una app se rechaza si no
  aporta nada. Aquí aportan push, Iniciar sesión con Apple, compartir al
  Calendario y la cámara para el QR de la clase.
- **4.8**: si se ofrece Google, hay que ofrecer también Iniciar sesión con Apple.
- **3.1.3(e)**: clases y cuotas son servicios que se consumen fuera de la app,
  así que se cobran con Stripe, sin compras dentro de la app.
- `ITSAppUsesNonExemptEncryption = false` en `Info.plist`: la app solo usa
  HTTPS, y así no pregunta por exportación de cifrado en cada subida.

## Apps por estudio

Salen de este mismo proyecto cambiando la identidad al compilar:

```sh
TENTARE_APP_ID=app.tentare.luz TENTARE_APP_NAME="Luz" npm run cap:sync
```

`capacitor.config.ts` las lee, y `scripts/identidad-ios.mjs` las escribe en
`ios/identidad.local.xcconfig`, que `project.pbxproj` e `Info.plist` usan como
`$(TENTARE_BUNDLE_ID)` y `$(TENTARE_APP_NAME)`. La URL de arranque es la misma:
`/app` sabe qué app la abre por su bundle id (`bundleIdDeLaApp()`).

Cada app de estudio necesita además: su App ID con las tres capacidades, su
ficha en App Store Connect, su `<TEAMID>.<bundle id>` en el fichero de Universal
Links, su bundle id en los Client IDs de Apple de Supabase, su
`<bundle id>://auth/vuelta` en las Redirect URLs, y su icono (hoy `iconos:ios`
pinta el de Tentare).

⚠️ **Guía 4.2.6**: Apple rechaza las apps hechas con una plantilla comercial si
no las publica el propio dueño del contenido. Una app por estudio tendría que
publicarse desde la cuenta de desarrollador **del estudio**, no desde la de
Tentare. Decidirlo antes de prometerlo.

## Lo de la app de la alumna que solo existe en el iPhone (oct-2026)

- **«Texto más grande»** (Dynamic Type): `PuenteNativo` mide el cuerpo del
  sistema con una sonda `font: -apple-system-body` y lo aplica como
  `--escala-texto` (0,9–1,35, `lib/nativo/escala-texto.ts`), que multiplica los
  tokens `--t-*` de `student.css`. No toca el `font-size` de `<html>`: lo que mide
  en `rem` (el pago embebido) no crece sin revisar. Lo que lleva un tamaño en px
  escrito a mano en una pantalla no escala.
- **Deslizar desde el borde para volver**: `allowsBackForwardNavigationGestures`
  en `TentareBridgeViewController.swift`. La web no anima esa vuelta (ya la anima
  WebKit); el botón «Volver» sí (`lib/student/transiciones.ts`).
- **Calendario** (Perfil → «Mis reservas en mi calendario» y «+ Calendario»):
  acceso COMPLETO y no «solo añadir», porque con «solo añadir» iOS no deja volver
  a encontrar el evento para quitarlo al cancelar. Textos del permiso en
  `Info.plist` (`NSCalendarsFullAccessUsageDescription`, `NSCalendarsUsageDescription`
  para iOS < 17 y `NSCalendarsWriteOnlyAccessUsageDescription`). La memoria de qué
  evento es de qué clase vive en el dispositivo (`localStorage`,
  `lib/student/calendario-auto.ts`).
- **Brillo al máximo** al enseñar el QR de acceso (Perfil → QR y el detalle de una
  reserva activa); vuelve el de antes al salir.

### Apple Wallet (preparado, INERTE)

El servidor que firma el pase ya está (`app/api/public/wallet-pase`,
`lib/wallet/`, librería `passkit-generator`, MIT). El botón «Añadir a Apple
Wallet» (Perfil → QR de acceso) **no se pinta** mientras falte cualquiera de
estas variables en Vercel:

| Variable | Qué es |
|---|---|
| `APPLE_WALLET_PASS_TYPE_ID` | El identificador del Pass Type ID (p. ej. `pass.<dominio>.acceso`) |
| `APPLE_WALLET_TEAM_ID` | El Team ID de la cuenta de Apple Developer |
| `APPLE_WALLET_CERT_PEM_B64` | El certificado del Pass Type ID, en PEM y luego en base64 |
| `APPLE_WALLET_KEY_PEM_B64` | Su clave privada, en PEM y luego en base64 |
| `APPLE_WALLET_KEY_PASSPHRASE` | (opcional) la contraseña de esa clave |
| `APPLE_WALLET_WWDR_PEM_B64` | El intermedio de Apple «Worldwide Developer Relations – G4», en PEM y en base64 |

Pasos: 1) en developer.apple.com → Identifiers, crear un **Pass Type ID**;
2) generarle un certificado (CSR desde Acceso a Llaveros) y descargarlo;
3) exportarlo con su clave como `.p12` y sacar los PEM
(`openssl pkcs12 -in pase.p12 -clcerts -nokeys -out cert.pem` y
`… -nocerts -out key.pem`); 4) descargar el WWDR G4 y pasarlo a PEM
(`openssl x509 -inform der -in AppleWWDRCAG4.cer -out wwdr.pem`); 5) `base64 -i
fichero.pem` de cada uno a su variable; 6) desplegar un cambio de **código**
(un merge de solo `.md` no despliega).

⚠️ Sin probar en un iPhone: el `.pkpass` se entrega por la hoja de compartir
(`compartirFichero`). Si iOS no ofrece «Añadir a Wallet» ahí, hace falta un
plugin nativo mínimo con `PKAddPassesViewController` (`PKPass(data:)` con los
bytes). ⚠️ El pase lleva el MISMO token que el QR de la app: si la alumna genera
un QR nuevo, el pase deja de valer y hay que volver a añadirlo (no hay servicio
web de actualización de pases). Tampoco aparece solo al llegar al estudio: eso
pide `locations` con las coordenadas del estudio, que hoy no se guardan.

### Cómo comprobar Apple Pay en la hoja de pago

La hoja de pago embebida (`CheckoutEmbebido`, Payment Element de Stripe) ofrece
Apple Pay solo si el dispositivo puede **y** el dominio está verificado para
Apple Pay en la cuenta conectada del estudio. Dentro de un WKWebView, WebKit
desactiva Apple Pay en la web cuando la app inyecta scripts en la página
(Capacitor lo hace para su puente), así que **puede no salir aunque en Safari sí
salga**. Para
comprobarlo: en un iPhone con una tarjeta en Wallet, abrir «Comprar» en la app y
mirar si el Payment Element pinta el botón de Apple Pay arriba; repetir en Safari
con la misma URL. Si sale en Safari y no en la app, es la limitación del
WKWebView (la salida es el plugin nativo de Stripe, no la web).

## Qué no se ha podido comprobar

Este proyecto se preparó sin Xcode: no se ha compilado ni ejecutado nunca. Lo
primero al abrirlo es compilar en el simulador y probar, por este orden: que
carga `/app`, la página de «Sin conexión» en modo avión, Iniciar sesión con
Apple (el plugin propio), el registro de push (en un iPhone real; el simulador
solo da token en un Mac con Apple silicon) y un Universal Link desde Notas.
