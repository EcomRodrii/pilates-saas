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
| `datosRegistroToken(token)` | cuerpo de `POST /api/notifications/nativo` | `null` |
| `alPulsarAviso(handler)` | aviso pulsado → ruta interna | no hace nada |
| `alAbrirEnlace(handler)` | Universal Link / esquema propio → ruta interna | no hace nada |
| `loginConApple()` | hoja nativa → `{ idToken, nonce }` | `{ error: 'solo-en-la-app' }` |
| `loginConGoogleNativo(url)` | OAuth en Safari por encima → ruta de vuelta | `{ error: 'solo-en-la-app' }` |

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

Pendiente del carril de la web, no de este:

- **`/app`**: login con usuario de Tentare → `/portal/<slug>`.
- **Universal Links**: `https://www.tentare.app/.well-known/apple-app-site-association`
  y lo mismo en `tentare.app` (los dos dominios del entitlement), servido como
  `application/json`, **sin redirección**: Apple no la sigue, y HOY `tentare.app`
  redirige con un 308 a `www` (lib/legal-info.ts). O se sirve ese fichero en el
  ápice sin redirigir, o los enlaces a `tentare.app` no abrirán la app (los de
  `www` sí). Con
  `applinks.details[].appIDs: ["<TEAMID>.app.tentare"]` y las rutas que deban
  abrir la app (`/portal/*`, `/app/*`).
- **Supabase Auth**: proveedor Apple con el bundle id (`app.tentare`) entre sus
  Client IDs; `app.tentare://auth/vuelta` en Redirect URLs para Google.
- **`POST /api/notifications/nativo`** que guarde el `RegistroTokenNativo`.
- **Borrar la cuenta desde la app**: Apple lo exige (guía 5.1.1(v)) en toda app
  que permite crear cuenta.

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
4. Para la App Store: capturas (iPhone 6,9" y, como la app también es de iPad,
   iPad 13"), URL de privacidad y de soporte, la ficha de privacidad
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

## Qué no se ha podido comprobar

Este proyecto se preparó sin Xcode: no se ha compilado ni ejecutado nunca. Lo
primero al abrirlo es compilar en el simulador y probar, por este orden: que
carga `/app`, la página de «Sin conexión» en modo avión, Iniciar sesión con
Apple (el plugin propio), el registro de push (en un iPhone real; el simulador
solo da token en un Mac con Apple silicon) y un Universal Link desde Notas.
