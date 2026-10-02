# Cobros externos — diseño técnico (para aprobar antes de PR1)

Estado: **propuesta, sin implementar**. 2-oct-2026. Revisado contra el código por el
agente de cobros (`tentare-stripe`): 2 bloqueantes y 10 puntos importantes, todos
incorporados aquí (marcados **[rev]**).

Objetivo: que un cobro hecho fuera de Tentare (TPV del banco, transferencia, Bizum y,
más adelante, datáfonos en la nube que no son Stripe, como Viva o SumUp) llegue a
Tentare, se identifique a quién corresponde y se confirme **por la lógica de cobro que
ya existe**, sin otro sistema de cobros en paralelo.

Contexto: con el TPV del banco no hay aviso automático. La vía es que el estudio suba
el fichero de su banco y Tentare proponga el emparejamiento. Los datáfonos en la nube
sí pueden avisar, y entrarán por esta misma capa.

---

## A. Arquitectura

```
Fuentes                          Capa nueva (ingesta)                  Lo que ya existe
───────                          ────────────────────                  ────────────────
Norma 43 (fichero)  ─┐
FB 500 CaixaBank     ├─ lector ─► clasificar ─► MovimientoNormalizado ─► cobros_externos
CSV / Excel          ┘            (¿es de una alumna?)  (misma forma)     (deduplicado)
Viva / SumUp (futuro) ─ aviso firmado → re-consulta → mismo normalizador
                                                        │
                                                        ▼
                              motor de emparejamiento (puro, por LOTE)
                                                        │ candidatas + puntuación + razones
                                                        ▼
                     revisión humana (o automática, si el estudio la activa, en segundo plano)
                                                        │
                ┌───────────────────────┬───────────────┴───────────────┬──────────────────┐
                ▼                       ▼                               ▼                  ▼
        recibo cobrable          recibo YA cobrado a mano       recibo YA cobrado     sin recibo
   confirmarCobro('externo',     (sin Stripe por medio)         POR STRIPE            → crear el recibo
      fecha real)                → ENLAZAR, sin efectos         → DOBLE COBRO:        pendiente por las
                │                                                 devolver uno          vías existentes
                ▼                                                                       y volver a emparejar
  renovación → factura → créditos → [aviso] → [email]
```

Reglas de arquitectura:

1. `cobros_externos` guarda el **movimiento externo**. No es un cobro: el cobro
   confirmado sigue viviendo en `recibos`, que sigue siendo la fuente de verdad.
   Ninguna cifra financiera lee `cobros_externos`.
2. Todo cobro aceptado pasa por `confirmarCobro()` (`lib/billing/confirmar-cobro.ts`),
   el dueño único de «recibo cobrado». No se reimplementa ningún efecto.
3. Todas las fuentes producen un `MovimientoNormalizado` y alimentan **el mismo** motor.
4. Nunca se confirma solo por defecto. La confirmación automática es una opción
   explícita del estudio, con límites (E), y corre en segundo plano y en serie, nunca
   en la petición de subida.
5. Un movimiento que corresponde a un cobro **ya registrado a mano** se **enlaza**, no se
   vuelve a cobrar. Uno que corresponde a un recibo **ya cobrado por Stripe** es un
   **posible doble cobro** y se trata como tal.
6. **[rev] Un solo camino para «sin recibo»**: se crea el recibo pendiente por las vías
   que ya existen (asignar el plan, «Nuevo cobro», clase suelta) y el movimiento se
   vuelve a emparejar. **No hay «venta de mostrador» desde aquí**: la venta de la Caja
   recalcula el total desde el catálogo, fecha `now()`, descuenta stock y apunta en la
   caja de hoy. Fecharla hacia atrás acortaría el bono o la cuota.
7. **[rev] Stripe Terminal no es una fuente de `cobros_externos`**: esos cargos ya entran
   por Stripe (webhook, `app/api/terminal/*`, `reconciliaciones_pos`).

---

## B. Modelo de datos

### Qué se reutiliza (y qué no se crea)

| Entidad | Se reutiliza | Nota |
|---|---|---|
| `recibos` | Sí | Fuente de verdad. Se confirma por `confirmarCobro()`. Se añade `'externo'` al CHECK de `conciliado_por` |
| `facturas` | Sí | Por `sellarFacturaDeRecibo`, como hoy |
| `socios` | Sí | Solo se enlaza `socio_id` |
| `reservas.check_in_en` | Sí | Señal de asistencia |
| `movimientos_caja` | **No se toca** | `efectosEnOrden` ya deja la caja fuera de todo origen que no sea `manual` o `tpv` |
| `ventas_pos` | **No** desde aquí | Ver regla 6 |
| Guardia de penalizaciones de «Marcar cobrado» | Sí | `recibosDePenalizacionAnulada` (I3) |
| Cierre de sesiones de cobro abiertas | Sí | Patrón de `lib/pos/cerrar-bizum-fallido.ts` (I5) |
| Reparación de efectos | Sí | `aplicarEfectosCobro({ reparacion: true })` (I6) |
| Tabla de pagos aparte | **No se crea** | |

### Tabla nueva 1: `cobros_externos_lotes` (cada fichero subido)

