# API pública de Tentare (v1)

Esta API sirve para que un programa externo (de contabilidad, de BI, Zapier…) lea los datos de **un estudio** sin que nadie exporte nada a mano. La especificación OpenAPI completa está en **`GET /api/v1/openapi.json`**: se puede abrir con Swagger UI, con Postman o con un generador de clientes.

> Para quien mantiene Tentare: el diseño está al final, en «Por dentro».

## Autenticación

Cada petición lleva su credencial en esta cabecera:

```
Authorization: Bearer <credencial>
```

Hay dos tipos de credencial, y las dos abren la misma API:

| Credencial | Cómo se consigue | Para qué |
|---|---|---|
| **Clave de API** (`tnt_sk_…`) | La crea la propietaria en Configuración → Conexiones → «API para tu contabilidad». | Un programa servidor a servidor: la contabilidad o un script. |
| **Token OAuth** | Flujo Authorization Code + PKCE (`docs/oauth-arquitectura.md`). | Apps del catálogo (hoy, Zapier). |

Cómo funciona una clave de API:

- **Solo se enseña una vez, al crearla.** Tentare guarda únicamente su huella (SHA-256), así que no puede volver a mostrártela.
- **Se puede revocar.** Deja de valer al momento.
- **Se puede rotar.** Se crea otra con los mismos permisos y la antigua sigue valiendo 24 horas, para cambiarla en el programa sin cortar la sincronización.
- **Puede caducar** a los 30, 90 o 365 días, o no caducar nunca.

La API se activa estudio a estudio: si el estudio no la tiene activada, no se pueden crear claves. Desactivarla revoca todas las claves que llegan a esa sede, incluidas las de su cadena; si se vuelve a activar, hay que crear claves nuevas. Los tokens OAuth (Zapier) no dependen de esta activación.

**Cada petición va a una sola sede.** Un token OAuth o una clave de sede solo llegan a la suya. No hay ninguna forma de pedir datos de otro estudio.

### Claves de cadena

La dueña de una cadena puede crear una clave para **todas sus sedes**, en vez de una por sede. Con ella:

- **Cada petición dice a qué sede va**, con la cabecera `Tentare-Estudio: <id de la sede>`. Sin la cabecera, la petición se rechaza (400): leer en silencio una sola sede dejaría la contabilidad con un hueco que nadie ve.
- **`GET /estudios` lista las sedes** a las que llega la clave ahora mismo. Es la única ruta que no necesita la cabecera. El panel enseña también el código de cada sede.
- **Llega solo a las sedes de la cadena de las que la creadora es dueña y que tienen la API activada.** Una sede sin activar responde 403 `api_no_activada`; una sede que no es de la cadena, 404, sin decir si existe.
- **Si la creadora deja de ser la dueña de la cadena**, la clave deja de valer en todas las sedes.
- Los permisos, el límite de peticiones y la `Idempotency-Key` son los de cualquier clave. El límite es de la clave, no de cada sede (y cuentan también las peticiones rechazadas), y cada llamada queda en el registro de actividad de su sede.

Con un token OAuth o una clave de sede, la cabecera sobra. Si se manda, tiene que ser su propia sede.

## Permisos (scopes)

| Scope | Qué permite |
|---|---|
| `clientas:leer` | Clientas: nombre y contacto |
| `clientas:datos_fiscales` | Además, NIF y dirección de las clientas |
| `pagos:leer` | Recibos (cobros), devoluciones y ventas de la caja |
| `facturas:leer` | Facturas emitidas desde Tentare |
| `planes:leer` | Cuotas y bonos de las clientas, y el catálogo de tarifas |
| `reservas:leer` / `reservas:escribir` | Leer, crear y cancelar reservas |
| `clientas:escribir`, `notas:escribir`, `tareas:escribir` | Crear clientas, notas operativas y tareas |

Reglas de los permisos:

