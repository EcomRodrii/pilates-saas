# Cifras de dinero: de dónde sale cada una

Fuente de verdad de las cifras financieras del panel (y, cuando exista, de la API
pública). Escrito en F0 (1-oct-2026), tras el feedback de un estudio: «las cifras
no cuadran». Si una pantalla nueva enseña dinero, lee esto antes.

## La regla

**Un recibo se lee siempre con `lib/billing/situacion-recibo.ts`.** Nunca con
`estado === 'COBRADO'` a mano ni sumando `importe` en bruto. La mitad SQL es
`public.recibo_importe_ingresado(estado, importe, importe_devuelto)`, y
`situacion-recibo.test.ts` comprueba que las RPC de Informes la usan.

| Situación | Estados | ¿Ingreso? | ¿Deuda? |
|---|---|---|---|
| `COBRADO` | COBRADO (con o sin reembolso parcial) | Sí, **neto**: `importe − importe_devuelto` | No |
| `POR_COBRAR` | PENDIENTE | No | Sí |
| `IMPAGADO` | FALLIDO · DEVUELTO **por el banco** (`importe_devuelto = 0`, sin reembolso pedido) | No | Sí |
| `EN_CURSO` | EN_CURSO (remesa o adeudo enviado, sin respuesta del banco) | No | No (todavía): se enseña aparte |
| `REEMBOLSADO` | DEVUELTO con el dinero devuelto entero por el estudio · COBRADO con `importe_devuelto ≥ importe` | No | No |
| `ANULADO` | ANULADO | No | No |

`DEVUELTO` son dos cosas opuestas y solo las distingue `esReciboCobrable`
(`lib/billing/deuda-recibo.ts`), que es la misma regla que el bloqueo por impago
(`socio_tiene_impago`).

**El mes** de un recibo cobrado es el de `fecha_cobro`, aunque venza en otro mes. Lo
no cobrado va por `fecha_vencimiento`. Las fechas se comparan como texto
`'YYYY-MM-DD'` y el «hoy» es `hoyEnEstudio()`: nunca `new Date('YYYY-MM-DD')`, que
en un navegador al oeste de UTC cae en el día anterior.

**Todo es bruto con IVA y antes de comisiones de Stripe.** Así se dice en pantalla.
Ninguna cifra va a coincidir con el banco sin restar esas comisiones.

## Cada cifra

| Cifra | Pantalla | Cálculo |
|---|---|---|
| Ingresos cobrados este mes, sparkline, comparativa | Inicio | `importeIngresado` por mes de cobro (mes del estudio) |
| Gráfico «Ingresos cobrados» | Inicio (gráficos personalizados) | `importeIngresado` por día de cobro |
| Cobrado este mes | Cobros | `resumirRecibos(...).ingresado` del mes |
| Pendiente cobro | Cobros | `porCobrar + impagado`; lo `EN_CURSO` va en su línea («enviados al banco») |
| Clientas con deuda | Cobros | clientas con algo `POR_COBRAR` o `IMPAGADO` |
| Ingreso medio por clienta | Cobros | lo cobrado **a clientas** en el mes ÷ clientas activas |
| Lista «Todo lo que me deben» | Cobros | `estaSinCobrar`: por cobrar + impagado + en curso, cada uno con su estado |
| «X € cobrado» por mes | Cobros › Lo que he cobrado | agrupado por `mesDelRecibo`, suma `importeIngresado` |
| Ingresos período, Ingresos del mes, gráfico | Informes | RPC `informe_ingresos_neto` / `ingresos_por_dia` (neto) con el rango de `lib/informes/periodo.ts` |
| Ticket medio de quien pagó | Informes | `total_socias ÷ n_socias_unicas` (sin ventas de mostrador anónimas) |
| Ventas por tipo | Informes | RPC `ventas_por_tipo` (neto) |
| Facturado este mes y % frente al anterior | Cobros › Facturas | `facturas.fecha_emision` del mes del estudio y su anterior (`mesAnterior`) |
| Cierre anual/trimestral, IVA, 347 | Cierre y correo a la gestoría | todas las facturas emitidas (selladas o no) + ingresos manuales; **fuera** las que tienen el registro ANULADO en la AEAT |
| Gasto total | Ficha de la clienta | suma de `importeIngresado` |
| Pendiente de cobro | Ficha de la clienta (cabecera) | suma de `importeAdeudado` (por cobrar + impagado), como «Pendiente cobro» de Cobros; debajo, cuántos pagos fallidos lleva |
| Cobros pendientes | Centro de Control (bandeja) | `POR_COBRAR` (se resuelve cobrando) |
| Cobros sin cobrar | Bandeja única («decidir») | `IMPAGADO` |

## Ventas del TPV

Desde el TPV de servidor, cada venta pagada crea su recibo `rec-pos-*` y lo enlaza en
`ventas_pos.recibo_id`. **Las cifras cuentan el recibo, no la venta.** Una devolución
de la venta llega a su recibo por el trigger `trg_venta_pos_devolucion_a_recibo`.
Una parcial deja el recibo COBRADO con `importe_devuelto`; una total lo pone DEVUELTO.

Una venta pagada **sin** recibo no suma en ninguna cifra. No se le inventa uno: se
cuenta aparte (`lib/pos/ventas-sin-recibo.ts`) y se avisa en «Lo que he cobrado» y
en Informes. El 1-oct-2026 eran 7 ventas de la primera versión de la caja
(667,50 €), sin nada con lo que enlazarlas. Otras 12 tenían su recibo gemelo y se
enlazaron (migración `…_ventas_pos_enlaza_recibos_gemelos`).

## Lo que el modelo no tiene (no inventarlo)

- **Moneda.** Todo es EUR por construcción.
- **Momento del cobro.** `recibos` no tiene `creado_en` ni `actualizado_en`, y `fecha_cobro`
  es solo fecha.
- **Desglose de IVA en el recibo.** Base y cuota solo existen en la factura y en la
  venta del TPV.
- **Comisión de Stripe y neto de cada cobro.**
- **Precio pactado de una suscripción.** Siempre sale del catálogo actual.
- **Fecha propia de un reembolso parcial.** Se resta en el mes del cobro, no en el del
  reembolso.
- **Cobros COBRADO sin `metodo_cobro`.** Eran 33 el 1-oct-2026; enlazar las ventas
  del TPV con su recibo rellenó 12. De los que quedan no se sabe, contablemente, si
  fueron por banco o por caja.
