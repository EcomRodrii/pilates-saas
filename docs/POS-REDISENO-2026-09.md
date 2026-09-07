# TPV / Caja — auditoría y rediseño (2026-09-07)

El POS existía y estaba **congelado** desde el feature-freeze de PMF
(2026-07-23). Esta pasada lo audita, lo reconstruye sobre una base
server-authoritative y lo devuelve al producto.

---

## 1. Arquitectura anterior

```
Navegador (app/(dashboard)/pos/page.frozen.tsx, 1.189 líneas)
  │  calcula subtotal, descuento y total
  ├─► supabase-js ──► ventas_pos          (RLS: estudio + puede_mover_dinero)
  ├─► supabase-js ──► recibos (COBRADO)
  └─► /api/facturas/sellar ──► factura Veri*Factu
```

Catálogo: `productos_pos` con **seis** columnas (`id`, `studio_id`, `nombre`,
`categoria`, `precio`, `activo`). Cobro con datáfono vía Stripe Terminal
(`/api/terminal/cobrar`, server-driven y correcto) y Bizum presencial por QR.
Backstop de reconciliación por webhook (`reconciliaciones_pos`).

---

## 2. Problemas encontrados, y su causa raíz

| # | Problema | Causa raíz | Evidencia |
|---|---|---|---|
| 1 | **El navegador decidía cuánto se cobraba.** Precio, descuento y total viajaban ya calculados; la RLS solo miraba estudio y rol. | La venta se escribía con `supabase-js` desde el cliente. Una RLS puede decir *quién* escribe, no *qué* importe es correcto. | `0112:93`, `studio-context.tsx:3999` |
| 2 | **Bizum se marcaba cobrado sin preguntar a Stripe.** Botón «Cobro realizado» → `finalizarVenta()`. | No existía distinción entre un pago que confirma un tercero y uno que ve quien cobra. | `page.frozen.tsx:782` |
| 3 | **Si el checkout Bizum fallaba, la venta se registraba igual.** | Camino de respaldo que trataba «no pude cobrar» como «cobrado por fuera». | `page.frozen.tsx:468` |
| 4 | **«¡Cobrado!» antes de saber si la venta existía.** `finalizarVenta()` no esperaba a `addVentaPOS`. | Escritura optimista — el patrón que este repo prohíbe explícitamente en dinero. | `page.frozen.tsx:373` |
| 5 | **No existía el stock.** | `productos_pos` nunca tuvo la columna, pese a que la migración que endureció su RLS la nombra. | `0000_base.sql:780`, `20260729162500` |
| 6 | **No existía el IVA por artículo.** | Solo `studios.iva_por_defecto` sobre un importe único. | esquema |
| 7 | **Vender un bono no creaba ningún bono.** Las categorías `SESION`/`PACK` eran un duplicado *nominal* de los planes `PUNTUAL`/`BONO`, sin FK ni join. | Dos catálogos para el mismo hecho de negocio. | `productos_pos` vs `planes_tarifa` |
| 8 | **Una venta se podía BORRAR desde el navegador.** | `ventas_pos_escritura_delete` para `authenticated`. | `0112:102` |
| 9 | **No había caja.** «Cerrar caja» sumaba las ventas del día: sin fondo, arqueo, diferencia ni movimientos. | — | `page.frozen.tsx:82` |
| 10 | **No se registraba quién vendía**, ni había número de venta. | — | esquema |
| 11 | **Efectivo sin cambio.** | — | UI |
| 12 | **Cero tests**, unitarios y e2e. | — | — |
| 13 | **La tabla `ventas_pos` entera al navegador** al arrancar el panel. | `fetchAllRows` sin paginar. | `supabase-data.ts:4747` |
| 14 | **Objetivos táctiles de 24 px** y colores hex fuera del sistema de tokens. | — | `page.frozen.tsx:845`, `CAT_STYLE` |

---

## 3. Arquitectura nueva