| Columna | Tipo | Para qué |
|---|---|---|
| `id` | text pk | `lote-<uid>` |
| `studio_id` | text fk | |
| `fuente` | text check | `norma43`, `fb500`, `csv`, `excel` |
| `huella_fichero` | text | SHA-256 del contenido **normalizado** (un Excel guardado otra vez cambia de bytes y es el mismo) |
| `nombre_fichero` | text | Saneado, máx. 120 |
| `cuenta_final` | text null | Últimos 4 dígitos de la cuenta o del comercio. Nunca el número completo |
| `periodo_desde`, `periodo_hasta` | date | |
| `leidos`, `nuevos`, `ya_importados`, `no_de_alumnas`, `cargos`, `con_error` | int | Resumen del lote. **[rev]** Los cargos se cuentan |
| `errores` | jsonb | Línea y código; **nunca** el contenido de la línea |
| `subido_por` | uuid | |
| `subido_en` | timestamptz | |

`UNIQUE (studio_id, huella_fichero)`: el mismo fichero otra vez no hace nada y lo dice.

### Tabla nueva 2: `cobros_externos` (cada movimiento)

| Columna | Tipo | Para qué |
|---|---|---|
| `id` | text pk | `cex-<uid>` |
| `studio_id` | text fk | |
| `lote_id` | text null fk | Trazabilidad del fichero. `null` si vino por API |
| `fuente` | text check | `norma43`, `fb500`, `csv`, `excel`, `viva`, `sumup` |
| `clave_idempotencia` | text | Ver F. `UNIQUE (studio_id, clave_idempotencia)` |
| `id_externo` | text null | Id del proveedor o del banco, si lo hay |
| `tipo` | text check | `COBRO`, `LIQUIDACION` (abono agregado del datáfono) o `NO_ALUMNA` (payout de Stripe, ingreso de efectivo del propio estudio, intereses…). **[rev]** Solo `COBRO` pasa por el motor |
| `metodo` | text check | `TARJETA`, `TRANSFERENCIA`, `BIZUM`, `OTRO`. **[rev]** `OTRO` nunca se confirma solo: la persona elige el método |
| `importe_centimos` | bigint > 0 | Solo abonos |
| `moneda` | text | `EUR` |
| `fecha_operacion` | date | **Fecha real del cobro**, día del estudio (Europe/Madrid) |
| `hora_operacion` | time null | Si la fuente la da (FB 500 sí, Norma 43 no) |
| `fecha_valor` | date null | |
| `referencia` | text null | Del banco o, si el cobro salió de Tentare, la nuestra (`rec-…`) |
| `tarjeta_ultimos4` | char(4) null | |
| `tarjeta_marca` | text null | |
| `terminal_ref` | text null | |
| `pagador_nombre` | text null | Dato personal: retención limitada (G) |
| `concepto` | text null | Truncado a 140; puede llevar datos personales: retención limitada |
| `estado` | text check | Ver C |
| `decision` | jsonb | Foto de las candidatas: `{ version, calculadoEn, nivel, candidatas: [{tipo, id, socioId, puntuacion, razones[]}] }`. Ids, nunca nombres |
| `posible_duplicado_de` | text null fk self | Ver F |
| `recibo_id` | text null fk | Recibo confirmado, enlazado o en confirmación |
| `socio_id` | text null fk (`on delete set null`) | |
| `resuelto_como` | text null | `humano` o `auto` |
| `resuelto_por` | uuid null | En `auto`, quien subió el lote (M3) |
| `resuelto_en` | timestamptz null | |
| `bloqueado_en` | timestamptz null | Cuándo se tomó el cerrojo `CONFIRMANDO` |
| `descartado_motivo` | text null check | `DUPLICADO`, `NO_ES_DE_UNA_ALUMNA`, `DEVUELTO_A_LA_ALUMNA`, `OTRO` |
| `error_ultimo` | text null | Último fallo al confirmar, legible |
| `revisar_tras` | timestamptz null | **[rev]** Cuándo volver a pasar el motor (I8) |
| `datos_personales_purgados_en` | timestamptz null | |
| `creado_en`, `actualizado_en` | timestamptz | |

Índices:

- `(studio_id, estado, fecha_operacion desc)`: la bandeja.
- **[rev] B2** `UNIQUE (recibo_id) WHERE estado IN ('CONFIRMANDO','CONFIRMADO','ENLAZADO')`:
  un recibo no puede estar ligado (ni a punto de ligarse) a dos movimientos.
- `(studio_id, tarjeta_ultimos4) WHERE estado = 'CONFIRMADO'`: historial de tarjetas.

### Cambios en lo existente

- `recibos.conciliado_por`: `'externo'` en el CHECK (migración).
- `confirmarCobro()`: parámetros opcionales nuevos (H). Nada cambia para los caminos actuales.
- `reintentarFacturasPendientesDeSellar` y `averiasRecientes`: **[rev] I2** para
  `conciliado_por = 'externo'`, la ventana se ancla a `conciliado_en` (cuándo lo supo
  Tentare), no a `fecha_cobro` (cuándo pagó la alumna).
- `facturaIdParaReintento`: **[rev] M1** rama para `externo` (`fac-ext-<recibo>`,
  comprobando que no pase de 64 caracteres).
- Supresión de una alumna: `cobros_externos` se clasifica como **anonimizar** y
  `anonimizar_socio` vacía `pagador_nombre` y `concepto` y pone `socio_id` a null. Los
  movimientos con su nombre pero sin `socio_id` los cubre la retención (M8).
- `purgar_estudio_vencido`: `cobros_externos` **antes** que `cobros_externos_lotes`
  (FK), redefinida tras la guardia md5 de siempre (M8).
- `lib/db-types.ts`: regenerado con el script.

---

## C. Estados

