# META_SETUP.md — Configuración manual requerida en Meta Developer Dashboard

Fase C del plan de migración a WhatsApp Embedded Signup v4 ([WHATSAPP_AUDIT.md](WHATSAPP_AUDIT.md)).
Este documento NO es implementación — son los pasos que **una persona** debe completar a mano
en developers.facebook.com y business.facebook.com antes de que el código de las Fases D-J
tenga algo real contra lo que funcionar. Cada afirmación va con su fuente oficial; donde la
documentación de Meta no da un valor exacto (nombres de botones, ubicación de menús — cambian
sin aviso), se marca explícitamente como "verificar en el dashboard en el momento".

⚠️ Meta deprecará **Embedded Signup v2 el 15 de octubre de 2026**. Todo lo de abajo es
exclusivamente v4 — no reutilizar configuración ni tutoriales de v2.

---

## 0. Roles que hacen falta (antes de tocar nada)

- **Tentare como Tech Provider / Solution Partner**: la propietaria del estudio nunca crea
  su propia app de Meta — Tentare tiene UNA app, y cada estudio se "incorpora" (onboards)
  a ella vía Embedded Signup. Esto ya está asumido en el diseño de Fase A/B (BYO-credenciales
  por estudio, una sola Meta App para toda la plataforma).
- Alguien con acceso de administrador al **Meta Business Manager de Tentare** (la empresa,
  no la de ningún estudio cliente) y al **App Dashboard** de developers.facebook.com.

## 1. Crear/preparar la Meta App