- **Una credencial nunca ve más que quien la concedió.** Un MANAGER no puede dar `pagos:leer`, `facturas:leer` ni `clientas:datos_fiscales`, porque en el panel tampoco ve esos datos. Si una app OAuth los pide y autoriza un MANAGER, la pantalla de consentimiento dice qué queda fuera y el token sale sin esos permisos (el campo `scope` de `/api/oauth/token` lo indica).
- **Cada app OAuth tiene una lista de permisos que puede pedir.** Lo que pida fuera de esa lista no se le da, autorice quien autorice: la pantalla de consentimiento lo dice. La lista se comprueba también en cada petición, así que recortarla vale al momento, incluso para los tokens ya emitidos. Hoy Zapier puede pedir lo que ya usaba y no los datos fiscales de las clientas ni las facturas.
- **Se comprueban en cada petición**, con el rol que esa persona tiene ese día. Si deja el estudio, o se queda sin ningún permiso que pueda dar, sus credenciales dejan de valer.
- **Las claves de API solo dan permisos de lectura**, y solo puede crearlas la propietaria.
- **Mover dinero no es posible.** No existe `pagos:escribir`.

## Recursos

Todas las rutas cuelgan de `https://tentare.app/api/v1`. El antiguo prefijo `/api/oauth/v1` sigue funcionando, con las mismas rutas.

| Ruta | Scope | Qué devuelve |
|---|---|---|
| `GET /estudio` | cualquiera | Datos fiscales del emisor, zona horaria, moneda, IVA por defecto y `modoFacturacion` |
| `GET /estudios` | cualquiera | Las sedes a las que llega la credencial (`id` y `nombre`). Con una clave de cadena, las de la cadena |
| `GET /clientas` | `clientas:leer` | Clientas |
| `GET /recibos`, `GET /recibos/{id}` | `pagos:leer` | Cobros (ver «Contabilidad» más abajo) |
| `GET /devoluciones` | `pagos:leer` | Reembolsos y contracargos, uno por cada hecho |
| `GET /ventas` | `pagos:leer` | Ventas de la caja, con sus líneas y el IVA de cada una |
| `GET /facturas`, `GET /facturas/{id}` | `facturas:leer` | Facturas, rectificativas incluidas |
| `GET /suscripciones` | `planes:leer` | Cuotas y bonos (un bono tiene `tipoPlan: BONO` y `sesionesRestantes`) |
| `GET /tarifas` | `planes:leer` | Catálogo de planes y bonos |
| `GET/POST /reservas`, `POST /reservas/cancelar` | `reservas:*` | Reservas, con la clase (inicio, fin y tipo), el check-in y el origen |
| `POST /clientas`, `POST /notas`, `POST /tareas` | `*:escribir` | Altas |
| `GET /planes` | `planes:leer` | **Obsoleto**: es `/suscripciones` con la forma antigua. Se mantiene por Zapier. |
| `GET /eventos` | el de cada recurso | Registro de lo que ha cambiado (ver «Eventos y webhooks») |

## Convenciones

- **Nombres** en español y en camelCase (`clientaId`, `fechaCobro`).
- **Importes en céntimos enteros**, siempre acompañados de `moneda`. Hoy la moneda es siempre `EUR`.
- **Fechas** de día en formato `AAAA-MM-DD`, en el día del estudio (`zonaHoraria` de `/estudio`, normalmente Europe/Madrid). Los instantes van en ISO 8601.
- **`null`** significa que el dato no existe. Nunca se usa un 0 inventado.

### Listados

Todos los listados devuelven un array JSON. La paginación va en cabeceras:

| Parámetro | Valor |
|---|---|
| `desde`, `hasta` | `AAAA-MM-DD`, los dos días incluidos, sobre la fecha propia del recurso |
| `orden` | `desc` (por defecto, lo más reciente primero) o `asc` |
| `limite` | 50 por defecto, 200 como máximo; un valor no válido usa el de por defecto |
| `cursor` | Valor de la cabecera `X-Siguiente-Cursor` de la página anterior |

Cabeceras de la respuesta: `X-Hay-Mas: true|false`, `X-Siguiente-Cursor` y `X-Request-Id`.

```bash
curl -H "Authorization: Bearer $TENTARE_CLAVE" \
  "https://tentare.app/api/v1/recibos?fecha=cobro&desde=2026-09-01&hasta=2026-09-30&orden=asc&limite=200"
```

### Errores

```json
{ "error": "insufficient_scope", "mensaje": "Esta credencial no tiene el permiso «pagos:leer».", "requestId": "…" }
```