Propongo **juntar CANDIDATO y PENDIENTE_DE_CONFIRMACION** en `POR_REVISAR`: «tener
candidatas» es un dato (la lista de `decision`), no una etapa. Un movimiento sin
candidatas también espera a una persona.

| Estado | Significa | Sale hacia |
|---|---|---|
| `IMPORTADO` | Guardado; el motor aún no ha corrido. Transitorio | `POR_REVISAR` |
| `POR_REVISAR` | Con 0, 1 o varias candidatas. Espera decisión | `CONFIRMANDO`, `ENLAZADO`, `DOBLE_COBRO`, `DESCARTADO` |
| `CONFIRMANDO` | Cerrojo con `recibo_id` puesto, mientras se llama a `confirmarCobro()` | `CONFIRMADO`, `DOBLE_COBRO`, o vuelve a `POR_REVISAR` con `error_ultimo` |
| `CONFIRMADO` | Se confirmó un recibo a partir de este movimiento | Final |
| `ENLAZADO` | Corresponde a un cobro **apuntado a mano** que ya estaba. Sin efectos de dinero | Final |
| **[rev]** `DOBLE_COBRO` | El recibo ya estaba cobrado **por Stripe**, o por otro movimiento, y este pago parece una segunda vez. Alguien tiene que devolver uno | `DESCARTADO` (`DEVUELTO_A_LA_ALUMNA`) cuando se devuelve, o `ENLAZADO` si la persona comprueba que no era doble |
| `DESCARTADO` | No es de una alumna, es un duplicado del mismo dato, se devolvió… con motivo | Final (se puede reabrir a `POR_REVISAR`) |

`LIQUIDACION` y `NO_ALUMNA` no entran en esta máquina: se guardan para el cuadre futuro
y no aparecen en la bandeja (sí en el resumen del lote).

**[rev] I6** Recuperación de un `CONFIRMANDO` colgado (la función murió), pasados
2 minutos desde `bloqueado_en`:

- si el recibo está `COBRADO` con `conciliado_por = 'externo'` y nadie más lo tiene
  ligado (lo garantiza el índice de B2) → `CONFIRMADO` y
  `aplicarEfectosCobro({ reparacion: true, avisarSocia: false })`, como
  `confirmarCobroExitoso`, para que no se quede sin renovar ni facturar;
- si el recibo sigue cobrable → vuelve a `POR_REVISAR`.

`DOBLE_COBRO` cuenta en la bandeja de pendientes de la propietaria: hay dinero de una
alumna que devolver.

Nada final se deshace desde aquí. Lo confirmado por error se corrige con los flujos que
ya existen (devolución y factura rectificativa).

---

## D. Flujo completo

**Fichero (Norma 43, FB 500, CSV, Excel)**

1. Recepción o la propietaria sube el fichero (pantalla en PR2; en PR1, la API).
   - Norma 43, FB 500 y CSV: se leen **en el servidor**, con lectores propios y puros.
   - Excel: se convierte a filas **en el navegador** con `parseXlsx`, como en la
     importación de clientas. `xlsx` 0.18.5 tiene vulnerabilidades conocidas al abrir
     ficheros y no se ejecuta en el servidor. Las filas se validan igual que las de un CSV.
2. El fichero no se guarda. Si su huella ya existe, se para ahí.
3. **[rev] Clasificar** cada línea antes de nada:
   - cargo → se cuenta y se ignora;
   - abono agregado del datáfono → `LIQUIDACION`;
   - payout de Stripe, ingreso de efectivo del estudio, intereses → `NO_ALUMNA`, por
     patrones del concepto. Los patrones son una lista que crece con cada banco real;
   - el resto → `COBRO`.
4. Inserción con `ON CONFLICT (studio_id, clave_idempotencia) DO NOTHING`.
5. Detección de posible duplicado entre fuentes (F).
6. **El motor corre por lote** (E), no movimiento a movimiento: un recibo no puede ser
   la candidata clara de dos movimientos del mismo lote.
7. Si el estudio activó la confirmación automática, los casos que cumplen todos los
   límites se encolan. **[rev] M11** Se confirman en un trabajo en segundo plano (pg_cron
   → ruta, con la misma comprobación previa de «hay algo que hacer» que los webhooks),
   en serie y por tandas, **nunca** en la petición de subida.
8. El resto espera en «Cobros por identificar».

**Confirmar (persona o trabajo automático)**

1. Cerrojo: `UPDATE … SET estado = 'CONFIRMANDO', recibo_id = $r, bloqueado_en = now()
   WHERE id = $m AND estado = 'POR_REVISAR'`. **[rev] B2** El `recibo_id` va en el mismo
   UPDATE, así que el índice único para a un segundo movimiento antes de llamar a nada.
   Si no toca ninguna fila, otra persona ya lo resolvió.
2. Comprobaciones en el servidor, con el recibo leído en ese momento:
   - mismo estudio; importe exacto; recibo cobrable para `externo` (H);
   - **[rev] I3** no es una penalización anulada ni reembolsada
     (`recibosDePenalizacionAnulada`). En automático, si no se puede comprobar, **no se
     confirma**;
   - **[rev] I5** sin cargo en vuelo: ni `cobro_mostrador_pi` ni sesiones de cobro
     abiertas. Si hay sesión abierta (`checkout_session_id`,
     `cobro_mostrador_checkout_session_id`), se **expira en Stripe antes** de confirmar,
     con el patrón de `cerrar-bizum-fallido.ts`. Si no se puede expirar, no se confirma;
   - **[rev] M7** no es un `rec-cita-*`: `citas.pagada` la escribe hoy el navegador, y
     por aquí la cita quedaría sin pagar. Queda fuera en PR1.