```
Navegador  ──►  POST /api/pos/venta        (SOLO ids + cantidades)
                    │  verificarSesionStaff → puedeMoverDinero
                    │  → bloqueoPorSuscripcion → rate limit
                    │
                    └─ registrar_venta_pos()      ← UNA transacción
                         · relee precio/IVA de productos_pos + planes_tarifa
                         · reserva stock con FOR UPDATE
                         · valida y CONSUME el código de descuento
                         · recalcula subtotal / descuento / IVA / total
                         · numera (advisory lock por estudio)
                         · cabecera + líneas + movimiento de caja
                         · idempotente por (studio_id, idempotencia_clave)
                    │
       Stripe ◄─────┤   la venta nace PENDIENTE_PAGO
                    │
                    └─ PAGADA solo tras releer el pago EN EL SERVIDOR
                       (confirmar_pago_venta_pos, compare-and-set)
                            │
                            └─► recibo COBRADO → factura sellada
                                → suscripción real → créditos → caja
```

**Dos caminos legítimos cierran una venta y no se conocen entre sí:** el TPV
releyendo el PaymentIntent, y el webhook de Stripe. `confirmar_pago_venta_pos`
es un compare-and-set sobre `PENDIENTE_PAGO`; solo quien lo gana entrega el
bono, suma los créditos y sella la factura. Por eso cerrar el navegador a mitad
de un cobro ya no deja nada huérfano.

### Cuatro decisiones para no duplicar sistemas

1. **Los bonos y las clases se venden desde `planes_tarifa`**, no desde un
   catálogo paralelo. La línea de venta lleva `tipo: 'PLAN'` y materializa una
   `suscripciones` con el mismo shape que `entregarPlanComprado` (compra web) y
   `assignPlan` (panel). El bono del mostrador es indistinguible de cualquier
   otro y lo consume `consumir_sesion_bono` sin saber de dónde salió.
2. **`productos_pos` se queda como catálogo de género físico** y gana stock,
   IVA, SKU, código de barras, imagen, descripción y mínimo.
3. **La factura sigue colgando del recibo.** No se activa
   `facturas.venta_pos_id` ni se toca la cadena Veri\*Factu: esa decisión
   fiscal está aplazada a propósito (migr `20260902001721`) y reabrirla sin
   pedirlo sería temerario.
4. **Créditos por compra con `ref_id = ventaId`**, apoyados en el
   `UNIQUE (studio_id, trigger, ref_id)` de `reward_actions` que ya existía.
   Cero mecanismos de idempotencia nuevos.

---

## 4. Tablas creadas y modificadas

| Migración | Qué hace |
|---|---|
| `20260907145937_pos_caja` | **Nuevas** `cajas` (sesión de caja, una ABIERTA por estudio vía índice parcial) y `movimientos_caja` (libro append-only, importe SIEMPRE con signo). RLS: leer exige `puede_ver_finanzas`, y **no hay política de escritura** — todo pasa por RPC de servidor. |
| `20260907150011_pos_catalogo` | `productos_pos` + `stock`, `stock_minimo`, `iva_pct`, `descripcion`, `imagen_url`, `sku`, `codigo_barras`, `orden`. CHECK de stock no negativo, únicos parciales de SKU y código de barras por estudio. |
| `20260907150106_pos_ventas` | `ventas_pos` + `numero`, `estado`, `pago_estado`, `base_imponible`, `iva_total`, `efectivo_recibido`, `cambio`, `vendido_por`, `caja_id`, `recibo_id`, `idempotencia_clave`, `anulada_*`. **Nueva** `ventas_pos_lineas`. Backfill del correlativo de las 19 ventas existentes. **Se retiran INSERT/UPDATE/DELETE de `ventas_pos` al navegador.** |
| `20260907150310_pos_rpc_venta` | `registrar_venta_pos`, `confirmar_pago_venta_pos`, `fallar_pago_venta_pos`. |
| `20260907150401_pos_rpc_caja` | `saldo_caja`, `abrir_caja`, `mover_caja`, `cerrar_caja`. |
| `20260907150458_pos_rpc_devolucion` | `devolver_venta_pos` (parcial por línea, repone stock, retira bono intacto, apunta salida de caja). |
| `20260907150546_pos_creditos_por_compra` | `reward_rules.unidad_euros`; `otorgar_creditos_compra` y `retirar_creditos_compra`. |
| `20260907151014_pos_textos_caja_con_acentos` | Corrección de fidelidad: al aplicar a mano se ASCII-ificaron dos literales visibles en el libro de caja («Devolucion», «Cierre de caja:»). Se recrean las dos funciones con el texto exacto del fichero. Sin cambio de comportamiento. |