| HTTP | `error` | Cuándo |
|---|---|---|
| 400 | `invalid_request` | Parámetro mal (fecha, cursor, estado…), o una clave de cadena sin la cabecera `Tentare-Estudio` |
| 401 | `invalid_token` | Falta la credencial, o está revocada o caducada, o quien la concedió ya no está en el estudio |
| 403 | `insufficient_scope` | La credencial no tiene ese permiso |
| 403 | `api_no_activada` | La API no está activada para el estudio (solo claves) |
| 403 | `estudio_sin_acceso` | El estudio está suspendido o no tiene suscripción activa |
| 404 | `not_found` | El recurso no existe **en este estudio**, o la credencial no llega a la sede de `Tentare-Estudio` |
| 409 | `request_in_progress` | Otra petición con la misma `Idempotency-Key` sigue en marcha; reintenta tras `Retry-After` |
| 422 | `idempotency_conflict` | Esa `Idempotency-Key` ya se usó con otra petición |
| 429 | `rate_limited` | Demasiadas peticiones; espera lo que indica `Retry-After` |
| 500 | `server_error` | Error nuestro; cita el `requestId` |

### Reintentos seguros: `Idempotency-Key`

Si un `POST` (crear una clienta, una reserva, una nota…) no te devuelve respuesta, no sabes si se hizo. Para poder reintentar sin duplicar, manda la cabecera `Idempotency-Key` con un valor único por operación, por ejemplo un UUID:

```bash
curl -X POST -H "Authorization: Bearer $TENTARE_CLAVE" -H "Content-Type: application/json" \
  -H "Idempotency-Key: 6f1c2b8e-1d0a-4c55-9a51-0b7c2f3e9d10" \
  -d '{"nombre":"…","email":"…"}' https://tentare.app/api/v1/clientas
```

- **Si reintentas con la misma clave y la misma petición**, recibes la respuesta del primer intento, con la cabecera `Idempotent-Replayed: true`, y no se crea nada dos veces.
- **Si usas la misma clave con otra petición** (otra ruta u otro cuerpo), recibes un 422 `idempotency_conflict`.
- **Si la primera petición todavía se está procesando**, recibes un 409 `request_in_progress`; reintenta tras `Retry-After`.
- **Si la primera falló con un 5xx**, no se guarda: el reintento vuelve a ejecutarse.
- **Ámbito y duración.** La clave vale para tu credencial (clave de API o app OAuth) y se guarda **24 horas**.
- **Es opcional.** Sin la cabecera, todo funciona como siempre.

### Límites

- 120 peticiones por minuto **por credencial** (20 en los endpoints que escriben).
- 600 por minuto por IP, antes de autenticar.

## Contabilidad: cómo sincronizar

1. **Lee `GET /estudio`.**
   - `modoFacturacion: verifactu`: Tentare emite las facturas y su registro va a la AEAT. Tu programa importa **facturas** (`/facturas`).
   - `modoFacturacion: sin_facturas`: Tentare **no** emite facturas. Las hace tu programa a partir de los **recibos cobrados**. Toma el IVA del tipo `ivaPorDefecto` del estudio, porque el recibo no lo desglosa.
2. **Ingresos: `GET /recibos?fecha=cobro`.**
   - Usa `importeIngresado`: es el importe ya restado lo devuelto, y vale 0 si no se ha cobrado.
   - `situacion` interpreta el estado: `COBRADO`, `POR_COBRAR`, `IMPAGADO` (rechazado o devuelto por el banco), `EN_CURSO` (el banco aún no ha contestado), `REEMBOLSADO` o `ANULADO`.
   - Un `DEVUELTO` **no** significa siempre que se devolvió el dinero: puede ser un adeudo que rechazó el banco, y ese dinero sigue debiéndose.
3. **Devoluciones: `GET /devoluciones`**, una por hecho y con su fecha. Úsalas para tus abonos.
4. **Caja (TPV): `GET /ventas`** da el detalle de lo vendido y del IVA de cada línea. **No sumes ventas y recibos**: cada venta pagada ya tiene su recibo (`reciboId`). Una venta pagada sin `reciboId` es una venta antigua que no tiene apunte en Tentare.
5. **Clientas: `GET /clientas`** con `clientas:datos_fiscales` para obtener NIF y dirección. La dirección es texto libre: Tentare no separa código postal, ciudad ni país.
6. **Cruzar con Stripe:** `stripePaymentIntentId` de cada recibo. Tentare no guarda la comisión de Stripe: los importes son brutos.