1. En [developers.facebook.com/apps](https://developers.facebook.com/apps), crear una app
   de tipo **Business** (o usar una existente si Tentare ya tiene una app de Meta para otro
   propósito — verificar antes de crear una nueva y duplicar superficie de mantenimiento).
2. Añadir el producto **WhatsApp** a la app.
3. Añadir el producto **Facebook Login for Business** — es el producto que sostiene
   Embedded Signup (confirmado: "Embedded Signup... uses the Facebook Login for Business
   product and our JavaScript SDK").
4. Anotar el **App ID** y el **App Secret** (Configuración → Básica). Son los valores para
   `META_APP_ID`/`META_APP_SECRET` (Fase D, nunca en el cliente).

## 2. Crear la configuración de Facebook Login for Business (`config_id`)

Esto reemplaza cualquier configuración de v2 — v4 exige una configuración nueva
("to migrate from v2 to v4... create a new Facebook Login for Business Configuration, and
select your desired products").

1. En el App Dashboard → **Facebook Login for Business** → Configuraciones → crear una
   nueva. Meta ofrece una plantilla lista: **"WhatsApp Embedded Signup Configuration With
   60 Expiration Token"** — usar el botón "Create from template" con esa plantilla como
   punto de partida en vez de configurar todo desde cero.
2. Seleccionar el **producto WhatsApp** dentro de esa configuración (v4 permite además
   Conversions API / Click-to-WhatsApp Ads / Click-to-Messenger Ads en el mismo flujo — no
   marcarlos salvo que Tentare vaya a usarlos; cada producto añadido amplía lo que la
   propietaria del estudio ve/autoriza en el popup, y el objetivo del producto es que solo
   vea "conectar WhatsApp").
3. Elegir el **tipo de token**: **System-user access token** (no "User access token") —
   es el que da un Business Integration System User Token de larga duración sin
   re-autenticación futura, coherente con que el cron de recordatorios corre sin que la
   propietaria esté presente.
4. Seleccionar los **permisos** (scopes) que la configuración va a pedir:
   - `whatsapp_business_management` — gestión del WABA y plantillas de mensajes.
   - `whatsapp_business_messaging` — envío/recepción de mensajes y gestión del número.
   - `business_management` — necesario para que el System User pueda operar sobre activos
     del negocio del cliente (confirmado como uno de los tres permisos requeridos para
     generar el System User Access Token).
5. Guardar. El **Configuration ID** resultante es el valor de `META_CONFIG_ID`
   (Fase D, usado en `FB.login({ config_id: ... })` desde el cliente — este ID SÍ es seguro
   de exponer en el navegador, no es un secreto).

⚠️ La UI exacta de este paso (nombres de menú, posición de botones) puede haber cambiado
desde que se escribió la documentación consultada — verificar contra el dashboard real en
el momento de hacerlo, no seguir esta lista como capturas de pantalla literales.

## 3. App Domains / dominios permitidos

- En Configuración básica de la app → **App Domains**: añadir el dominio de producción de
  Tentare (el dominio real, `tentare.app`, según ya documentado en memoria del proyecto
  como plataforma real de producción — no `vercel.app` genérico).
- En **Facebook Login for Business** → Configuración → **Valid OAuth Redirect URIs**: si el
  flujo de Embedded Signup usa el JS SDK con popup (no redirect completo de página), esto
  puede no aplicar igual que en un login OAuth clásico — **verificar en el dashboard si el
  producto exige un redirect URI de todos modos**; la documentación consultada no lo detalla
  para el flujo de popup con `FB.login`.
- Para probar en local/preview (Vercel preview deployments), ya existe precedente en este
  repo con Turnstile de que el captcha se exige a nivel de proyecto y hay que dar de alta
  cada origen — aplicar el mismo cuidado aquí: los dominios de preview de Vercel
  probablemente necesiten registrarse aparte, o probarse solo contra producción/staging fijo.

## 4. Permisos y modo Live — App Review

- En modo **Development**, la app puede probar el flujo completo con roles de prueba (admins/
  testers de la app) sin App Review.
- Para que **cualquier propietaria real** pueda completar Embedded Signup, la app debe estar
  en modo **Live**, y en modo Live **solo aparecen en el flujo los permisos que ya tienen
  Advanced Access aprobado por App Review** ("once you switch your app to live mode, only
  permissions that have been approved for advanced access through the App Review process
  will appear in the flow"). Sin este paso, el popup de Embedded Signup en producción
  simplemente no pedirá `whatsapp_business_management`/`whatsapp_business_messaging`.
- Solicitar **App Review** para los 2-3 permisos de §2.4 antes de cualquier plan de rollout
  a estudios reales (Fase de "producción controlada" del plan original). Preparar caso de
  uso, capturas del flujo y justificación de negocio — Meta lo pide como parte de la
  solicitud (contenido exacto del formulario fuera del alcance de este documento, se rellena
  en el dashboard en el momento).

## 5. Business Verification

- Completar la **verificación de negocio** de la empresa Tentare en Meta Business Manager.
- Confirmado en la documentación: completar Business Verification junto con App Review y
  Access Verification **eleva el límite de onboarding de 10 a 200 clientes por cada ventana
  de 7 días**. Sin esto, el rollout progresivo del plan (Fase 22: 1 interno → 1 beta → 5 →
  producción) se topa con un techo de 10 estudios/semana total de la plataforma, no por
  estudio — hacerlo con margen antes de escalar más allá de un puñado de estudios piloto.

## 6. Webhook (para cuando se implemente en Fase D/E)

- En el producto WhatsApp de la app → Configuración → **Webhooks**: dar de alta la URL de
  producción (`https://tentare.app/api/webhooks/whatsapp` o la ruta que se decida en Fase D)
  y un **Verify Token** — este es el valor para `META_WEBHOOK_VERIFY_TOKEN`. Meta hace un GET
  con `hub.challenge`/`hub.verify_token` contra esa URL al guardar; el endpoint debe existir
  y responder correctamente ANTES de intentar guardar el webhook en el dashboard (si no,
  Meta rechaza el alta).
- Suscribir campos relevantes: como mínimo `messages` (estado/entrega/entrantes). Ampliar
  según lo que Fase D decida procesar.
- **Por cliente/WABA**: además de configurar el webhook a nivel de app, cada WABA de un
  estudio necesita que la app se suscriba explícitamente a sus eventos vía
  `POST /<WABA_ID>/subscribed_apps` (llamada server-to-server, esto SÍ es código de Fase D,
  no configuración manual — se documenta aquí porque sin este paso el webhook nunca recibe
  eventos de un WABA de cliente recién conectado, aunque la URL esté bien configurada a
  nivel de app).

## 7. Registro del número (paso posterior a Embedded Signup, por WABA)

Confirmado en la guía oficial de onboarding como Tech Provider — flujo de 5 pasos tras
recibir el `code` de un cliente:

1. Intercambiar `code` → Business Integration System User token (`GET /oauth/access_token`
   con `client_id`, `client_secret`, `code` — código de Fase D).
2. `POST /<WABA_ID>/subscribed_apps` (§6, código de Fase D).
3. **Registrar el número de teléfono** vía `POST /<PHONE_NUMBER_ID>/register` con un PIN de
   6 dígitos — necesario para que el número quede operativo para enviar/recibir. Esto es
   código de Fase D, pero requiere que el flujo de UI (Fase H) contemple el caso donde este
   paso falla o queda pendiente, no solo "conectado sí/no".
4. Opcional: mensaje de prueba para confirmar que el número entrega correctamente.
5. **Método de pago**: la propietaria del estudio tiene que añadir un método de pago en
   WhatsApp Manager para que su WABA pueda enviar mensajes de plantilla más allá de la capa
   gratuita — esto NO lo puede hacer Tentare en su nombre; es un paso que la propietaria
   completa ella misma fuera de Tentare. La UI (Fase H) debe comunicarlo claramente como
   parte de "conectado" ≠ "puede enviar sin límite" si aplica.

## 8. Plantilla `recordatorio_clase` por WABA — riesgo abierto, no resuelto aquí

El audit de Fase A ya marca esto como riesgo sin confirmar: **no está verificado si una
plantilla aprobada en un WABA se hereda a otro WABA nuevo, o si cada WABA de cada estudio
necesita su propia aprobación de `recordatorio_clase` en WhatsApp Manager.** La documentación
consultada en esta Fase C no lo aclara (las plantillas son un recurso del WABA, no de la
app — lo que sugiere que sí hace falta re-aprobarla por WABA, pero no está confirmado con
una fuente directa). **Verificar en vivo con el primer estudio piloto real antes de asumir
que los recordatorios funcionan automáticamente tras conectar un WABA nuevo.** Si hace falta
re-aprobación por WABA, hay que documentar en la UI de Tentare cómo la propietaria da de alta
esa plantilla en su WhatsApp Manager (mismo texto exacto: «Recordatorio · {{1}}. Tienes {{2}}
el {{3}} a las {{4}} en {{5}}.», categoría Utilidad, español).

## 9. Variables de entorno resultantes (para Fase D, en Vercel)

| Variable | Origen | Secreto |
|---|---|---|
| `META_APP_ID` | §1 — usada server-side en `lib/whatsapp.ts::intercambiarCodigoWhatsApp` | No, pero sin prefijo `NEXT_PUBLIC_` no llega al navegador |
| `NEXT_PUBLIC_META_APP_ID` | Mismo valor que `META_APP_ID`, duplicado con el prefijo que Next.js exige para exponerlo al cliente (`FB.init`) | No |
| `META_APP_SECRET` | §1 | **Sí — solo servidor, nunca `NEXT_PUBLIC_`** |
| `NEXT_PUBLIC_META_CONFIG_ID` | §2.5 — va al cliente, en `FB.login({config_id:...})` | No |
| `META_WEBHOOK_VERIFY_TOKEN` | §6, elegido por Tentare al dar de alta el webhook | **Sí — solo servidor** |
| `WHATSAPP_API_VERSION` | Ya existe hoy (`lib/whatsapp.ts:14`), opcional, default `v21.0` | No |

⚠️ **Hay que dar de alta CUATRO variables en Vercel, no dos**, porque Next.js
solo expone al navegador las que llevan el prefijo `NEXT_PUBLIC_` — `META_APP_ID`
(servidor, en `/api/integrations/whatsapp/embedded-signup`) y
`NEXT_PUBLIC_META_APP_ID` (cliente, en `lib/hooks/use-whatsapp-embedded-signup.tsx`)
llevan el MISMO valor del App ID, duplicado a propósito; `META_CONFIG_ID` no
hace falta en servidor (solo lo usa el cliente), así que basta con
`NEXT_PUBLIC_META_CONFIG_ID`. Sin las variables `NEXT_PUBLIC_*`, el botón
"Conectar WhatsApp" simplemente no aparece y la pantalla cae al flujo manual
existente (degradación explícita, no un error).

## 10. Cómo probar en development antes de producción

- Con la app en modo **Development**, añadir a la propietaria de prueba (o su cuenta de
  Meta) como **tester** de la app en App Roles — así puede completar Embedded Signup sin
  que la app esté Live ni tenga App Review aprobado todavía.
- Usar un WABA/número de prueba propio de Tentare (no el de un estudio real) para el primer
  recorrido end-to-end: conectar → validar contra Graph API → guardar en `integraciones` →
  enviar un recordatorio de prueba → confirmar webhook de entrega.
- Solo tras esto, pasar a App Review (§4) y Business Verification (§5) para abrir el flujo a
  estudios reales, siguiendo el rollout progresivo ya definido en el plan original (interno
  → beta → 5 estudios → producción).

## Fuentes consultadas (documentación oficial de Meta, agosto 2026)

- [Embedded Signup — Overview](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview/)
- [Embedded Signup — Implementation](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/implementation/)
- [Embedded Signup — Version 4](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/version-4/)
- [Onboarding Customers as a Tech Provider](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-customers-as-a-tech-provider/)
- [WhatsApp Business Platform — Access Tokens Guide](https://developers.facebook.com/documentation/business-messaging/whatsapp/access-tokens/)
- [Facebook Login for Business](https://developers.facebook.com/documentation/facebook-login/facebook-login-for-business)

Donde esta documentación no da un detalle exacto (UI del dashboard, redirect URIs para el
flujo de popup, contenido del formulario de App Review), se marca explícitamente arriba —
no se ha inventado ningún valor.