Todas las funciones son `SECURITY DEFINER` y **solo `service_role`**, con los
tres `REVOKE` explícitos (`PUBLIC`, `anon`, `authenticated`) que exige el
`pg_default_acl` de este proyecto.

---

## 5. Rutas de servidor

| Ruta | Rol exigido | Qué hace |
|---|---|---|
| `POST /api/pos/venta` | `puedeMoverDinero` | Única puerta de registro. Rate limit 60/min, gate de suscripción, valida que la socia sea del estudio. |
| `POST /api/pos/venta/confirmar` | `puedeMoverDinero` | Relee el pago en el proveedor y aplica el compare-and-set. Acción `cancelar` que respeta un cobro ya consumado. |
| `POST /api/pos/devolucion` | `puedeMoverDinero` | Reembolso en Stripe con `idempotencyKey`, después el libro. |
| `GET/POST /api/pos/caja` | `puedeVerFinanzas` / `puedeMoverDinero` | Abrir, mover, cerrar y consultar. |
| `GET /api/pos/catalogo` | `puedeVerFinanzas` | Arranque del TPV en una petición, con el resumen del día agregado en servidor. |
| `GET /api/pos/ventas` | `puedeVerFinanzas` | Historial paginado + detalle con líneas. |

`app/api/stripe/webhook` gana una rama: un `payment_intent.succeeded` con
`metadata.ventaId` confirma la venta y entrega, en vez de dejar un huérfano.

---

## 6. Permisos

`puedeMoverDinero` = PROPIETARIO y RECEPCION (sin cambios). Se añade `/pos` a
`BLOQUEADO_MANAGER`: el manager no mueve dinero, así que no debe ver en el menú
una pantalla que el servidor le va a negar. Hay un test que fija que **ver
`/pos` y poder cobrar dicen exactamente lo mismo para los cuatro roles**.

---

## 7. Verificación

| Qué | Cómo | Resultado |
|---|---|---|
| Esquema y RPC | `execute_sql` + `ROLLBACK` contra la base real (`dwqvdycjcffqwfkzapvi`) | 9/9 casos: totales, cuadre línea↔cabecera, stock, idempotencia, código de un solo uso, sin stock, bono sin clienta, descuento topado, efectivo insuficiente |
| Lógica pura del ticket | `node --test` | 17/17, con un caso ancla que fija los **mismos céntimos** que devolvió la RPC |
| Suite completa | `npm test` | **3.740 / 3.740** |
| Tipos | `npx tsc --noEmit` | **exit 0** |
| Lint | `npx eslint` sobre todo lo nuevo | **0 problemas** |
| Comportamiento | `e2e/caja-no-miente.spec.ts` | **9/9**, todos con contador de peticiones |
| Visual | Capturas en escritorio y tablet | Revisadas |

### Los 9 casos verificados en base real

Venta de 2×25 € (21 %) + bono 80 € (21 %) + 9,99 € (10 %) con código −10 %:
subtotal 139,99 · descuento 14,00 · base 104,86 · IVA 21,13 · **total 125,99** ·
cambio 24,01. Cabecera = suma de líneas = base+IVA, **exacto**. Descuento
prorrateado 5,00/8,00/1,00. Stock 10→8. Reintento con la misma clave devuelve
la misma venta. Y rechazan correctamente: segundo uso de un código de un solo
uso, pedir 2 con stock 1, bono sin clienta, y 5 € en efectivo por 25 €. Un
descuento de 9.999 € deja el total en 0,00, nunca negativo.

---

## 7 bis. Revisión de seguridad y lo que encontró

Revisión completa (`tentare-seguridad`) del esquema, las seis rutas, las RPC y
el webhook. **Cero hallazgos de autorización**: las seis rutas comprueban el rol
en servidor, el `studioId` sale siempre del JWT, el aislamiento multi-inquilino
está cerrado y las diez funciones nuevas tienen los grants correctos.

Pero encontró **un fallo grave de dinero**, y la corrección destapó otros dos:

