# Auditoria de seguridad -- 56a pasada (2026-09-11)

## Area elegida y por que

Se descartaron por saturacion (ya cubiertas a fondo en pasadas anteriores):
Notification Engine, Modulo de Contenido, zip-parser de temas, `crear_recuperacion`,
RPCs SECURITY DEFINER sin chequeo de rol, Veri*Factu/AEAT, clickjacking/proxy,
Decision OS piloto automatico, RLS/GRANT de billing de `studios`/`cadenas`,
Tentare Network, e inventario `ALL + tenant sin rol` (49a-55a).

De las candidatas propuestas se recorrieron primero, y se descartaron por estar
ya endurecidas (verificado leyendo el codigo real, no solo el nombre del
endpoint):

- **Backups** (`app/api/backups/create`, `app/api/backups/restore`,
  `app/api/cron/backups`): las tres exigen `sesion.rol === 'PROPIETARIO'`
  (create/restore) o secreto de cron valido (`SUPABASE_CRON_SECRET`), y
  `restore` acota el backup leido con `.eq('studio_id', sesion.studioId)` antes
  de restaurar -- sin hueco cross-tenant. El propio comentario de cabecera
  documenta que esto ya se corrigio en una pasada anterior.
- **Exportacion de datos** (`app/api/exportar/mis-datos`): solo PROPIETARIO,
  `studioId` siempre de la sesion (nunca de la query), rate-limited (20/60s).
  Sin hueco.
- **Stripe Connect onboarding** (`app/api/stripe/connect/callback`,
  `app/api/integrations/oauth-state`): el `state` OAuth va firmado y ligado al
  `studioId` de quien lo emitio (solo PROPIETARIO puede emitirlo), y el
  callback rechaza cualquier `state` ausente, manipulado o caducado (C-8, ya
  auditado y cerrado). `dbSetStripeAccountId` comprueba el resultado real
  (D-7, 22a pasada) en vez de asumir exito.

Se continuo entonces por el resto de la superficie de **integraciones
externas** (`app/api/integrations/**`: Klaviyo, Mailchimp, Google Calendar,
Gmail, Zoom, WhatsApp Embedded Signup, Kisi) -- 20 rutas en total, la mayoria
con el comentario explicito "mismo limite que el resto de endpoints de
integraciones: PROPIETARIO", senal de que hubo una pasada anterior que
retrofito ese chequeo en varias de ellas (`kisi/probar`, `mailchimp/probar`,
`mailchimp/sync`, `whatsapp/probar`, `whatsapp/embedded-signup`,
`klaviyo/disconnect`, `google-calendar/disconnect`, `zoom/disconnect`,
`gmail/disconnect`, `oauth-state`). Comprobando ruta por ruta si esa pasada
llego a las 20, aparecieron **cinco que se quedaron fuera del retrofit**.

Metodologia: lectura de cada `route.ts` bajo `app/api/integrations/`,
`verificarSesionStaff` en `lib/auth-server.ts` (confirmado que resuelve sesion
para CUALQUIER rol de staff -- PROPIETARIO/MANAGER/RECEPCION/INSTRUCTOR, no
solo para la propietaria), cruce contra `lib/permisos-reglas.ts` (`puedeVer`)
para confirmar que la UI SI bloquea `/configuracion` a MANAGER/RECEPCION y no
lo incluye en la lista blanca de INSTRUCTOR -- es decir, las cinco rutas son
alcanzables solo saltandose la UI (llamada directa a la API con el token de
sesion real de un rol no-propietario), exactamente el patron que este repo ya
documenta como el mas repetido. Verificado en vivo contra
`dwqvdycjcffqwfkzapvi` con `execute_sql` que la policy `owner_integraciones`
(la unica de la tabla `integraciones`) SI exige `current_rol() = 'PROPIETARIO'`
-- es decir, el propio codigo ya sabe que este es el limite correcto para esta
familia de acciones (todas usan `getSupabaseAdmin()`, que salta esa RLS, por
eso hace falta repetir el chequeo en TS).

## Hallazgos

### 🟠 IMPORTANTE -- `gmail/sync-contacts`: cualquier rol de staff puede volcar la libreta de contactos de Gmail del estudio como clientas nuevas

Archivo: `app/api/integrations/gmail/sync-contacts/route.ts:17-24` (POST).

Solo comprueba `if (!sesion) return 401` -- sin `sesion.rol !== 'PROPIETARIO'`.
Con eso, lee los contactos de la cuenta de Gmail QUE LA PROPIETARIA conecto
(`getValidAccessToken` + `listarContactosGmail`), deduplica contra `socios`
existentes y hace un **INSERT real** en `socios` (`admin.from('socios').insert(lote)`,
service-role, sin RLS) por cada contacto nuevo -- filas de verdad, visibles
luego en el CRM del estudio.

