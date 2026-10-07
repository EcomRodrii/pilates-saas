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
| `crearEventoConHoja(e)` | la hoja de iOS para añadir un evento (`@ebarooni/capacitor-calendar`), sin pedir acceso | `null` |
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
  y el plugin de Apple, `Info.plist`, `App.entitlements`, `PrivacyInfo.xcprivacy`,
  iconos y arranque.
- `App/CapApp-SPM/Package.swift` — lo regenera `cap sync`; no se edita.
- `tentare.xcconfig` — bundle id, nombre y equipo por defecto (ver abajo).
- Generado y fuera de git (`ios/.gitignore`): `App/App/public/`,
  `capacitor.config.json`, `identidad.local.xcconfig`.

### Comprobar que compila para la App Store (sin cuenta de Apple)

```sh
npm run cap:sync
cd ios/App
xcodebuild archive -project App.xcodeproj -scheme App -configuration Release \
  -destination 'generic/platform=iOS' -archivePath /tmp/Tentare.xcarchive \
  CODE_SIGNING_ALLOWED=NO
```

Tiene que acabar en `** ARCHIVE SUCCEEDED **` sin avisos (pasó así el
7-oct-2026, Xcode 26.6, SDK iOS 26.5). El archivo sin firmar no se puede subir:
solo demuestra que Release compila. El de verdad sale de Xcode con la firma
(paso 8 de «Primer envío»).

## Lo que ya cumple la app (requisitos de Apple, revisado el 7-oct-2026)