| # | Qué | Estado |
|---|---|---|
| **H-1** | **La clave de idempotencia identificaba la FORMA DEL CARRITO, no el intento de cobro.** Dos clientas comprando lo mismo (una botella en efectivo, el caso más común de un mostrador) generaban la misma clave: el servidor devolvía la venta de la primera y la segunda **no se registraba nunca** — sin bajar stock, sin ingreso, y con la pantalla diciendo «Cobrado». Peor: el e2e que escribí **fijaba ese comportamiento como si fuera la protección**. | Corregido: nonce por intento (renovado al vaciar y tras cada venta), nombre y precio en la firma de las líneas LIBRE, y la UI avisa cuando el servidor responde `yaExistia`. El test se reescribió al derecho y se añadió su complementario. |
| **M-1** | La devolución escribía el libro ANTES de reembolsar, y el comentario decía lo contrario («una transacción que se deshace» — no había rollback). Si Stripe fallaba, la clienta se quedaba sin bono y sin dinero, y el reintento chocaba con `DEVOLUCION_EXCEDE`. | Corregido: `p_simular` calcula sin escribir → reembolso → libro. Si el reembolso falla, no se ha tocado nada. |
| **M-2** | Un cobro que triunfaba sobre una venta ya ANULADA se perdía en silencio: `r_aplicado=false` no distinguía «ya estaba pagada» de «está anulada». | Corregido: `confirmar_pago_venta_pos` devuelve `r_estado`; el webhook avisa a Sentry y deja el cobro en `reconciliaciones_pos`. |
| **M-3** | Dos líneas del mismo artículo se saltaban el control de stock: el decremento fallaba **mudo**, al revés de lo que prometía su comentario. No alcanzable desde la UI (fusiona líneas), sí desde la API. | Corregido con `GET DIAGNOSTICS` tras el decremento. |
| **L-1** | Grants por defecto a `authenticated` en las tres tablas nuevas. | Ya estaba corregido antes de la revisión (medido con `has_table_privilege`). |
| **L-2** | `p_caja_id` era el único parámetro sin cotejar contra el estudio. No cross-tenant (las rutas la resuelven ellas), pero permitía apuntar en una caja ya cerrada. | Corregido en las tres RPC. |
| **L-3** | El guardia `IMPORTE_NO_COINCIDE` era inerte por el camino del TPV: comparaba el total consigo mismo. | Corregido: el proveedor devuelve `importeCentimos`. |
| **L-4** | Las devoluciones en efectivo no dejaban fila en `devoluciones`, pese a que el comentario decía que sí. | Corregido: la ruta llama a `registrarDevolucion` para ese canal. |
| **L-5** | `metodoPago` de un movimiento de caja llegaba sin lista blanca (500 en vez de 400). | Corregido. |
| — | Un doble toque **simultáneo** respondía 500. No cobraba dos veces (la transacción perdedora se deshacía entera), pero era el peor mensaje en el peor momento. | Corregido con un lock por clave de idempotencia. |

⚠️ **Y la propia corrección introdujo dos bugs que solo aparecieron al volver a
probar contra la base**, que es la razón de hacerlo:

1. Una sustitución de texto sin comprobar dejó `v_controla_stock` **sin asignar**
   → habría sido `NULL`, el `IF` habría dado falso y **el stock no se habría
   descontado nunca**. Mudo, y en el sitio donde más caro sale.
2. La ventana de 15 minutos que se añadió a la búsqueda de idempotencia
   **contradecía al índice único**, que es permanente: pasada la ventana el
   `SELECT` ignoraba la clave, el `INSERT` chocaba igual y la venta moría con un
   `23505` crudo. Se retiró la ventana — manda el índice, y que la clave no se
   repita es trabajo del nonce.

Los dos se cazaron con `execute_sql` + `ROLLBACK`, no leyendo el código.

## 8. Riesgos y límites conocidos