**Sincronización incremental.** Haz una carga inicial completa (con `orden=asc` y el cursor) y, a partir de ahí, entérate de los cambios con los **webhooks** o con el **registro de eventos** (`GET /eventos`), que se explican a continuación. Aun así, conviene reconciliar de vez en cuando (por ejemplo, una vez por semana) releyendo una ventana de días con los listados: es la red de seguridad de cualquier sincronización.

## Eventos y webhooks

Cada vez que cambia algo que la API enseña, Tentare registra un **evento**. Hay dos formas de recibirlos, y los eventos son los mismos en las dos:

- **Webhooks:** Tentare manda un `POST` firmado a la dirección de tu programa en cuanto pasa (normalmente en menos de un minuto). Los configura la propietaria en Configuración → Conexiones → «API para tu contabilidad».
- **Registro:** `GET /eventos` devuelve lo que ha pasado desde la última vez que preguntaste. Sirve si tu programa no puede recibir peticiones de fuera.

Los eventos se registran **solo en los estudios con la API activada**, y se guardan **30 días**.

### Tipos

| Recurso | Eventos | Permiso |
|---|---|---|
| Recibo (cobro) | `recibo.creado`, `recibo.actualizado`, `recibo.eliminado` | `pagos:leer` |
| Devolución | `devolucion.creada`, `devolucion.actualizada`, `devolucion.eliminada` | `pagos:leer` |
| Venta de la caja | `venta.creada`, `venta.actualizada`, `venta.eliminada` | `pagos:leer` |
| Factura | `factura.creada`, `factura.actualizada`, `factura.eliminada` | `facturas:leer` |
| Clienta | `clienta.creada`, `clienta.actualizada`, `clienta.eliminada` | `clientas:leer` |
| Reserva | `reserva.creada`, `reserva.actualizada`, `reserva.eliminada` | `reservas:leer` |
| Suscripción (cuota o bono) | `suscripcion.creada`, `suscripcion.actualizada`, `suscripcion.eliminada` | `planes:leer` |

- Hay un `*.actualizado` cuando cambia algún campo que la API enseña. Un recibo cobrado pasa a `estado: COBRADO`; mira `datos.situacion` para saber en qué ha quedado.
- Un cambio interno que no se ve en la API (un reintento de cobro programado, el recordatorio de una clase, la posición en la lista de espera) no genera evento.
- Reservas y suscripciones sirven para automatizaciones (Zapier) y BI, no para la contabilidad.
  - Una reserva cancelada es un `reserva.actualizada` con `datos.estado: CANCELADA`.
  - Gastar una sesión de un bono es un `suscripcion.actualizada` (`sesionesRestantes` baja).
  - Las reservas que llegan de ClassPass o Urban Sports Club también generan eventos, con `origen` de la plataforma y sin clienta. El nombre que manda la plataforma nunca sale.

### Forma de un evento

```json
{
  "id": "evt_8f2c…",
  "tipo": "recibo.actualizado",
  "creadoEn": "2026-10-01T09:58:12.481Z",
  "estudioId": "…",
  "recurso": "recibo",
  "recursoId": "rec-…",
  "version": "v1",
  "datos": { "id": "rec-…", "situacion": "COBRADO", "importeIngresado": 6000, "...": "..." }
}
```

- **`datos`** es el recurso con **la misma forma que su endpoint** (`/recibos`, `/facturas`…), tal y como estaba segundos después del cambio.
- **`datos: null`** significa que el recurso ya no existía, y es siempre así en los `*.eliminado`.
- La clienta va **sin NIF ni dirección**: para esos datos, consulta `GET /clientas` con `clientas:datos_fiscales`.
- Si se **suprime** a una clienta (derecho de supresión), los eventos que la llevaban se quedan con `datos: null` y lo que quedara por mandar de ella no se manda.

**Garantías.** Un evento puede llegar **más de una vez** y **desordenado**. Usa `id` para no procesarlo dos veces y, ante dos eventos del mismo recurso, quédate con lo que diga el de `creadoEn` más reciente (o vuelve a leer el recurso).

### Webhooks

Cada aviso es un `POST` con el evento en el cuerpo (JSON) y estas cabeceras:

