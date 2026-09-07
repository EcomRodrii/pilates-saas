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
| `20260907090000_pos_caja` | **Nuevas** `cajas` (sesión de caja, una ABIERTA por estudio vía índice parcial) y `movimientos_caja` (libro append-only, importe SIEMPRE con signo). RLS: leer exige `puede_ver_finanzas`, y **no hay política de escritura** — todo pasa por RPC de servidor. |
| `20260907090100_pos_catalogo` | `productos_pos` + `stock`, `stock_minimo`, `iva_pct`, `descripcion`, `imagen_url`, `sku`, `codigo_barras`, `orden`. CHECK de stock no negativo, únicos parciales de SKU y código de barras por estudio. |
| `20260907090200_pos_ventas` | `ventas_pos` + `numero`, `estado`, `pago_estado`, `base_imponible`, `iva_total`, `efectivo_recibido`, `cambio`, `vendido_por`, `caja_id`, `recibo_id`, `idempotencia_clave`, `anulada_*`. **Nueva** `ventas_pos_lineas`. Backfill del correlativo de las 19 ventas existentes. **Se retiran INSERT/UPDATE/DELETE de `ventas_pos` al navegador.** |
| `20260907090300_pos_rpc_venta` | `registrar_venta_pos`, `confirmar_pago_venta_pos`, `fallar_pago_venta_pos`. |
| `20260907090400_pos_rpc_caja` | `saldo_caja`, `abrir_caja`, `mover_caja`, `cerrar_caja`. |
| `20260907090500_pos_rpc_devolucion` | `devolver_venta_pos` (parcial por línea, repone stock, retira bono intacto, apunta salida de caja). |
| `20260907090600_pos_creditos_por_compra` | `reward_rules.unidad_euros`; `otorgar_creditos_compra` y `retirar_creditos_compra`. |

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

1. **Las migraciones NO están aplicadas en producción.** Se han verificado con
   `execute_sql` + `ROLLBACK`, que prueba que el SQL es correcto, no que esté
   desplegado. Aplicar y comprobar por NOMBRE, no por número (ver
   `.claude/tentare-os.md`).
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