3. `confirmarCobroExterno()` → `confirmarCobro({ origen: 'externo', fechaCobro,
   importeEsperado, metodo, facturaId: 'fac-ext-…', avisarSocia, notificar, actor })`.
4. Según el resultado:
   - `aplicada` → `CONFIRMADO`.
   - `ya_estaba` → el recibo se cobró por otro camino entre medias. **[rev] B1**:
     - si lo cobró otro movimiento → vuelve a `POR_REVISAR` («ya lo cobró otro
       movimiento»; puede ser un doble pago de la alumna → `DOBLE_COBRO` si coincide el
       pagador o la tarjeta);
     - si se apuntó a mano, sin Stripe por medio (`stripe_payment_intent_id` y
       `cobro_mostrador_pi` vacíos y `conciliado_por = 'manual'`) y cuadran importe,
       método y fecha (±3 días) → `ENLAZADO`;
     - en cualquier otro caso (Stripe por medio) → `DOBLE_COBRO`.
   - `devuelto` o error → vuelve a `POR_REVISAR` con `error_ultimo`.
5. **[rev] I7** En serie al menos por suscripción: dos recibos de la misma suscripción
   confirmados a la vez leerían la misma `fecha_fin` y la socia perdería un mes. Es la
   misma razón por la que «Marcar cobrado» va en serie.

**Enlazar (cobro apuntado a mano)**

**[rev] B1 + I1** Solo recibos cuyo dinero **no pasó por Stripe**: `COBRADO` con
`stripe_payment_intent_id IS NULL`, `cobro_mostrador_pi IS NULL`,
`conciliado_por = 'manual'` y sin movimiento ligado; mismo importe, mismo tipo de método
y `fecha_cobro` a ±3 días. **No escribe nada en `recibos`**: el enlace vive solo en
`cobros_externos.recibo_id`. Escribir `conciliado_*` pisaría quién cerró el cobro (lo
leen `reentregaAplicaAlRecibo` y `facturaIdParaReintento`) y rompería el criterio de
«COBRADO sin `conciliado_en` = nunca verificado». Si algún día se quiere enseñar en el
recibo, irá en una columna aparte.

**Sin recibo**

**[rev] I9** «Crear el recibo» con las vías existentes (asignar plan desde la ficha,
«Nuevo cobro», clase suelta). Ese recibo nace pendiente, el movimiento se vuelve a
emparejar y se confirma por `confirmarCobro('externo')`. Un único camino.

**Volver a emparejar**

**[rev] I8** El motor vuelve a pasar sobre lo que sigue en `POR_REVISAR` al abrir la
bandeja y una vez al día. Así, una transferencia que llegó antes de que el cron creara
el recibo de renovación lo encuentra al día siguiente. Mientras una alumna tenga un
recibo pendiente o próximo del mismo plan, la bandeja no ofrece crearle otro.

**Futuro: Viva / SumUp**: aviso firmado → re-consulta al proveedor (nunca fiarse del
cuerpo del aviso) → `MovimientoNormalizado` → mismo `INSERT … ON CONFLICT` → mismo motor.
Un cobro lanzado desde Tentare trae nuestra `referencia` y el motor lo da por cierto.

---

## E. Motor de emparejamiento

Función pura `emparejarLote(movimientos, contexto) → decisiones` en
`lib/cobros-externos/emparejar.ts`, con su `version`. El contexto se carga una vez por
lote (recibos del estudio indexados por importe, reservas con check-in, historial de
movimientos confirmados).

### Filtros (sin pasar estos, no es candidata)

| Filtro | Regla |
|---|---|
| Tipo | Solo movimientos `COBRO` |
| Importe | **Exactamente** igual, en céntimos. No hay pagos parciales en esta fase |
| Para cobrar | Recibo en un estado admitido para `externo` (H). Fuera: `EN_CURSO`, con `cobro_mostrador_pi`, `rec-cita-*`, penalización anulada o reembolsada, con `reembolso_*` |
| Para enlazar | `COBRADO`, cobrado a mano sin Stripe (D), sin movimiento ligado |
| Estudio | El del movimiento |
| Fecha | Vencimiento entre 45 días antes y 10 después de la operación. Para enlazar, `fecha_cobro` a ±3 días |
| Método | Para enlazar, el mismo tipo (tarjeta con tarjeta; transferencia o Bizum con transferencia o Bizum) |

Un recibo `COBRADO` por Stripe con el mismo importe no es candidata: si aparece, el
movimiento se señala como posible `DOBLE_COBRO` para que lo vea una persona.

### Señales y pesos (0 a 100, con tope)

| Señal | Puntos | Explicación |
|---|---|---|
| Referencia de Tentare en el movimiento | **100 y decide** | «Lleva la referencia de este recibo» |
| Pagador ≈ alumna (similitud ≥ 0,9) | +45 | «Pagador: María García» |
| Coincide el apellido, o similitud ≥ 0,75 | +25 | «El pagador se apellida García» |
| Tarjeta ···1234 de la misma marca, confirmada antes con esta alumna | +35 | «Pagó con la ···1234 el 1-sep» |
| Solo coinciden los 4 dígitos | +20 | |
| Check-in ese día, y la hora del cobro entre 60 min antes y 30 después de su clase | +20 | «Vino a la clase de las 18:30» |
| Tenía reserva ese día (sin hora o sin check-in) | +8 | «Tenía clase ese día» |
| El concepto menciona a la alumna, la cuota o el mes | +10 a +20 | «Concepto: "cuota octubre"» |
| El recibo vence a ±7 días | +10 | «Su cuota vence el 1-oct» |
| Mismo mes | +5 | |
| Pagó este importe por este método en los últimos 3 meses | +10 | «Pagó 59 € con tarjeta en agosto y septiembre» |
| Único recibo pendiente de ese importe en el estudio | +10 | «Es la única cuota pendiente de 59 €» |