1. ~~Las migraciones no están aplicadas.~~ **APLICADAS en producción el
   2026-09-07** (versiones `20260907145937`–`20260907151014`), verificadas una a
   una: las 19 ventas existentes quedaron numeradas 1–19, las tres políticas de
   escritura de `ventas_pos` retiradas, `authenticated` con solo `SELECT`, las
   diez funciones con `anon=false / authenticated=false / service_role=true`, y
   `get_advisors` sin ningún aviso nuevo (86, los mismos de antes, 0 ERROR).
   Prueba funcional end-to-end contra el esquema ya aplicado, con `ROLLBACK`:
   venta con tres tipos de IVA cuadrando al céntimo, correlativo continuando en
   #20, stock 10→8→9→10, pre-vuelo de devolución sin escribir, y arqueo.
   ⚠️ Los ficheros locales se RENOMBRARON a la versión con que quedaron
   selladas: `apply_migration` usa la marca de tiempo del momento de aplicar, no
   la del fichero, y sin renombrar un `supabase db push` desde limpio las vería
   pendientes y las reaplicaría con OTRO timestamp.
2. **Por Stripe no ha pasado un euro real en este flujo.** El datáfono y Bizum
   están probados contra mocks, no contra hardware ni contra un
   `paymentIntent` de verdad. **Probar el primer cobro en un estudio de prueba
   antes de activarlo con clientas reales.** Es el mismo límite que arrastran
   las fases de dinero anteriores de este repo, y aquí es serio.
3. **IVA mixto y factura.** El ticket y `ventas_pos` desglosan el IVA por
   línea; la factura sellada sigue repartiendo el total con
   `studios.iva_por_defecto`. Mientras cada artículo use el tipo del estudio
   —el caso normal— las dos cifras coinciden al céntimo. Si un estudio pone un
   tipo distinto a un artículo, el desglose del ticket y el de la factura
   pueden diferir. Cerrarlo exige tocar el sellado fiscal, que es la pieza
   aplazada a propósito en `20260902001721`.
4. **Las devoluciones no emiten rectificativa automática**, por diseño: elegir
   el tipo (R1–R5, por sustitución o diferencia) necesita criterio de gestoría
   y ya vive en `/api/facturas/rectificar`.
5. **Sin lector de código de barras por cámara.** El campo existe y el buscador
   lo encuentra si se teclea o se usa un lector USB (que escribe como teclado).
   Una cámara con `BarcodeDetector` no funcionaría en Safari — el bug #565 de
   este repo.
6. **Sin realtime entre dos terminales.** El catálogo se refresca tras cada
   venta y al abrir la pantalla; dos mostradores a la vez no se ven en vivo. El
   stock **sí** está protegido en la base (`FOR UPDATE`): el segundo terminal
   recibe `SIN_STOCK` en vez de vender de más. Añadir Realtime aquí tiene coste
   (fue el 58 % del CPU de la BD en su día), así que se deja como decisión
   aparte.
7. **`reconciliaciones_pos` sigue en pie** para los cobros lanzados por
   `/api/terminal/cobrar` (que no se ha retirado). Las ventas nuevas ya no lo
   necesitan.

---

## 9. Fase 2 — el mostrador deja de ser una isla, y se cobra sin ficha

Escrita tras usar el TPV en producción. Tres quejas, tres causas distintas.

### 9.1 «No sale en cobros»

**Era cierto, y la causa no estaba en Cobros.** El TPV escribe en servidor con
`service_role` (`/api/pos/*`) y después solo recargaba **su propio catálogo**.
El `StudioContext` del panel —de donde salen /cobros, /facturas y la ficha de
la clienta— no se enteraba de nada: el recibo estaba en la base y la factura
sellada, pero la pantalla seguía enseñando lo de antes hasta recargar la
página entera.

Arreglado con `fetchDatosTrasVentaPOS` (`lib/supabase-data.ts`) +
`refrescarTrasVentaPOS` en el contexto, enganchado al `refrescar()` que el TPV
ya llamaba tras cobrar, devolver y mover caja. Se releen **cinco** tablas
—recibos, facturas, suscripciones, ventas y productos—, no el estudio entero:
`fetchCriticalStudioData` trae socias, sesiones y reservas, y pagar eso después
de cada botella de agua tiraría por tierra el arranque que costó bajar de
1452 ms a 69 ms.

### 9.2 «No se puede descargar la factura si la clienta la pide»

La factura existía desde el primer día. Lo que no existía era una forma de
llegar a ella sin salir del TPV, entrar en Cobros → Facturas y buscar el
número, con la clienta esperando.