| Cabecera | Qué es |
|---|---|
| `Tentare-Firma` | `t=<segundos unix>,v1=<firma>` (ver abajo) |
| `Tentare-Evento-Id` | El `id` del evento |
| `Tentare-Evento-Tipo` | El `tipo` |
| `Tentare-Entrega-Id` | Esta entrega concreta (un evento × un webhook) |
| `Tentare-Intento` | 1 la primera vez, 2 en el primer reintento… |

**Responde con un 2xx en menos de 8 segundos.** Si tienes que hacer algo largo, guarda el evento y procésalo después.

**Reintentos.** Si la respuesta no es 2xx, o no llega a tiempo, se reintenta a los 1, 5 y 30 minutos, y a las 2, 6, 12, 24 y 48 horas: casi tres días en total. Hay dos excepciones:

- **410 Gone:** el webhook se desactiva, porque el destino dice que esa dirección ya no existe.
- **Redirecciones:** no se siguen. Configura la dirección final.

**Desactivación automática.** Un webhook que lleva **unos tres días** sin conseguir entregar nada se desactiva solo. La propietaria lo ve en el panel, puede reactivarlo y puede reenviar entregas una a una.

**Avisos a la propietaria.** Si su programa lleva **12 horas** sin recibir nada, Tentare se lo dice (push y, si lo tiene activado, correo) para que pueda arreglarlo antes de que se desactive. Si se desactiva, se lo dice siempre, también por correo. Y si vuelve a funcionar después del primer aviso, también se lo cuenta. Un fallo suelto que los reintentos resuelven en un rato no genera ningún aviso.

**Ritmo.** Las entregas se reparten entre webhooks (unas pocas de cada uno por pasada), así que una importación masiva en un estudio no retrasa los avisos de los demás. Un destino que acaba de fallar no recibe más hasta el siguiente intento.

**Dirección.** Tiene que ser `https://` en el puerto 443, y pública en internet: no se admiten direcciones privadas o internas.

#### Verificar la firma

Al crear un webhook, el panel enseña **una vez** su secreto de firma (`whsec_…`).

La firma `v1` es el HMAC-SHA256, en hexadecimal, de `"<t>.<cuerpo>"`, con el secreto como clave. `<cuerpo>` es el cuerpo **tal cual llega**, sin volver a serializarlo.

Al verificar:

- rechaza la petición si `t` es de hace más de 5 minutos;
- acéptala si **cualquiera** de las `v1` cuadra. Tras **cambiar el secreto**, el anterior sigue firmando 24 h y la cabecera trae dos `v1`. Si el secreto anterior se ha filtrado, el panel permite que deje de firmar en el momento.

```js
// Node.js (con Express, usa express.raw({ type: 'application/json' }) en esta ruta)
const crypto = require('node:crypto');

function firmaValida(cuerpo, cabecera, secreto) {
  const partes = String(cabecera ?? '').split(',').map((p) => p.split('='));
  const t = Number(partes.find(([k]) => k === 't')?.[1]);
  if (!t || Math.abs(Date.now() / 1000 - t) > 300) return false;
  const esperada = crypto.createHmac('sha256', secreto).update(`${t}.${cuerpo}`).digest();
  return partes.some(([k, v]) => k === 'v1' && /^[0-9a-f]{64}$/.test(v)
    && crypto.timingSafeEqual(Buffer.from(v, 'hex'), esperada));
}
```

```python
# Python
import hmac, hashlib, time

def firma_valida(cuerpo: bytes, cabecera: str, secreto: str) -> bool:
    partes = [p.split("=", 1) for p in cabecera.split(",")]
    t = next((int(v) for k, v in partes if k == "t"), None)
    if t is None or abs(time.time() - t) > 300:
        return False
    esperada = hmac.new(secreto.encode(), f"{t}.".encode() + cuerpo, hashlib.sha256).hexdigest()
    return any(k == "v1" and hmac.compare_digest(v, esperada) for k, v in partes)
```

**Aviso de prueba.** El botón «Mandar un aviso de prueba» del panel manda un evento `webhook.prueba`, firmado igual que los de verdad. No se guarda en el registro.

### Registro: `GET /eventos`