Impacto real: un INSTRUCTOR o un RECEPCION (roles a los que la UI bloquea
`/configuracion` por completo -- `BLOQUEADO_RECEPCION`/`BLOQUEADO_MANAGER`
incluyen `/configuracion`, y `PERMITIDO_INSTRUCTOR` no lo incluye) puede, con
su propio token de sesion valido, hacer `POST /api/integrations/gmail/sync-contacts`
directamente y:
- Volcar la agenda de contactos PERSONAL de la propietaria (no solo la
  profesional) como fichas de clienta, sin que ella lo pida ni se entere hasta
  revisar el listado.
- Repetirlo en bucle (sin `enforceRateLimit`, a diferencia de
  `exportar/mis-datos` o `kisi/abrir`) para inflar el recuento de socias y
  acercar al estudio al limite de su plan (`bloqueoPorLimiteSocias` solo
  bloquea cuando YA se supera el limite, no evita el primer abuso).

Por que no lo frena nada mas: la RLS de `socios` no aplica (cliente
service-role); la UI que "ya lo filtra" es exactamente eso, solo UI. Ninguna
comprobacion de rol vive en el servidor para esta ruta en concreto, a
diferencia de su hermana de calendario (`google-calendar/sync`, ver abajo,
que tampoco la tiene) o de sus primas ya corregidas
(`mailchimp/sync`, `klaviyo/disconnect`).

Verificado leyendo el codigo y confirmando con `grep` que no hay ningun otro
guard antes del `insert`; no se ha ejecutado el POST real contra produccion
(exigiria una cuenta Gmail conectada real y crearia socios reales sin forma
limpia de revertir el insert vía `execute_sql`+`ROLLBACK`, al ser una llamada
HTTP con efectos externos en Gmail, no una transaccion SQL).

### 🟠 IMPORTANTE -- `klaviyo/sync`: cualquier rol de staff puede forzar el envio de PII de todas las clientas a Klaviyo

Archivo: `app/api/integrations/klaviyo/sync/route.ts:26-33` (POST).

Mismo patron: solo `if (!sesion) return 401`, sin chequeo de rol. Comparese
con su gemela casi identica `app/api/integrations/mailchimp/sync/route.ts:15-18`,
que SI tiene `if (sesion.rol !== 'PROPIETARIO') return 403` justo despues del
401 -- literalmente el mismo flujo de negocio (subir nombre/email/telefono de
socias con consentimiento vigente a una lista de marketing externa),
implementado dos veces, con el guard puesto en una copia y olvidado en la
otra.

Impacto real: un MANAGER o RECEPCION (bloqueados de `/configuracion` en la UI)
puede disparar la sincronizacion completa hacia la cuenta de Klaviyo que la
propietaria conecto, sin su autorizacion para ESE acto concreto. El propio
filtro de consentimiento (`tieneConsentimientoMarketingVigente`) sigue
aplicandose -- no es una fuga de datos SIN consentimiento -- pero es una
accion de negocio (enviar datos a un tercero) que el propio diseno del
producto reserva a la propietaria, y aqui cualquier staff puede forzarla sin
pedir permiso, en cualquier momento.

### 🟡 MENOR -- `google-calendar/sync`: mismo hueco de rol, impacto mas bajo

Archivo: `app/api/integrations/google-calendar/sync/route.ts:503-505` (POST).

Solo `if (!sesion) return 401`. Cualquier staff puede forzar la sincronizacion
de las proximas 4 semanas de clases contra el Google Calendar personal que la
propietaria conecto (crea/actualiza/borra eventos). No hay PII de clientas en
juego (solo tipo de clase/sala/instructora/horario, datos que ese mismo staff
ya ve en el calendario del panel), asi que se califica como menor y no
importante -- el dano real es nuisance (duplicados si algo falla a mitad,
consumo de cuota de la API de Google) y una accion no autorizada sobre una
cuenta externa de la propietaria, no una fuga de datos sensibles.

### 🟡 MENOR -- `zoom/probar`: mismo hueco de rol, sin dato expuesto

Archivo: `app/api/integrations/zoom/probar/route.ts:15-16` (POST).

Solo `if (!sesion) return 401`, sin chequeo de rol -- a diferencia de
`mailchimp/probar` y `kisi/probar`, cuyo propio comentario dice explicitamente
"Mismo limite que el resto de endpoints de integraciones: PROPIETARIO" y SI lo
aplican. `probarZoom` solo llama a `GET /users/me` contra la cuenta Zoom
conectada y devuelve `{ ok: true/false }` -- no expone tokens ni datos, asi que
el impacto real es minimo (un staff no-propietario puede disparar una llamada
de prueba contra la API de Zoom del estudio), pero es la misma clase de bug
que ya se corrigio en las rutas hermanas y aqui se quedo sin tocar.

### 🟡 MENOR -- `gmail/test`: mismo hueco de rol, impacto minimo (se envia solo a si mismo)