Cuota y bono pendientes no son señales distintas: los dos son recibos pendientes. La
explicación dice cuál es (`tipoDePlanDelRecibo`).

### Decisión

| Nivel | Cuándo | Qué pasa |
|---|---|---|
| `REFERENCIA` | Referencia de Tentare válida | Candidata única y cierta |
| `UNICA_CLARA` | Una candidata ≥ 80, la siguiente al menos 40 por debajo, **[rev] B2** y ningún otro movimiento del lote la reclama | Arriba. Único nivel que puede confirmarse solo |
| `VARIAS` | Dos o más a menos de 40 puntos, **o** dos movimientos reclaman el mismo recibo | Lista. **Nunca** automática |
| `NINGUNA` | Nadie pasa los filtros | «Buscar alumna», «Crear el recibo» o «Descartar» |

Límites de la confirmación automática, aunque el estudio la active:

- solo `REFERENCIA` o `UNICA_CLARA`;
- nunca con `posible_duplicado_de`, ni con aviso de `DOBLE_COBRO`;
- nunca con `metodo = OTRO`;
- nunca si la operación es de un mes ya cerrado o de un trimestre anterior (`NEEDS_LEGAL_REVIEW`, H);
- nunca para enlazar (enlazar no mueve dinero, pero sí afirma algo; lo hace una persona);
- nunca si no se pudo comprobar la guardia de penalizaciones o expirar una sesión abierta.

Ejemplo de explicación:

```
59,00 € · 1-oct 18:32 · tarjeta ···1234
→ María García · cuota de octubre        92 / 100   UNICA_CLARA
   ✓ importe exacto (59,00 €)
   ✓ vino a la clase de las 18:30
   ✓ pagó con la ···1234 el 1-sep
   ✓ su cuota vence el 1-oct
→ siguiente: Laura Pérez                  38 / 100
```

---

## F. Idempotencia y duplicados

### Clave por fuente

| Fuente | `clave_idempotencia` |
|---|---|
| API (Viva, SumUp) | `api:<fuente>:<cuenta>:<id_externo>` |
| FB 500 | `fb500:<comercio>:<terminal>:<fecha>:<hora>:<autorización>:<importe>` (y la referencia si viene) |
| Norma 43 | `n43:<cuenta>:<fecha_op>:<fecha_valor>:<importe>:<documento>:<ref1>:<ref2>:<hash conceptos>#<n>` |
| CSV / Excel con columna de id | `csv:<id de la operación>` |
| CSV / Excel sin id | Como Norma 43, con las columnas elegidas, y `#<n>` |

`#<n>` es el número de aparición de esa misma línea en su cuenta y su día, en el orden
del fichero. Dos cobros idénticos el mismo día entran como `#1` y `#2`. Al volver a
subir el día, o un fichero que lo solapa, salen las mismas claves y no entra nada nuevo.
Si un fichero trae el día a medias y otro entero, el segundo añade solo lo que faltaba.

### Los tres casos

| Caso | Qué lo para |
|---|---|
| El mismo fichero dos veces | `UNIQUE (studio_id, huella_fichero)`: ni se lee |
| Movimientos solapados | `UNIQUE (studio_id, clave_idempotencia)` |
| El mismo cobro por fichero y por API | Claves distintas; se detecta aparte: mismo estudio, mismo importe y, o bien misma tarjeta y hora a ±3 min, o bien mismo pagador el mismo día, de **otra** fuente. Se marca `posible_duplicado_de`, nunca automático, decide una persona. Si el otro ya está `CONFIRMADO`, la primera opción es «Descartar como duplicado» |

### En la confirmación

- Cerrojo `POR_REVISAR → CONFIRMANDO` con `recibo_id` en el mismo UPDATE, e índice único
  sobre `CONFIRMANDO`, `CONFIRMADO` y `ENLAZADO` **[rev] B2**.
- `confirmarCobro()` es un compare-and-set: un `COBRADO` no se vuelve a cobrar.
- **[rev] M5** El CAS de `externo` exige además el importe (`importeEsperado`, como texto
  con dos decimales para comparar el `numeric` sin redondeos) y `importe_devuelto = 0`.
- Factura: `sellarFacturaDeRecibo` busca por id y por `recibo_id` y no duplica. Id
  `fac-ext-<recibo>`.
- Renovación: idempotente por la foto `entrega_tipo` y por la RPC por recibo de los
  bonos **[rev] I7**. Lo que no protege (dos recibos de la misma suscripción a la vez) se
  evita confirmando en serie.
- Créditos: `reward_actions` único por recibo.

---

## G. Seguridad, privacidad y RLS

