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

La API se activa estudio a estudio: si el estudio no la tiene activada, no se pueden crear claves. Desactivarla revoca todas sus claves; si se vuelve a activar, hay que crear claves nuevas. Los tokens OAuth (Zapier) no dependen de esta activación.

**Una credencial pertenece a un solo estudio (una sede).** No hay ninguna forma de pedir datos de otro.

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
- **Se comprueban en cada petición**, con el rol que esa persona tiene ese día. Si deja el estudio, o se queda sin ningún permiso que pueda dar, sus credenciales dejan de valer.
- **Las claves de API solo dan permisos de lectura**, y solo puede crearlas la propietaria.
- **Mover dinero no es posible.** No existe `pagos:escribir`.

## Recursos

Todas las rutas cuelgan de `https://tentare.app/api/v1`. El antiguo prefijo `/api/oauth/v1` sigue funcionando, con las mismas rutas.

| Ruta | Scope | Qué devuelve |
|---|---|---|
| `GET /estudio` | cualquiera | Datos fiscales del emisor, zona horaria, moneda, IVA por defecto y `modoFacturacion` |
| `GET /clientas` | `clientas:leer` | Clientas |
| `GET /recibos`, `GET /recibos/{id}` | `pagos:leer` | Cobros (ver «Contabilidad» más abajo) |
| `GET /devoluciones` | `pagos:leer` | Reembolsos y contracargos, uno por cada hecho |
| `GET /ventas` | `pagos:leer` | Ventas de la caja, con sus líneas y el IVA de cada una |
| `GET /facturas`, `GET /facturas/{id}` | `facturas:leer` | Facturas, rectificativas incluidas |
| `GET /suscripciones` | `planes:leer` | Cuotas y bonos (un bono tiene `tipoPlan: BONO` y `sesionesRestantes`) |
| `GET /tarifas` | `planes:leer` | Catálogo de planes y bonos |
| `GET/POST /reservas`, `POST /reservas/cancelar` | `reservas:*` | Reservas |
| `POST /clientas`, `POST /notas`, `POST /tareas` | `*:escribir` | Altas |
| `GET /planes` | `planes:leer` | **Obsoleto**: es `/suscripciones` con la forma antigua. Se mantiene por Zapier. |

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
| 400 | `invalid_request` | Parámetro mal (fecha, cursor, estado…) |
| 401 | `invalid_token` | Falta la credencial, o está revocada o caducada, o quien la concedió ya no está en el estudio |
| 403 | `insufficient_scope` | La credencial no tiene ese permiso |
| 403 | `api_no_activada` | La API no está activada para el estudio (solo claves) |
| 403 | `estudio_sin_acceso` | El estudio está suspendido o no tiene suscripción activa |
| 404 | `not_found` | El recurso no existe **en este estudio** |
| 429 | `rate_limited` | Demasiadas peticiones; espera lo que indica `Retry-After` |
| 500 | `server_error` | Error nuestro; cita el `requestId` |

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

**Sincronización incremental.** Hoy no existe una «fecha de última modificación» por recibo. Haz una carga inicial completa (con `orden=asc` y el cursor) y, después, vuelve a leer una ventana de los últimos días (`desde=hace 7 días`) para recoger cobros, devoluciones y cambios de estado. Los webhooks y el registro de eventos, que avisarán de cada cambio, son la fase siguiente (F2).

## Versionado

`v1` solo cambia de forma compatible: se añaden campos, endpoints o valores. Un cambio que rompa algo va en `/api/v2`. Los campos nuevos pueden aparecer en cualquier momento, así que ignora los que no conozcas.

---

## Por dentro (para quien mantiene Tentare)

- **Entrada única: `conApiPublica`** (`lib/api-publica/servidor.ts`). Hace, en orden:
  1. límite por IP;
  2. autenticación con token OAuth o con clave;
  3. comprobación del estudio (suspendido, sin suscripción);
  4. rol actual de quien concedió la credencial;
  5. scopes efectivos (credencial ∩ rol ∩ plan, en `lib/api-publica/scopes.ts`);
  6. límite por credencial;
  7. scope del endpoint;
  8. el handler;
  9. auditoría en `oauth_auditoria_accesos`, que admite `cliente_id` o `api_clave_id`.
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
- **Pendiente.**
  - F2: webhooks y registro de eventos (`docs/cifras-financieras.md` §GAPs para lo que el modelo no tiene).
  - `Idempotency-Key` en los POST.
  - Claves a nivel de cadena.