| Requisito | Estado | Dónde |
|---|---|---|
| Manifiesto de privacidad (obligatorio desde mayo de 2024 para las API «required reason») | ✅ | `ios/App/App/PrivacyInfo.xcprivacy` (ver abajo) |
| Texto de cada permiso que la app puede pedir | ✅ | `Info.plist`: cámara (foto de perfil y, la instructora, el QR de sus alumnas al pasar lista), fotos (elegir y guardar), calendario (los tres `NSCalendars*`). Los avisos no llevan texto |
| `ITSAppUsesNonExemptEncryption = NO` | ✅ | `Info.plist`. Solo el HTTPS del sistema y un SHA-256 para el nonce de Apple: exento |
| Icono 1024×1024 sin canal alfa | ✅ | `Assets.xcassets/AppIcon.appiconset` (icono de un solo tamaño: Xcode saca los demás). `npm run iconos:ios` lo regenera |
| Solo iPhone, versión 1.0 (1) | ✅ | `TARGETED_DEVICE_FAMILY = 1`, `MARKETING_VERSION = 1.0`, `CURRENT_PROJECT_VERSION = 1`, en Debug y Release |
| Push, Iniciar sesión con Apple, dominios asociados | ✅ en el proyecto, ⏳ en el portal | `App.entitlements`. Falta activarlos en el App ID (paso 3) |
| Universal Links (`/.well-known/apple-app-site-association`) | ⏳ | Formato correcto (`applinks.details[].appIDs` + `components`, y `webcredentials`), JSON y sin redirección en `www`. Hoy responde **404** porque falta `APPLE_TEAM_ID` en Vercel (paso 4) |
| 4.2 Funcionalidad mínima | ✅ | Push, Iniciar sesión con Apple, «+ Calendario» nativo, la instructora pasa lista escaneando con la cámara el QR de sus alumnas, brillo al máximo al enseñar el QR, Texto más grande, gesto de volver. Ver «Revisión» |
| 4.8 Iniciar sesión con Apple si hay Google | ✅ | `/app` y el acceso de cada estudio, Apple siempre delante |
| 5.1.1(v) Borrar la cuenta desde la app | ✅ | Perfil › Privacidad y datos › «Borrar mi cuenta de Tentare» (#2512): borra la cuenta al momento |
| Revocar el token de Apple al borrar la cuenta (TN3194) | ⚠️ alternativa | No guardamos el token de Apple, así que la hoja de «cuenta borrada» le dice cómo quitar Tentare de «Iniciar sesión con Apple» en Ajustes, que es la salida que da Apple cuando no hay token |
| 1.2 Contenido generado por usuarios | ✅ | Ver la tabla de la guía 1.2, más abajo |
| Cuenta de prueba para el revisor | ⏳ | El código está; la cuenta la crea el fundador («Acceso para la revisión de Apple») |

### Manifiesto de privacidad

`ios/App/App/PrivacyInfo.xcprivacy`, dentro del bundle de la app (fase Resources).

- **API «required reason»**: solo la fecha de los ficheros
  (`NSPrivacyAccessedAPICategoryFileTimestamp`, razón `C617.1`: ficheros dentro
  del contenedor de la app). La usa `IONFilesystemLib`, la librería de
  `@capacitor/filesystem`, que no trae manifiesto propio. Capacitor y Cordova
  traen el suyo (vacío). Comprobado contra el binario archivado (`nm -u App`):
  ni `UserDefaults`, ni tiempo de arranque, ni espacio en disco.
  ⚠️ Si se añade un plugin, repetir la comprobación: puede traer otra API, y
  App Store Connect rechaza la subida si falta su razón.
- **Datos que se recogen** (todos para que la app funcione, ninguno para
  seguimiento, `NSPrivacyTracking = false`): nombre, email, teléfono, salud (la
  ficha de salud), datos de pago (Stripe), compras, fotos (la de perfil),
  contenido de la usuaria (chat y tablón), mensajes (el chat), forma física
  (nivel, ejercicio y objetivos de la valoración), otros datos (su fecha de
  nacimiento, en la valoración), soporte, id de usuario e id de dispositivo (el
  token de push), vinculados a la persona; diagnóstico de fallos y rendimiento
  (Sentry), sin vincular. PostHog no se carga en ninguna pantalla de la app
  (`/app` y `/portal` están en `PREFIJOS_EXCLUIDOS_DE_ANALITICA`,
  `lib/posthog-privacidad.ts`): por eso no se declaran «interacción con el
  producto» ni «ubicación aproximada». Si se mide algo dentro de la app, hay que
  declararlo. **«App Privacy» en App Store Connect
  tiene que decir lo mismo**: si cambia uno, cambia el otro.

### Permisos: qué se pide y qué no

Un permiso que se pide sin su texto en `Info.plist` cierra la app, y App Store
Connect rechaza la subida si el binario usa una API de permiso sin texto
(ITMS-90683). Los que hay son los que la app puede pedir:

- **Cámara**: «Hacer foto» al cambiar la foto de perfil y, si es instructora,
  el lector con el que pasa lista escaneando el QR de sus alumnas
  (`EscanerQrClase`, en `/portal/<slug>/equipo/clase/<id>/lista`). La alumna no
  escanea nada: enseña su QR.
- **Fotos**: elegir la foto de perfil, y «Guardar imagen» desde la hoja de
  compartir (sin `NSPhotoLibraryAddUsageDescription` esa opción cierra la app).
- **Calendario**: ver «+ Calendario» más abajo (la app no pide acceso, pero el
  binario del plugin hace referencia a las API de permiso).

No se piden, y por eso no llevan texto: micrófono y ubicación (el dictado de
notas y el «cerca de mí» de Network son del panel, que se usa en Safari; si
alguna vez se abrieran en la app, WebKit deniega sin cerrarla), contactos,
Face ID y seguimiento (ATT). Los textos van en español en `Info.plist`
(`CFBundleDevelopmentRegion = es`), sin `InfoPlist.strings`, porque la app solo
está en español. Si se traduce, se crea `<idioma>.lproj/InfoPlist.strings`.

## Acceso para la revisión de Apple

El revisor de Apple no puede leer nuestro correo, y Apple pide unas
credenciales que funcionen. Hay **una** cuenta de demo que entra con un código
fijo en vez del código del correo:

- **Tres variables de entorno del servidor**, solo en Vercel → **Production**
  (las previews comparten la base de datos de producción): `APP_REVIEW_EMAIL`
  (el email exacto de la cuenta), `APP_REVIEW_CODIGO` (6 cifras; uno trivial,
  como `000000` o `123456`, se ignora) y `APP_REVIEW_STUDIO_ID` (el id del
  estudio donde está su ficha). **Sin las tres, no existe.**
- La única puerta es `/api/auth/otp/verificar`, la misma del código del correo,
  después de sus límites (30 intentos/5 min por IP y 6/15 min por email).
  Además, el email de demo tiene un tope de **20 intentos al día**; agotado, o
  si el contador no puede contar, el código fijo deja de valer (el del correo
  sigue valiendo) y se contesta igual que a un código equivocado. Quien conozca
  el email puede gastar esos 20 intentos y dejar al revisor fuera hasta el día
  siguiente: por eso el email solo se da en App Store Connect.
- Comparación en tiempo constante. Solo para ese email exacto (sin distinguir
  mayúsculas).
- Solo para una cuenta que ya existe y que es **solo alumna** (ni equipo, ni
  dueña, ni Tentare, ni Network: el mismo criterio que «Borrar mi cuenta»), con
  ficha en el estudio de `APP_REVIEW_STUDIO_ID` y **sin verificación en dos
  pasos**. Si alguien pusiera
  en la variable el email de una propietaria o de una cuenta con 2FA, el código
  fijo no abre nada. La sesión que emite es la normal de un código de correo,
  así que las guardias de siempre la tratan igual.
- Quien tenga el código no se queda la cuenta: en cada entrada con el código
  fijo se le pone una contraseña al azar (borra la que alguien le hubiera
  puesto) y se cierran sus demás sesiones.
- Cada entrada y cada rechazo quedan en Sentry (`area: acceso-revision`), sin el
  email ni el código. Al cliente, un rechazo le dice lo mismo que un código
  equivocado.
- Código: `lib/auth/acceso-revision.ts` (reglas, con tests) y
  `lib/auth/acceso-revision-servidor.ts`.

**Lo que tiene que crear el fundador** (nada de esto está creado):

1. Un email suyo que no use para nada más (por ejemplo un alias de su dominio).
   No el de su cuenta de propietaria: la regla de «solo alumna» lo rechazaría, y
   es lo que queremos.
2. **Una alumna de demo** con ese email, dada de alta desde el panel. Mejor en
   un **estudio de demostración** (sin alumnas reales) que en el estudio real:
   el revisor, y cualquiera que tuviera el código, vería la comunidad y el
   nombre de las demás alumnas. Con un plan o bono activo para que pueda
   reservar, alguna clase en los próximos días, un mensaje del estudio en su
   chat y una publicación del tablón con un comentario de otra alumna (lo que
   pide la guía 1.2, ver su tabla). El id del estudio (`APP_REVIEW_STUDIO_ID`)
   se ve en /interno o en la tabla `studios`.
3. Entrar una vez en la app con ese email y el código que le llega, y comprobar
   que se ve bien. La cuenta la crea ese primer acceso (el código fijo no crea
   cuentas).
4. En Vercel → Settings → Environment Variables (solo Production):
   `APP_REVIEW_EMAIL`, `APP_REVIEW_CODIGO` (6 cifras al azar) y
   `APP_REVIEW_STUDIO_ID`. Desplegar un
   cambio de **código** para que las recoja (un merge de solo `.md` no
   despliega).
5. Probarlo: en la app, el email, «Continuar» y, en la pantalla del código, el
   código fijo.
6. En App Store Connect → la versión → «App Review Information» → «Sign-in
   required»: ese email como usuario y el código fijo como contraseña, con una
   nota del estilo: «Escribe el email, pulsa Continuar y, cuando pida el código
   de 6 cifras, escribe el de arriba (no hace falta abrir el correo)».

⚠️ Si el revisor prueba «Borrar mi cuenta» con la demo, se borra la cuenta pero
la ficha del estudio se queda: el siguiente acceso con el email vuelve a crear la
cuenta y la vincula, y el código fijo vuelve a valer. Si crea un estudio con esa
cuenta, deja de ser «solo alumna» y el código fijo deja de valer (avisa Sentry):
hay que borrar ese estudio. Lo mismo si activa la verificación en dos pasos:
hay que quitársela desde la ficha.

**Retirar la demo tras la aprobación** (y volver a montarla en el siguiente
envío): quitar las tres variables de Vercel **y** bloquear la cuenta (Supabase
→ Authentication → Users → la cuenta → «Ban user») o borrarla. Quitar las
variables no cierra las sesiones que ya se abrieron; bloquearla, sí (y al volver a montarla hay que desbloquearla: bloqueada, el código fijo no entra).

## Primer envío: los pasos del fundador, en orden

Todo lo que es código y configuración del proyecto ya está. Lo que queda
necesita la cuenta de Apple Developer:

1. **Alta en el Apple Developer Program** (99 $/año). Con una cuenta de persona
   física, el vendedor que sale en la App Store es esa persona; con una de
   empresa (pide número D-U-N-S), la empresa.
2. **Xcode con su Apple ID**: Xcode → Settings → Accounts → «+» → Apple ID. Su
   **Team ID** está en developer.apple.com → Account → Membership details (10
   caracteres). Se pasa al proyecto sin tocar ficheros versionados:
   ```sh
   TENTARE_APPLE_TEAM_ID=XXXXXXXXXX npm run cap:sync
   ```
   Se guarda en `ios/identidad.local.xcconfig` (fuera de git; el repo es
   público). No elegirlo en Xcode → Signing & Capabilities: eso lo escribe en
   `project.pbxproj`, que sí se versiona.
3. **El App ID**: developer.apple.com → Certificates, Identifiers & Profiles →
   Identifiers → «+» → App IDs → App → descripción «Tentare», Bundle ID
   **explícito** `app.tentare`, y marcar **Associated Domains**, **Push
   Notifications** y **Sign in with Apple** («Enable as a primary App ID»).
   Con firma automática Xcode lo crearía solo, pero así se ve que están las
   tres.
4. **Universal Links**: en Vercel (Production), `APPLE_TEAM_ID` = el Team ID.
   Tras desplegar,
   `curl -i https://www.tentare.app/.well-known/apple-app-site-association`
   tiene que dar `200`, `content-type: application/json` y
   `"appIDs":["XXXXXXXXXX.app.tentare"]`. ⚠️ `tentare.app` (sin `www`) redirige
   con un 308 y Apple no sigue redirecciones: los enlaces al dominio sin `www`
   no abrirán la app (los que manda Tentare llevan `www`). Para que valgan
   también, ese fichero tendría que servirse en el dominio sin `www` sin
   redirigir (ajuste de dominios de Vercel, no de código).
5. **Avisos push (APNs)**: developer.apple.com → Keys → «+» → un nombre, marcar
   **Apple Push Notifications service (APNs)** → Continue → Register →
   **Download** (el `AuthKey_XXXXXXXXXX.p8` se descarga **una sola vez**:
   guardarlo fuera del repo). En Vercel (Production):
   - `APNS_KEY_ID`: el Key ID de esa clave
   - `APNS_TEAM_ID`: el Team ID
   - `APNS_PRIVATE_KEY`: el contenido entero del `.p8` (con
     `-----BEGIN PRIVATE KEY-----`; los saltos de línea pueden ir como `\n`)
   - `APNS_ENTORNO`: `production` (TestFlight y App Store). Solo una
     compilación de Xcode instalada en un iPhone usa `sandbox`.

   Una clave vale para todas las apps del equipo; el aviso va a una u otra por
   el `apns-topic` (su bundle id).
6. **Iniciar sesión con Apple en Supabase**: Dashboard → Authentication →
   Sign In / Providers → Apple → activar, y en **Client IDs** poner
   `app.tentare`. Para la app basta con eso: el login es nativo
   (`signInWithIdToken`), así que **no hace falta Service ID ni clave secreta**.
   Solo harían falta para un «Iniciar sesión con Apple» en la WEB, que hoy no
   existe; si algún día se quiere: Identifiers → «+» → Services IDs, con
   `www.tentare.app` como dominio y
   `https://<proyecto>.supabase.co/auth/v1/callback` como Return URL, una clave
   de «Sign in with Apple» en Keys, y los dos en ese mismo proveedor de Supabase
   (la clave secreta caduca cada 6 meses). De paso, en Authentication → URL
   Configuration → Redirect URLs, comprobar que está `app.tentare://auth/vuelta`
   (Google en la app). Y la cuenta de revisión: «Acceso para la revisión de
   Apple», arriba.
7. **App Store Connect**: Apps → «+» → New App: iOS, nombre «Tentare», idioma
   principal Español (España), bundle id `app.tentare`, un SKU (p. ej.
   `tentare-ios`). La ficha, las capturas y la privacidad van en su propia guía;
   «App Privacy» tiene que cuadrar con el manifiesto (arriba).
8. **Archivar y subir**: en Xcode, destino «Any iOS Device (arm64)» → Product →
   Archive. En el Organizer: Distribute App → **App Store Connect** → Upload,
   con firma automática. Al firmar para distribución, Xcode pone
   `aps-environment = production` (en el repo es `development`). Cada subida
   necesita un **build nuevo**: subir `CURRENT_PROJECT_VERSION` (1, 2, 3…) en
   Debug y Release de `project.pbxproj`; `MARKETING_VERSION` (1.0) solo cambia
   con una versión nueva en la tienda. Si a la subida le falta algo (un texto
   de permiso, una razón del manifiesto), App Store Connect lo dice por correo.
9. **TestFlight**: el build aparece tras unos minutos de proceso. Probadores
   internos (hasta 100 del equipo de App Store Connect) al momento; externos,
   tras una revisión beta. Probar en un iPhone: que carga `/app`, el modo avión
   (página de «Sin conexión»), Iniciar sesión con Apple, el permiso de avisos y
   que llega uno, un Universal Link desde Notas, pasar lista con la cámara (con una cuenta de instructora) y la
   cuenta de revisión con su código fijo.
10. **Enviar a revisión**: en la versión 1.0, elegir el build, rellenar «App
    Review Information» (la cuenta de revisión) y «Submit for Review».

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

- **Borrar la cuenta desde la app** (guía 5.1.1(v)): Perfil › Privacidad y datos ›
  «Borrar mi cuenta de Tentare» (#2512, `app/api/public/cuenta/borrar`).
- **Acceso de la revisión de Apple**: `/api/auth/otp/verificar` con las variables
  `APP_REVIEW_*` (ver su sección).

Pendiente (lo hace el fundador, pasos 4–6 de «Primer envío»): `APPLE_TEAM_ID` y
las cuatro `APNS_*` en Vercel, y el proveedor Apple de Supabase con `app.tentare`
en sus Client IDs.

## Iconos y pantalla de arranque

```sh
npm run iconos:ios
```

Sale del kit de marca (`docs/marca/`), como `scripts/regenerar-marca.mjs`: icono
de 1024 px a sangre y **sin canal alfa** (App Store Connect rechaza un icono con
transparencia) y arranque claro y oscuro de 2732 px.

## Revisión

Los pasos para subir y enviar están en «Primer envío», arriba. Para la ficha:
capturas de iPhone 6,9" (la app es solo de iPhone), URL de privacidad y de
soporte, «App Privacy» y la cuenta de prueba.

Puntos de la revisión que tocan a esta app:

- **4.2 (funcionalidad mínima)**: una web metida en una app se rechaza si no
  aporta nada. Aquí aportan push, Iniciar sesión con Apple, «+ Calendario» con la
  hoja de iOS, la cámara con la que la instructora pasa lista escaneando el QR de
  sus alumnas, el brillo al máximo cuando la alumna enseña su QR, «Texto más grande» y el gesto de volver (ver «Lo de la app de la alumna
  que solo existe en el iPhone»). Conviene decírselo al revisor en las notas.
- **4.8**: si se ofrece Google, hay que ofrecer también Iniciar sesión con Apple.
- **3.1.3(e)**: clases y cuotas son servicios que se consumen fuera de la app,
  así que se cobran con Stripe, sin compras dentro de la app.
- `ITSAppUsesNonExemptEncryption = false` en `Info.plist`: la app solo usa
  HTTPS, y así no pregunta por exportación de cifrado en cada subida.

### Guía 1.2 (contenido generado por usuarios): dónde está cada pieza

La app tiene chat (alumna ↔ estudio, alumna ↔ instructora) y un tablón con
comentarios, así que la revisión pide cuatro cosas. Dónde vive cada una, para
enseñárselo al revisor y para no romperlo sin darse cuenta:

| Lo que pide Apple | En la app | En el código |
| --- | --- | --- |
| Normas que se aceptan antes de publicar, con tolerancia cero | Hoja «Normas de la comunidad» la primera vez que se escribe en el chat o en el tablón; también en Ayuda | `lib/moderacion/normas.ts`, `normas-servidor.ts` (las exige el SERVIDOR al enviar: 409 `NORMAS_PENDIENTES`) |
| Filtro de contenido | Un mensaje o comentario con palabras no permitidas no se guarda y se dice por qué | `lib/moderacion/filtro.ts` (422 `FILTRO`) |
| Denunciar | Tocar un mensaje o un comentario de otra persona → «Denunciar» → «Gracias. Lo revisaremos.» | `lib/moderacion/chat-servidor.ts`, `lib/comunidad/comentarios-servidor.ts` → `registrarDenuncia` |
| Bloquear | Chat con su instructora y tablón: «Bloquear a …» con confirmación; se deshace en Perfil › Privacidad y datos › «Personas bloqueadas» | `conversacion_participantes.bloqueo_en` (+ trigger que impide escribir) y `socio_companeras` |
| Actuar sobre lo denunciado en 24 h | El estudio decide en Inicio (bandeja «por decidir»): mantener, retirar o cerrar la conversación. Si no lo hace en 24 h, o si la denuncia va contra el propio estudio, la revisa Tentare en `/interno/denuncias`. La alumna recibe aviso de lo decidido | `resolver_denuncia` (migr `20261006014051`), `HORAS_REVISION_ESTUDIO`; alarma `denuncias-esperando-a-tentare` y `denuncias-sin-revisar-48h` en `/api/health/flujos`, que manda a Sentry el digest de mensajes |
| Contacto del desarrollador | Ayuda › «Normas y contacto»: Tentare como desarrollador de la app | `CONTACTO_TENTARE` (`components/student/domain/NormasComunidad.tsx`) |

Lo que el revisor tiene que poder probar con la cuenta de prueba: escribir al
estudio (y aceptar las normas), denunciar un mensaje, comentar en el tablón,
borrar su comentario, denunciar o bloquear a otra alumna, y desbloquearla.
Para eso la cuenta de prueba necesita un estudio con al menos una publicación
con un comentario de otra alumna, y un mensaje del estudio en su hilo.

Decisiones de producto que van con esto (5-oct-2026): el hilo de la alumna con
su estudio se denuncia pero no se bloquea (es el canal del servicio); con una
alumna menor de 14 años no se abre un chat con instructora (los mensajes van
por el estudio); en las publicaciones para un grupo, cada alumna ve solo sus
comentarios y los del estudio; «silenciar» en el tablón no existe (bloquear y
moderar cubren la 1.2).

⚠️ Releer el texto vigente de las guías 1.2, 4.5.4 y 5.1.1(v) en
developer.apple.com antes de cada envío a revisión y cruzarlo con esta tabla:
este resumen se escribió sin poder abrirlas.

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
- **«+ Calendario» de un toque**: en iOS 17 o más, la hoja de iOS para añadir
  un evento, ya rellena (`createEventWithPrompt`), que no pide acceso al
  calendario ni guarda nada; en iOS 15 y 16 (ahí esa hoja va dentro de la app y
  sin acceso no tiene dónde guardar) o si la hoja falla, el .ics por la hoja de
  compartir, como antes (`lib/student/calendario-dispositivo.ts`). ⚠️ Probar en
  un iPhone con iOS 17+ y en uno con iOS 15/16.
  Los tres textos `NSCalendars*UsageDescription` siguen en `Info.plist` aunque la
  app no pida acceso: el binario del plugin hace referencia a las APIs de
  permiso de EventKit, y App Store Connect rechaza la subida (ITMS-90683) si
  falta el texto de una API referenciada. Si se quita el plugin, se quitan.
  La sincronización automática («Mis reservas en mi calendario») se RETIRÓ de
  esta tanda: con datos reales podía borrar o duplicar eventos de la alumna
  (consultas que fallan a medias, clases canceladas, cerrar sesión, eventos
  añadidos a mano) y necesita su propio diseño y una prueba en un iPhone.
- **Brillo al máximo** al enseñar el QR de acceso (Perfil → QR y el detalle de una
  reserva activa); vuelve el de antes al salir de la pantalla y también al salir
  de la app con el QR abierto (`visibilitychange`), y se vuelve a subir al volver.
  Comprobar en un iPhone que WKWebView emite `visibilitychange` al pasar a segundo
  plano; si no, añadir `App.addListener('pause')`.

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

Compila en el simulador (Debug) y se archiva en Release sin firmar (7-oct-2026),
y en el simulador carga producción. Lo que solo se puede probar con la cuenta de
Apple y un iPhone (paso 9 de «Primer envío»): la firma y la subida, Iniciar
sesión con Apple (el plugin propio, necesita la capacidad en el App ID), el
registro de push y que llegue un aviso (APNs de producción), un Universal Link
desde Notas (necesita `APPLE_TEAM_ID`), y la cuenta de revisión contra
producción (necesita la alumna de demo y las variables).