| Tema | Propuesta |
|---|---|
| Quién | Subir, ver, confirmar, enlazar y descartar: `puedeMoverDinero` (PROPIETARIO y RECEPCIÓN), comprobado en el servidor. MANAGER no |
| RLS | Tablas **de servidor**: RLS sin políticas y sin permisos para `anon`/`authenticated`. **[rev] M10** La migración comprueba SELECT, INSERT, UPDATE y DELETE con `has_table_privilege` |
| El fichero | No se guarda. Se lee en memoria y se descarta. Se conserva la huella, el nombre saneado y el resumen |
| Tamaño | Máx. 4 MB (Vercel admite 4,5 MB) y 5.000 líneas; límite de subidas por minuto |
| Logs y Sentry | Nunca el contenido de una línea, ni nombres ni conceptos. Solo recuentos, códigos y números de línea |
| Nunca se guarda | Un número de tarjeta completo (cualquier secuencia de 13 a 19 dígitos se recorta a 4 antes de nada), el IBAN del pagador, los saldos de la cuenta, el número completo de la cuenta del estudio |
| Retención | `pagador_nombre` y `concepto` se vacían a los **90 días** de resolverse, y a los **180** si sigue sin resolver (cron diario en SQL). Se conservan importe, fechas, método, últimos 4, referencia y recibo. `NEEDS_LEGAL_REVIEW` |
| Supresión de una alumna | Anonimizar (B) |
| Pagadores que no son alumnas | Solo abonos; los descartados pierden los datos personales con la misma retención. `NEEDS_LEGAL_REVIEW`: base para tratar datos de terceros del extracto y si el DPA con los estudios lo cubre |
| Auditoría | **[rev] M3** Entrada propia en el libro (`cobro_externo.confirmado`, `.enlazado`, `.descartado`, `.doble_cobro`) con la persona como actor; en `auto`, quien subió el lote y la marca «automático». No se reutiliza `anotarCobroMarcadoAMano`: al enlazar no cambia ninguna columna del cobro y daría avisos de «sin cambio» |
| Repo público | Ningún fichero real en el repo. Los tests usan ficheros inventados |

---

## H. Integración con `confirmarCobro()`

### Cambios (compatibles con los caminos actuales)

```ts
interface ParamsConfirmarCobro {
  // …lo que ya hay…
  /** Fecha real del cobro (YYYY-MM-DD, día del estudio). Sin ella, hoy, como ahora. */
  fechaCobro?: string;
  /** Si viene, el compare-and-set exige también este importe (texto con 2 decimales) e importe_devuelto = 0. */
  importeEsperado?: string;
  /** Pedir el aviso al estudio aunque el origen no lo emita por defecto (solo confirmación automática). */
  notificar?: boolean;
}
type OrigenCobro = 'webhook' | 'conciliador' | 'tpv' | 'manual' | 'off_session' | 'externo';
```

- `fecha_cobro = p.fechaCobro ?? hoyEnEstudio(...)`. **[rev] M6** Se valida: formato, no
  futura, y no más de 400 días atrás.
- **[rev] I4** `estadosAdmitidosPorOrigen('externo')` = lo mismo que `manual`
  (`ESTADOS_COBRABLES`, sin `EN_CURSO`). Incluye el `DEVUELTO` que devolvió el banco
  (SEPA rechazado que la alumna paga luego por transferencia, el caso más típico): el
  CAS ya filtra `estado <> DEVUELTO OR importe_devuelto = 0` y las guardas `reembolso_*`.
- **[rev] I5** El UPDATE de `externo` pone también `proximo_reintento = null`.
- `conciliadoPorDe('externo') = 'externo'`.
- `confirmarCobroExterno()` en el mismo módulo que los demás envoltorios, para probarlo
  con `node --test`.

### Efectos para `externo`

| Efecto | ¿Se aplica? | Por qué |
|---|---|---|
| Renovación (bono o cuota) | Sí | Idempotente por `entrega_tipo` y por recibo; MENSUAL se ancla a `fecha_fin` de la suscripción, no a la fecha del cobro. **[rev] I7** En serie por suscripción. Un recibo con `tras_cancelar_cuota` salda la deuda sin renovar, como hoy |
| Factura | Sí, si el estudio emite facturas y el método la genera | `fac-ext-<recibo>`. Reintento anclado a `conciliado_en` **[rev] I2** |
| Caja | **No** | `efectosEnOrden` ya la deja fuera de todo origen que no sea `manual` o `tpv` |
| Créditos | Sí | Idempotentes |
| Aviso al estudio | Solo si fue automático (`notificar: true`) **[rev] M2** | Si lo confirmó una persona, ya lo sabe |
| Email a la alumna | Solo si quien confirma lo marca (apagado por defecto) | Como «Marcar cobrado» |

### Lo que cambia una fecha en el pasado **[rev] M6**

- Los informes por mes de cobro (`situacion-recibo.ts`, `recibo_importe_ingresado`)
  cuentan el ingreso en el mes en que pagó la alumna, aunque ese mes ya se hubiera
  mirado. Es lo correcto, pero la confirmación lo avisa si el mes está cerrado.
- El webhook de la API `recibo.actualizado` lleva a la contabilidad externa una
  `fechaCobro` pasada.
- La factura cae en el mes en que se confirma y el ingreso en el mes del cobro.

### Facturación — `NEEDS_LEGAL_REVIEW`

Tentare no afirma nada sobre cumplimiento. El diseño conserva la fecha real y usa la
lógica de facturación existente sin cambiarla. Para revisar con quien os asesore:

1. **Fecha de expedición frente a fecha de la operación.** La fecha de emisión es el día
   en que se sella. Con un fichero, la factura sale días después del cobro. Veri*Factu
   tiene un campo opcional `FechaOperacion` que hoy no usamos. ¿Debe informarse cuando
   difieren? ¿Y en la factura impresa?