`GET /api/pos/factura?ventaId=…` + `<BotonFactura>`, en la pantalla de
«Cobrado» y en el detalle de cualquier venta pasada (alguien que vuelve al día
siguiente). No emite nada: solo lee lo que `sellarFacturaDeRecibo` ya selló.
Cuando todavía no está sellada devuelve el motivo en una frase —«se está
emitiendo, estará lista en unos minutos»— en vez de un hueco mudo.

⚠️ **La factura se pide AL MONTAR, no al pulsar.** `abrirFacturaPDF` hace
`window.open`, y una pestaña abierta después de un `await` ya no cuenta como
gesto del usuario: Safari la bloquea sin decir nada, y eso se ve exactamente
igual que un botón roto. Precargando, el clic es síncrono. Misma familia que el
portapapeles de Safari (#994): funciona en Chrome de escritorio y falla en el
iPad del mostrador, que es donde se usa.

### 9.3 «El TPV debe poder cobrar sin ficha»

Productos e importe libre ya se cobraban sin ficha. Lo que no se podía era
vender un **bono o una clase suelta**: `registrar_venta_pos` lanzaba
`PLAN_SIN_CLIENTA`. En producción eso se tradujo en la venta #20, una clase de
prueba cobrada como importe libre con el concepto tecleado a mano — 20 € que
entraron bien, con recibo y factura correctos, pero que no constan como clase
en ninguna parte.

Ahora un plan sin clienta se vende y su línea queda con `suscripcion_id` a NULL
(«cobrado, sin entregar»); la venta sale marcada **«Bono por asignar»** en la
lista de ventas, y `asignar_venta_pos_a_socia` la engancha a una ficha cuando
esa persona se apunta —ese mismo día o tres semanas después—, entregando
entonces el bono y los créditos con la lógica de siempre.

Sin entidad nueva: no hay «cliente ocasional» ni registro de invitados. La
venta simplemente no tenía dueña y ahora la tiene.

⚠️ **La factura NO se mueve al asignar.** Se emitió como F2 (simplificada, sin
receptor identificado), que es lo que la norma prevé para un ticket de
mostrador. Reescribir el receptor de un documento sellado y encadenado en
Veri*Factu no es corregirlo, es falsearlo. Para eso está la rectificativa desde
/facturas, que decide una persona con criterio de gestoría. El **recibo** sí
pasa a su ficha, para que el cobro aparezca en su historial de pagos.

### 9.4 Corrección: la verificación de la fase 1 no cubría la fidelidad

El informe anterior decía que las migraciones se habían «verificado una a una».
Eso era cierto **del comportamiento y de los grants**, y falso de la fidelidad
del texto. Comparando el md5 de cada `prosrc` contra el de su fichero apareció
lo siguiente:

- **Nueve de las diez funciones tenían la lógica idéntica**, pero siete habían
  perdido sus comentarios al pegarlas a mano. Deriva cosmética: nada las lee.
- **`retirar_creditos_compra` sí divergía en lógica**: producción decía
  `'Devolucion de una compra'` y el fichero `'Devolución'`. No es un comentario
  interno — es la descripción que la socia lee en su monedero al retirársele
  créditos por una devolución. Tercer literal ASCII-ificado de la tanda; la
  correctiva `20260907151014` cazó los dos del libro de caja y este se escapó.

Corregidas las tres funciones que esta migración toca, verificadas por **md5
literal** (no solo por lógica) contra el fichero. Las otras seis conservan la
deriva de comentarios, que no cambia comportamiento.

**Regla que sale de aquí:** una tanda aplicada a mano no está verificada hasta
comparar `md5(prosrc)` contra el fichero, función por función. «Probé que
funciona» y «apliqué lo que dice el fichero» son dos afirmaciones distintas, y
solo la segunda se comprueba así.

---

## 10. Fase 3 — el cobro de mostrador que no pasaba por la caja

Encontrado auditando la integración, no pedido: si las dos quejas anteriores
eran de integración, el siguiente agujero probablemente también.

### 10.1 El descuadre

**Las únicas escrituras en `movimientos_caja` venían de las RPC del TPV.** Nada
más en todo el repo apunta ahí — verificado con un grep sobre `lib`, `app`,
`components` y `supabase`.

Pero `/cobros` sí deja marcar un recibo como cobrado **en efectivo**. La socia
paga sus 60 € en mano, alguien lo marca, el dinero entra en el cajón, y en el
libro de caja no consta. Como `saldo_caja` es `fondo_inicial + movimientos en
EFECTIVO`, al cerrar el recuento sale por encima de lo esperado **exactamente
por esa cantidad**: un sobrante sin explicación, cada vez, sin ninguna pista de
dónde viene. Es un descuadre de dinero real.

`apuntar_cobro_en_caja` (migr `20260907171330`) añade el apunte que faltaba,
llamada desde `marcarCobrado` **después** de que el cobro esté registrado y sin
poder tumbarlo: el dinero vive en `recibos`, la caja solo cuenta el cajón.

⚠️ **Qué entra y qué no.** Se apuntan EFECTIVO, TARJETA, DATAFONO y BIZUM —
todos se cobran con la clienta delante— y se dejan fuera TRANSFERENCIA y SEPA,
que llegan al banco sin pasar por el cajón. Meterlas inflaría «lo cobrado hoy
aquí» con dinero que nunca estuvo aquí. Hay además un motivo técnico:
`movimientos_caja.metodo_pago` no admite SEPA y `recibos.metodo_cobro` sí — un
recibo cobrado por SEPA habría reventado el CHECK en ejecución.

Tipo nuevo `COBRO` en `movimientos_caja_tipo_check`: un cobro de recibo no es
una VENTA del TPV, y mezclarlos haría ilegible el arqueo.

### 10.2 «Vengo a pagar la cuota»

De lo más normal en un mostrador, y el TPV no sabía hacerlo: había que salir a
/cobros. Ahora, al elegir a la clienta, el TPV enseña lo que debe y lo cobra
ahí mismo, reutilizando el `marcarCobrado` del contexto —el MISMO que usa
/cobros, con su compare-and-set, su sellado fiscal y su renovación de bono— en
vez de duplicar esa lógica.

⚠️ **Solo efectivo, a propósito.** Marcar a mano un recibo como pagado «con
tarjeta» es exactamente lo que este rediseño existe para eliminar: una
transacción de tarjeta dada por buena sin que ningún proveedor la haya
confirmado. El efectivo es distinto — hay alguien contándolo y el recuento del
cierre lo verifica. **Cobrar un recibo por datáfono sigue sin construirse**:
necesita pasar por el datáfono de verdad, no por un botón, y eso es un flujo de
pago propio, no una variante de este.

⚠️ **Bug propio, encontrado y cubierto con test.** La primera versión metió el
panel dentro del pie del ticket, que entero está detrás de `carrito.length > 0`
— quien viene solo a pagar la cuota lleva el ticket VACÍO, así que no se habría
visto nunca justo cuando hace falta. El test lo fija con el ticket vacío.

---

## 11. Fase 4 — stock de verdad

### 11.1 Lo que había

Un campo de texto en la ficha del producto. La venta lo descontaba y la
devolución lo reponía, pero cualquier otra variación era un `UPDATE` a pelo
desde el navegador: se podía pasar de 3 a 300 sin que nada lo registrara. Eso
no es control de existencias, es un número editable — y es el hueco por el que
en una tienda se tapa una merma.

Faltaban las tres cosas que de verdad pasan: meter mercancía cuando llega,
corregir el número cuando se cuenta, y poder responder «¿por qué hay 7 y no
10?».

### 11.2 Lo que hay

`movimientos_stock` + `mover_stock` (migr `20260907172606`). Tres verbos, que
son los tres que ocurren en un estudio:

| | Qué pregunta la pantalla |
|---|---|
| **Entrada** | ¿Cuántas han entrado? (con coste unitario opcional) |
| **Merma** | ¿Cuántas se han perdido? |
| **Recuento** | ¿Cuántas hay de verdad? |

⚠️ **El recuento va por valor absoluto, no por diferencia.** Quien cuenta dice
«hay 7», no «quita 3»; pedirle la resta con la caja delante es pedirle que se
equivoque. La diferencia la calcula la RPC con la fila bloqueada, así que
tampoco puede colarse una venta entre contar y guardar.

⚠️ **Al editar un artículo, las existencias son de solo lectura.** El saldo de
apertura se escribe al CREAR —ahí empieza el libro— y a partir de ahí solo se
mueve. Un stock sobrescribible convertiría el libro en decoración, que es el
mismo fallo que un captcha que nadie comprueba en servidor.

### 11.3 El historial no guarda las ventas

Se **derivan** de `ventas_pos_lineas` y se unen a los movimientos manuales al
pintarlos. Copiarlas al libro habría obligado a tocar otra vez
`registrar_venta_pos` y `devolver_venta_pos` —dos funciones de dinero ya
auditadas— para acabar con dos versiones del mismo hecho que pueden separarse.
Un historial derivado no puede contradecir a la venta; uno copiado, sí.

Las ventas ANULADAS se excluyen: nunca llegaron a descontar stock
(`fallar_pago_venta_pos` lo devuelve), así que aparecerían como una salida que
no ocurrió.

⚠️ **Dos consultas, no un `embed`.** `ventas_pos_lineas` NO tiene `creado_en`
—su fecha es la de la venta— así que no se puede ordenar por ella, y ordenar
por una columna de la tabla incrustada depende de la versión de PostgREST. Se
juntan en JS, que aquí es determinista.

### 11.4 Verificación

Nueve escenarios contra la base real con `ROLLBACK`: entrada, merma, recuento,
recuento sin cambio, merma mayor que el stock, artículo sin control de
existencias, aislamiento entre estudios, y la invariante que importa —
**10 + suma de movimientos = 7 = stock actual**. El libro cuadra.

Migración verificada por **md5 literal** contra el fichero; grants
`anon=false`, `authenticated=false`, `service_role=true`, y la tabla sin
INSERT/UPDATE/DELETE para `authenticated` (el pg_default_acl los concede solos
y `GRANT SELECT` no los retira).

### 11.5 Fuera de esta fase, a propósito

- **Valoración de inventario y coste medio.** `coste_unitario` se guarda pero
  es informativo: fingir una valoración con un solo campo sería peor que no
  tenerla.
- **Proveedores y pedidos.** Una entrada dice cuántas llegaron y qué costaron;
  no hay entidad «proveedor» ni recepción de pedido, y no debería inventarse
  hasta que alguien la pida de verdad.
- **Aviso proactivo de stock bajo.** El umbral ya existe y la etiqueta se
  pinta, pero nadie recibe un aviso cuando se cruza. Es una regla del Decision
  OS, no una pantalla más.

---

## 12. Fase 5 — la regla de créditos que nadie podía encender

`otorgar_creditos_compra` y `reward_rules.unidad_euros` se construyeron con el
rediseño del TPV y quedaron **inalcanzables**: la pantalla de recompensas
dibuja una fila por cada entrada de `REWARD_TRIGGERS`, y `COMPRA` no estaba en
esa lista. La RPC buscaba una regla activa que ninguna pantalla podía crear.

Una función que nadie puede activar no es una funcionalidad a medias: es código
muerto que parece una funcionalidad, y engaña también a quien lee el esquema.

Añadida la fila con su campo propio, «por cada €», porque es el único
disparador cuyos créditos **no son una cifra por suceso** sino por importe:
`floor(importe / unidad_euros) × creditos`.

⚠️ **La sugerencia arranca en 1 crédito, no en 10 como los demás.** La RPC usa
`unidad_euros = 1 €` cuando el campo está vacío, así que encender la regla con
la sugerencia alta de los otros disparadores habría dado **10 créditos por
euro** desde el primer segundo — 700 créditos por un bono de 70 €.

⚠️ **`unidad_euros` va en las DOS listas blancas de columnas**, la del alta y la
de la edición. Son listas distintas, y un campo que falte en una se tira en
silencio dejando un toast de éxito — el bug que ya documenta
`lista-blanca-de-columnas-alta-vs-edicion`.

Sin riesgo de premiar dos veces: `REWARD_TRIGGERS` solo lo consume la pantalla
de configuración, y el motor de TypeScript (`otorgarCreditos`) se llama siempre
con disparadores literales, ninguno de ellos `COMPRA`. Esos créditos salen
únicamente de la RPC, dentro de la misma transacción que la venta.