```bash
curl -i -H "Authorization: Bearer $TENTARE_CLAVE" "https://tentare.app/api/v1/eventos?limite=200"
```

- Devuelve los eventos **de más antiguo a más nuevo**.
- La respuesta trae siempre `X-Siguiente-Cursor`, **también cuando `X-Hay-Mas` es `false`**. Guárdalo y, la próxima vez, pregunta con `?cursor=<ese valor>`: recibirás solo lo nuevo.
- `?tipos=recibo.creado,recibo.actualizado` filtra por tipo.
- Cada tipo exige el permiso de su recurso. Los que la credencial no puede ver no salen, y pedirlos con `tipos` da 403.
- Un evento aparece en el registro unos segundos después de ocurrir, cuando se ha procesado. El cursor sigue el orden en que se procesan: avanzar con él **nunca se salta un evento**, aunque llegue tarde.

## Versionado

`v1` solo cambia de forma compatible: se añaden campos, endpoints o valores. Un cambio que rompa algo va en `/api/v2`. Los campos nuevos pueden aparecer en cualquier momento, así que ignora los que no conozcas.

---

## Por dentro (para quien mantiene Tentare)

- **Entrada única: `conApiPublica`** (`lib/api-publica/servidor.ts`). Hace, en orden:
  1. límite por IP;
  2. autenticación con token OAuth o con clave;
  3. la sede de la petición (`lib/api-publica/cadena.ts`): la de la credencial o, con una clave de cadena, la de `Tentare-Estudio`, comprobada contra la cadena y su dueña;
  4. comprobación del estudio (suspendido, sin suscripción);
  5. rol actual de quien concedió la credencial;
  6. scopes efectivos (credencial ∩ rol ∩ plan, en `lib/api-publica/scopes.ts`);
  7. límite por credencial;
  8. scope del endpoint;
  9. el handler;
  10. auditoría en `oauth_auditoria_accesos`, que admite `cliente_id` o `api_clave_id`.
- **Sin RLS debajo.** La API corre con service-role, así que el aislamiento entre estudios es `ctx.studioId`. `lib/api-publica/rutas.test.ts` exige que cada ruta de `app/api/v1` filtre por él, use `conApiPublica` y no haga `select('*')`.
- **Forma pública: `lib/api-publica/serializar.ts`.** Lista blanca de columnas y de campos. `serializar.test.ts` comprueba que cada serializador devuelve exactamente lo que dice `openapi.ts` y que ninguna columna interna sale.
- **Cifras.** Las de dinero usan `lib/billing/situacion-recibo.ts`, la misma lectura que el panel (`docs/cifras-financieras.md`).
- **Tablas.**
  - `api_claves` (solo el hash) y `api_acceso_estudios` (la activa Tentare desde `/interno`). Las dos sin políticas RLS y sin grants para el cliente.
  - Las borra la purga de estudios vencidos.
- **Panel.**
  - `components/configuracion/api-publica.tsx`.
  - Rutas `/api/integrations/api-publica/*`, solo para la propietaria (`puedeGestionarClavesApi`).
- **Límite por plan.** `scopesDelPlan()` es el único sitio donde se pondrá cuando haya una decisión comercial. Hoy no recorta nada.
- **Eventos y webhooks (F2).**
  - Los registra el trigger `api_registrar_evento`, no el código: `recibos` tiene decenas de escritores. F2 (migr `20261001162731`) cubre recibos, facturas, devoluciones, ventas y clientas; `20261001181511` añade reservas y suscripciones. La definición vigente de la función es la de la última migración que la redefine (`catalogo.test.ts` la busca así).
  - Un `UPDATE` solo es evento si cambia una columna de `COLUMNAS`. `lib/api-publica/webhooks/catalogo.test.ts` cruza la lista del trigger con `serializar.ts`.
  - El trabajador (`lib/api-publica/webhooks/trabajador.ts`) lo dispara el cron `api-webhooks`: cada minuto, pero **solo si hay algo que hacer** (el `where exists` va antes del POST).
  - El trabajador escribe `datos` con el mismo serializador que la API y entrega con firma HMAC (`firma.ts`).
  - Antes de mandar, comprueba lo mismo que la API en cada petición (`accesoVigente`, `apiActivada` y el permiso del rol de quien creó el webhook).
  - **SSRF** (`destino.ts`): https y puerto 443; nombres e IP no públicas fuera; la IP se vuelve a comprobar **al conectar** (`lookup` propio en `envio.ts`); sin redirecciones.
  - El secreto se guarda **cifrado** con la clave de las integraciones (`secretos.ts`) y falla cerrado: sin clave no hay webhooks. El barrido nocturno de copias lo vuelve a cifrar tras rotar la clave.
  - Desactivar la API desde `/interno` desactiva también los webhooks.