2. **Cobros de un periodo ya declarado.** Un cobro de septiembre confirmado en octubre,
   con el trimestre cerrado: ¿se emite, se avisa o se bloquea? Provisional: avisar y no
   confirmarlo nunca solo.
3. **Factura en un mes e ingreso en otro** (punto anterior).
4. **Datos de terceros y retención** (G).

Ninguno bloquea PR1: el diseño los deja fuera del camino automático.

---

## I. Tests de PR1

`node --test --experimental-strip-types`, con ficheros inventados en
`lib/cobros-externos/fixtures/`.

**Lectores y clasificación**

- Norma 43: fichero válido de dos días; conceptos complementarios (23); cargos contados e
  ignorados; total del registro 33 que no cuadra → corrupto; líneas cortadas; latin-1.
- FB 500: válido; operación pendiente de liquidar; devolución; columnas de más.
- CSV y Excel: `;` y `,`; coma y punto decimal; fechas `dd/mm/aaaa` e ISO; columnas en
  otro orden; **columnas desconocidas** (se ignoran y se avisa); sin columna de importe
  → error claro.
- Un número de tarjeta completo en un concepto → solo quedan 4 dígitos.
- **[rev] I10** Un payout de Stripe y un ingreso de efectivo con el importe exacto de una
  cuota pendiente → `NO_ALUMNA`, nunca candidatas.

**Idempotencia**

- **El mismo fichero dos veces** → no inserta nada y avisa.
- **Movimiento duplicado** en dos ficheros solapados → entra una vez.
- Dos cobros idénticos el mismo día → entran los dos (`#1`, `#2`).
- El mismo cobro por fichero y por API → `posible_duplicado_de`.

**Motor**

- **Importes diferentes** → ninguna candidata (59,00 € frente a 59,01 €).
- **Una única candidata** → `UNICA_CLARA` con sus razones.
- **Dos alumnas con el mismo importe** → `VARIAS`; nunca automático.
- **Múltiples candidatas**, ordenadas y con desempate estable.
- **Pago sin candidata** → `NINGUNA`.
- Referencia de Tentare → `REFERENCIA`.
- **[rev] B2** Dos movimientos idénticos del lote sobre el mismo recibo → `VARIAS`, nunca
  dos `UNICA_CLARA`.
- Cobro apuntado a mano → candidata para enlazar, no para cobrar.
- **[rev] B1** Recibo cobrado por Stripe con el mismo importe → no es candidata para
  enlazar; aviso de `DOBLE_COBRO`.
- No son candidatas: `EN_CURSO`, con `cobro_mostrador_pi`, `rec-cita-*`, penalización
  anulada, con `reembolso_*`.
- **[rev] I4** `DEVUELTO` por el banco (`importe_devuelto = 0`) sí es candidata; uno
  reembolsado por el estudio, no.
- **[rev] I8** Recibo de renovación creado después del movimiento → la segunda pasada lo
  encuentra.

**Confirmación (con dobles de `confirmarCobro`)**

- **Pago ya confirmado**: un movimiento `CONFIRMADO` que se pide otra vez → nada.
- Dos confirmaciones a la vez del mismo movimiento → una sola llamada.
- **[rev] B2** Dos movimientos distintos sobre el mismo recibo a la vez → el índice para
  al segundo antes de `confirmarCobro()`.
- `ya_estaba`: por otro movimiento → `POR_REVISAR`; a mano sin Stripe y cuadra →
  `ENLAZADO`; por Stripe → `DOBLE_COBRO`.
- **Fecha del cobro distinta de la de confirmación** → `fecha_cobro` real; renovación
  igual.
- `importeEsperado` distinto, o `importe_devuelto > 0` → no se cobra.
- **Factura ya existente** → no se emite otra.
- **Bono ya entregado** → no se entrega dos veces.
- **[rev] I7** Dos recibos de la misma suscripción en el mismo lote → en serie; la
  `fecha_fin` avanza dos veces.
- Sin apunte de caja.
- **[rev] I5** Recibo con sesión de cobro abierta → se expira antes; si no se puede, no se
  confirma. `proximo_reintento` queda a null.
- **[rev] I3** Penalización anulada → no se confirma; en automático, si no se puede
  comprobar, tampoco.
- **[rev] I6** `CONFIRMANDO` colgado con el recibo ya `COBRADO` → `CONFIRMADO` y efectos
  reparados; con el recibo aún cobrable → `POR_REVISAR`.
- **[rev] I2** Factura que falla al sellar un cobro con fecha de hace 10 días → el
  reintento la encuentra (ventana por `conciliado_en`).
- Confirmación automática: apagada por defecto; con `VARIAS`, posible duplicado,
  `OTRO`, mes cerrado o sin poder comprobar la penalización, no confirma.

**Guardias del repo**

- `supresion-cobertura.test.ts` con la tabla nueva clasificada.
- Tablas nuevas sin SELECT/INSERT/UPDATE/DELETE para `anon`/`authenticated`.
- Purga: `cobros_externos` antes que `cobros_externos_lotes`.
- `repo-publico-guardia.test.ts` con los ficheros inventados.

---

## J. Riesgos