Archivo: `app/api/integrations/gmail/test/route.ts:7-9` (POST).

Solo `if (!sesion) return 401`. Envia un correo de prueba usando el Gmail
conectado del estudio, pero SIEMPRE de `studio.gmail_email` A
`studio.gmail_email` (a si mismo) -- por diseno, nunca llega a una clienta
real. El unico efecto de que un staff no-propietario lo dispare es un envio
no autorizado usando cuota/credenciales de un tercero (Google), sin fuga de
datos ni destinatario controlable por el llamador.

## Checklist -- verificado y descartado

- OK `app/api/backups/{create,restore}` y `app/api/cron/backups`: rol/secreto
  comprobados en servidor, sin cruce cross-tenant. Sin hallazgos.
- OK `app/api/exportar/mis-datos`: PROPIETARIO + `studioId` de sesion + rate
  limit. Sin hallazgos.
- OK `app/api/stripe/connect/callback` + `app/api/integrations/oauth-state`:
  `state` firmado y ligado al `studioId` del emisor (solo PROPIETARIO emite),
  callback verifica firma/caducidad antes de vincular la cuenta Stripe.
  Resultado de `dbSetStripeAccountId` comprobado (no se asume exito). Sin
  hallazgos.
- OK RLS de `integraciones` (`owner_integraciones`, verificado en vivo con
  `execute_sql` contra `dwqvdycjcffqwfkzapvi`): `ALL` con
  `current_rol() = 'PROPIETARIO' AND studio_id = current_studio_id()` en
  `qual` y `with_check` -- el guardado directo de credenciales (que pasa por
  el cliente normal, no por `getSupabaseAdmin()`) esta bien protegido; el
  problema esta unicamente en las 5 rutas de servidor que usan service-role
  y se olvidan de repetir el chequeo que la RLS ya hace por ellas.
- OK `app/api/integrations/config` (GET): PROPIETARIO + `studioId` de sesion,
  y ademas oculta el token de WhatsApp cuando la conexion es por Embedded
  Signup. Sin hallazgos.
- OK `app/api/integrations/kisi/abrir`: sin chequeo de rol, pero es
  intencional -- abrir la puerta en el check-in de recepcion es una operacion
  operativa de mostrador, no de configuracion, y coincide con el uso real
  (RECEPCION/INSTRUCTOR hacen check-in). No se trata como hallazgo.
- OK `app/api/integrations/{kisi,mailchimp,whatsapp}/probar`,
  `mailchimp/sync`, `{klaviyo,google-calendar,zoom,gmail}/disconnect`,
  `whatsapp/embedded-signup`, `oauth-state`: todas comprueban
  `sesion.rol === 'PROPIETARIO'` en servidor. Sin hallazgos.
- OK `app/api/integrations/{klaviyo,google-calendar,zoom,gmail}/callback`:
  no llevan sesion de staff (son el retorno del navegador tras el OAuth,
  antes de que exista sesion de vuelta) -- correcto que se apoyen solo en el
  `state` firmado, no en `verificarSesionStaff`. Sin hallazgos.
- ATENCION: Cinco rutas SIN el chequeo de rol que su propio patron de hermanas
  exige (ver Hallazgos arriba): `gmail/sync-contacts`, `klaviyo/sync`,
  `google-calendar/sync`, `zoom/probar`, `gmail/test`.

## Conclusion

Ningun hallazgo es cross-tenant (todas las rutas afectadas usan
`sesion.studioId`, nunca un id de otro estudio) ni permite escalada de rol
propia -- son casos puros de "rol no comprobado en servidor" dentro del PROPIO
estudio: un INSTRUCTOR o RECEPCION legitimo de un estudio real puede ejecutar,
sobre los datos y cuentas externas de SU MISMO estudio, una accion que el
producto reserva explicitamente a la propietaria. El de mayor impacto real es
`gmail/sync-contacts` (escribe filas nuevas en `socios`, sin rate limit, y
puede volcar contactos personales de la propietaria) seguido de `klaviyo/sync`
(exporta PII de clientas -- con consentimiento, pero sin autorizacion del acto
en si -- a un tercero). Los otros tres (`google-calendar/sync`, `zoom/probar`,
`gmail/test`) tienen el mismo hueco de autorizacion pero impacto bajo por la
naturaleza de los datos/acciones implicadas.

No hay ningun hallazgo critico (rojo) que exija accion inmediata (no hay
dinero, no hay ficha clinica, no hay cruce entre estudios). Los dos
importantes (naranja) se recomiendan para arreglo en el siguiente ciclo: es
literalmente copiar la linea
`if (sesion.rol !== 'PROPIETARIO') return NextResponse.json({ error: '...' }, { status: 403 });`
que ya existe en `mailchimp/sync` (para `klaviyo/sync`) y en
`mailchimp/probar`/`kisi/probar` (para el resto), sin necesitar migracion ni
cambio de esquema.