- **`Idempotency-Key`** (`lib/api-publica/idempotencia.ts` y `conApiPublica`).
  - En todos los POST: aparta la clave en `api_idempotencia` antes del handler y guarda la respuesta después. Un 5xx se borra, para que el reintento vuelva a ejecutarse.
  - Si no puede comprobar la clave, responde 503 y **no ejecuta nada**, para no duplicar.
  - El cron `api-idempotencia-purgar` borra cada hora lo que tiene más de 24 h. Por eso la tabla no va en la purga de estudios.
  - Avisos a la propietaria (`lib/api-publica/webhooks/salud.ts`): «no recibe» a las 12 h (ALTA), «desactivado» (CRÍTICA, siempre por correo) y «vuelve a funcionar» (cierra el primero). Uno por racha: `api_webhooks.aviso_fallando_en`, más escrituras condicionadas y una clave de deduplicación con el inicio de la racha.
  - El cursor de `/eventos` es `publicado` y no `seq`: se reparte al procesar, bajo un cerrojo que dura hasta el commit, así que su orden es el de confirmación.
  - Reparto justo: los dos «reclamar» limitan por estudio (eventos) y por webhook (entregas), y el cron repite tandas mientras le queda presupuesto.
  - Suprimir o borrar a una clienta vacía sus copias en `api_eventos.datos` (trigger `api_eventos_olvidar_clienta`). El registro no apunta a ella por `socio_id`, así que no lo cubre `supresion-cobertura.test.ts`; lo cubre `webhooks/catalogo.test.ts`.
  - Borrar un webhook es un borrado lógico (`borrado_en`/`borrado_por`): queda el rastro de a qué URL apuntaba y quién lo creó y lo borró.
  - Cada fila del trigger abre una subtransacción (el `exception` que protege la escritura de negocio), solo en estudios con la API activa. Con más de 64 filas en una sola sentencia (importación masiva) desborda la caché de subtransacciones; es aceptable a esta escala, pero conviene tenerlo presente.
- **Claves de cadena** (`api_claves.cadena_id`, migr `20261001204440`; `lib/api-publica/cadena.ts`).
  - No cambian el aislamiento: cada petición sigue teniendo UNA sede (`ctx.studioId`), y la cabecera solo se acepta si la clave llega a ella. Mientras no se sabe, un fallo se audita en la sede de la clave, porque la pedida puede ser de otro estudio.
  - `studio_id` es la sede desde la que se creó o se rotó. Solo se usa para `GET /estudios` sin cabecera: esa llamada pasa las comprobaciones de esa sede y se audita allí. Límite conocido: si esa sede queda suspendida, `/estudios` sin cabecera falla aunque las demás sedes funcionen. Rotar la clave desde otra sede la cambia de origen.
  - Desde el panel las gestiona la dueña de la cadena desde cualquiera de sus sedes (`filtroClaves`, `Gestor.cadenaId`). Si deja de serlo, puede revocar las que creó en esa sede, pero no rotarlas. Otra propietaria de la sede no ve las claves de cadena que creó la dueña allí: revocarlas cortaría toda la cadena.
  - Las peticiones que una credencial válida hace fallar después de identificarse (sede ajena en la cabecera, API sin activar…) gastan su cupo por minuto igual que las buenas.
  - `/interno` revoca las claves de cadena al desactivar la API de cualquiera de sus sedes. Es la opción que falla cerrada: una clave revocada no vuelve a entrar en la sede si alguien reactiva su API.
- **Permisos por app OAuth** (`oauth_clientes.scopes_permitidos`, `repartirScopesConsentimiento` en `lib/api-publica/scopes.ts`).
  - Se aplican al autorizar (recortando) y en cada petición (`scopesEfectivos` con `app`).
  - Una app nueva nace sin permisos: su lista va en la misma migración que la registra.