| Riesgo | Mitigación |
|---|---|
| Esconder un doble pago de una alumna | **[rev]** `DOBLE_COBRO` como estado propio, en la bandeja de pendientes; enlazar solo cobros a mano sin Stripe |
| Cada banco exporta distinto | Lectores probados con ficheros reales antes del PR (no entran en el repo); CSV/Excel genérico como plan B |
| Una alumna equivocada marcada como pagada | Confirmación humana por defecto; importe exacto; explicación visible; límites en lo automático |
| Abonos que no son de alumnas (payouts, efectivo) | Clasificación antes del motor; nunca automáticos |
| Cobros en vuelo (Checkout, mostrador, dunning) | Expirar sesiones antes; excluir los que tienen cargo en vuelo; `proximo_reintento` a null |
| Renovar dos veces o perder un mes | En serie por suscripción |
| Fiscalidad | `NEEDS_LEGAL_REVIEW`; fuera de lo automático |
| Datos de terceros | Solo abonos, sin guardar el fichero, retención corta |
| `xlsx` vulnerable | Solo en el navegador |
| Lotes grandes y tiempo de función | Lo automático en segundo plano, en serie y por tandas |
| Cuota de Vercel | Dos PR, no cuatro |

---

## J2. Escala: cero trabajo por estudio

Nada de esto se configura estudio a estudio. Cada estudio lo hace solo:

| Pieza | Cuántas veces se construye | Qué hace el estudio |
|---|---|---|
| **Norma 43** | **Una**, para todos los bancos españoles (es el formato estándar de la banca española) | Descarga el fichero de su banca online y lo arrastra a Tentare. Trae transferencias, Bizum y el abono diario del datáfono |
| **Detección del formato** | Una | Nada: Tentare reconoce si es Norma 43, FB 500 o una plantilla conocida |
| **FB 500 (CaixaBank)** | Una, para todos los estudios de CaixaBank | Igual: descargar y arrastrar |
| **Excel o CSV de otro banco** | Ninguna por nuestra parte | La primera vez, el estudio dice qué columna es el importe, la fecha… (como al importar clientas). Tentare lo recuerda como plantilla |
| **Plantillas compartidas** | Se reutilizan solas | Cuando un estudio ha preparado la plantilla de un banco, Tentare la ofrece a los demás estudios de ese banco. Solo se comparte qué columna es cada dato, nunca datos |
| **Ayuda** | Un artículo por banco («dónde se descarga el fichero»), escrito una vez | Lo sigue |

**Más adelante, sin subir nada:** conectar la cuenta del banco por open banking
(Enable Banking, Tink o Salt Edge). El estudio da permiso una vez, que dura hasta
180 días, y Tentare recibe los movimientos cada día, sin ficheros. Sirve para
transferencias, Bizum y el total diario del datáfono. El detalle cobro a cobro del
datáfono sigue necesitando el fichero del banco.

**Y para quien cambie de datáfono:** una sola integración con Viva o SumUp sirve a
todos sus estudios. Cada estudio conecta su cuenta y nada más.

---

## K. Decisiones para aprobar antes de PR1

1. **Estados**: `POR_REVISAR` en lugar de CANDIDATO + PENDIENTE_DE_CONFIRMACION, más
   `CONFIRMANDO`, `ENLAZADO` y **`DOBLE_COBRO`**.
2. **Enlazar solo cobros apuntados a mano sin Stripe**, y sin escribir en `recibos`.
3. **Sin «venta de mostrador»**: lo que no tiene recibo se resuelve creando el recibo
   pendiente por las vías existentes y volviendo a emparejar.
4. **Stripe Terminal no entra** en `cobros_externos` (ya entra por Stripe).
5. **Tablas de servidor**, con `puedeMoverDinero` para todo.
6. **El fichero no se guarda**; retención de datos personales: 90 días tras resolver y
   180 sin resolver (`NEEDS_LEGAL_REVIEW`).
7. **`confirmarCobro()`** recibe `fechaCobro`, `importeEsperado` y `notificar`
   (opcionales) y el origen `'externo'`, que admite lo mismo que `manual`, incluido el
   `DEVUELTO` por el banco.
8. **Sin apunte en caja**, factura `fac-ext-…`, reintento de factura anclado a
   `conciliado_en`.
9. **Email a la alumna apagado por defecto**; aviso al estudio solo si fue automático.
10. **Confirmación automática apagada por defecto**; activada, en segundo plano y en
    serie, solo `REFERENCIA` o `UNICA_CLARA`, con los límites de la sección E.
11. **Pesos y umbrales iniciales** de la sección E (80, con 40 de margen).
12. **Excel en el navegador**, el resto de formatos en el servidor.
13. **Fuera de PR1**: `rec-cita-*`, pagos parciales, deshacer, cuadre diario, Viva y SumUp.
14. **Dos PR**, por la cuota de Vercel:
    - **PR1, backend sin pantalla** (~2–2,5 semanas):
      - migración y cambios en `confirmarCobro()`;
      - lectores, clasificación y motor por lote;
      - confirmación con cerrojo, recuperación y trabajo automático en segundo plano;
      - rutas de API (subir, listar, confirmar, enlazar, descartar, marcar doble cobro);
      - retención y todos los tests.
    - **PR2, pantalla** (~1–1,5 semanas): «Cobros por identificar» en Cobros, subida del
      fichero, crear el recibo desde la bandeja, `DOBLE_COBRO` en la bandeja de
      pendientes y ayuda.
15. **Plantillas de columnas compartidas entre estudios** del mismo banco (solo la
    correspondencia de columnas, nunca datos).
16. **Antes de PR1**, una sola vez y no por estudio: un Norma 43 real de **cualquier**
    cuenta de empresa (sirve la de Tentare o la de un estudio de pruebas) para validar el
    lector contra un fichero de verdad. El FB 500 puede esperar al primer estudio de
    CaixaBank. Ninguno entra en el repo.
