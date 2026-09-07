-- ═══════════════════════════════════════════════════════════════════════════
-- POS · La venta: número, estado de pago, desglose por línea y caja
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Cuatro agujeros que esta migración cierra, y por qué importan:
--
-- 1. NO HABÍA NÚMERO DE VENTA. Ni correlativo, ni referencia que dictar por
--    teléfono. La única forma de nombrar una venta era su id interno
--    `vpos-<uid>`, que nadie puede leer en voz alta.
--
-- 2. NO HABÍA ESTADO. La fila solo existía si la venta se había completado, y
--    "completado" lo decidía el NAVEGADOR: en Bizum había literalmente un
--    botón «Cobro realizado» que llamaba a `finalizarVenta()` sin preguntarle
--    nada a Stripe (page.frozen.tsx:782), y el fallback del checkout hacía lo
--    mismo si Stripe ni siquiera respondía (:468). Dinero no cobrado quedando
--    registrado como cobrado, con su factura sellada detrás.
--    Ahora la venta nace PENDIENTE_PAGO y solo el SERVIDOR la pasa a PAGADA.
--
-- 3. NO HABÍA DESGLOSE. `items` es un jsonb suelto: sirve para pintar el
--    ticket y para nada más. No se puede agregar "lo más vendido", ni mover
--    stock por línea, ni devolver media venta. `ventas_pos_lineas` lo arregla;
--    `items` se conserva como espejo de lectura rápida (mismo criterio que
--    `ventas_pos.importe_devuelto` es espejo de `devoluciones`).
--
-- 4. UNA VENTA SE PODÍA BORRAR DESDE EL NAVEGADOR. `ventas_pos_escritura_delete`
--    (0112:102) daba DELETE a cualquier `authenticated` con puede_mover_dinero.
--    Un registro fiscal con factura sellada detrás no se borra nunca. Se anula.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Columnas nuevas de la venta ─────────────────────────────────────────────
ALTER TABLE public.ventas_pos
  -- Correlativo POR ESTUDIO, no global. Se muestra como «#000182».
  -- Nullable porque las filas ya existentes se rellenan más abajo y porque la
  -- RPC lo asigna dentro de su propio lock; declararlo NOT NULL obligaría a un
  -- valor de relleno que después nadie distinguiría de uno real.
  ADD COLUMN IF NOT EXISTS numero            bigint,

  -- Estado de la VENTA (el hecho comercial).
  ADD COLUMN IF NOT EXISTS estado            text NOT NULL DEFAULT 'PAGADA',
  -- Estado del PAGO (lo que dice el proveedor). Son dos preguntas distintas:
  -- una venta PENDIENTE_PAGO puede tener el pago PROCESANDO, RECHAZADO o
  -- EXPIRADO, y cada uno se le cuenta distinto a quien está en el mostrador.
  ADD COLUMN IF NOT EXISTS pago_estado       text NOT NULL DEFAULT 'PAGADO',
  ADD COLUMN IF NOT EXISTS pago_actualizado_en timestamptz,
  -- Por qué falló, en cristiano, para pintarlo sin inventarse nada.
  ADD COLUMN IF NOT EXISTS pago_error        text,

  -- Desglose fiscal, calculado EN SERVIDOR sumando las líneas.
  ADD COLUMN IF NOT EXISTS base_imponible    numeric(10,2),
  ADD COLUMN IF NOT EXISTS iva_total         numeric(10,2),

  -- Efectivo: lo que entrega la clienta y la vuelta. Se guardan los dos para
  -- que el arqueo se pueda reconstruir y para que un error de cambio deje
  -- rastro en vez de evaporarse.
  ADD COLUMN IF NOT EXISTS efectivo_recibido numeric(10,2),
  ADD COLUMN IF NOT EXISTS cambio            numeric(10,2),

  -- Quién vendió, con el nombre congelado (la persona puede darse de baja).
  ADD COLUMN IF NOT EXISTS vendido_por       uuid,
  ADD COLUMN IF NOT EXISTS vendido_por_nombre text,

  ADD COLUMN IF NOT EXISTS caja_id           text REFERENCES public.cajas(id),

  -- El recibo que generó esta venta. Existía la relación de hecho (addVentaPOS
  -- creaba un `rec-pos-…`) pero no estaba guardada en ninguna parte: para ir
  -- de la venta a su factura había que adivinar por importe y fecha.
  ADD COLUMN IF NOT EXISTS recibo_id         text,

  -- Idempotencia de la petición del TPV. Un doble toque en «Cobrar», o un
  -- reintento de red, no pueden cobrar dos veces.
  ADD COLUMN IF NOT EXISTS idempotencia_clave text,

  -- Anulación (nunca borrado).
  ADD COLUMN IF NOT EXISTS anulada_en        timestamptz,
  ADD COLUMN IF NOT EXISTS anulada_por       uuid,
  ADD COLUMN IF NOT EXISTS anulada_motivo    text;

-- ─── Numeración de las ventas ya existentes ──────────────────────────────────
-- Correlativo por estudio en orden cronológico real. Sin esto, la primera
-- venta nueva empezaría en 1 y chocaría con el índice único al convivir con
-- las históricas.
WITH numeradas AS (
  SELECT id,
         row_number() OVER (PARTITION BY studio_id ORDER BY realizada_en, id) AS n
  FROM public.ventas_pos
  WHERE numero IS NULL
)
UPDATE public.ventas_pos v
   SET numero = numeradas.n
  FROM numeradas
 WHERE v.id = numeradas.id;

CREATE UNIQUE INDEX IF NOT EXISTS ventas_pos_numero_unico
  ON public.ventas_pos (studio_id, numero)
  WHERE numero IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ventas_pos_idempotencia_unica
  ON public.ventas_pos (studio_id, idempotencia_clave)
  WHERE idempotencia_clave IS NOT NULL;

-- ─── CHECKs de estado ────────────────────────────────────────────────────────
ALTER TABLE public.ventas_pos DROP CONSTRAINT IF EXISTS ventas_pos_estado_valido;
ALTER TABLE public.ventas_pos
  ADD CONSTRAINT ventas_pos_estado_valido
  CHECK (estado IN ('PENDIENTE_PAGO', 'PAGADA', 'ANULADA'));

ALTER TABLE public.ventas_pos DROP CONSTRAINT IF EXISTS ventas_pos_pago_estado_valido;
ALTER TABLE public.ventas_pos
  ADD CONSTRAINT ventas_pos_pago_estado_valido
  CHECK (pago_estado IN ('PENDIENTE', 'PROCESANDO', 'PAGADO', 'RECHAZADO', 'CANCELADO', 'EXPIRADO', 'ERROR'));

-- Coherencia entre los dos: una venta PAGADA exige un pago PAGADO. Sin esto,
-- un UPDATE parcial podría dejar una venta cobrada con el pago rechazado y
-- nadie lo notaría hasta cuadrar con el banco.
ALTER TABLE public.ventas_pos DROP CONSTRAINT IF EXISTS ventas_pos_estado_coherente;
ALTER TABLE public.ventas_pos
  ADD CONSTRAINT ventas_pos_estado_coherente
  CHECK (estado <> 'PAGADA' OR pago_estado = 'PAGADO');

-- El efectivo entregado nunca puede ser menos que el total: eso no es un
-- cobro, es un descuadre. El cambio nunca es negativo.
ALTER TABLE public.ventas_pos DROP CONSTRAINT IF EXISTS ventas_pos_cambio_no_negativo;
ALTER TABLE public.ventas_pos
  ADD CONSTRAINT ventas_pos_cambio_no_negativo
  CHECK (cambio IS NULL OR cambio >= 0);

-- ─── Líneas de venta ─────────────────────────────────────────────────────────
CREATE TABLE public.ventas_pos_lineas (
    id            text PRIMARY KEY,
    venta_id      text NOT NULL REFERENCES public.ventas_pos(id) ON DELETE CASCADE,
    studio_id     text NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,

    -- El puente que hace que el POS no duplique nada:
    --   PRODUCTO → productos_pos (género físico; mueve stock)
    --   PLAN     → planes_tarifa (bono / cuota / clase suelta; crea suscripción)
    --   LIBRE    → concepto escrito a mano, sin catálogo detrás
    tipo          text NOT NULL CHECK (tipo IN ('PRODUCTO', 'PLAN', 'LIBRE')),
    -- Sin FK a propósito: el catálogo cambia y se borra, y una línea vendida
    -- hace ocho meses tiene que seguir existiendo aunque el artículo ya no.
    -- Por eso también se congela el nombre y el precio (abajo).
    referencia_id text,

    -- Snapshot del momento de la venta. Cambiar el precio del catálogo mañana
    -- NO puede reescribir lo que se cobró ayer.
    nombre        text NOT NULL,
    precio_unitario numeric(10,2) NOT NULL CHECK (precio_unitario >= 0),
    cantidad      integer NOT NULL CHECK (cantidad > 0),
    iva_pct       numeric(5,2) NOT NULL CHECK (iva_pct >= 0 AND iva_pct <= 100),

    -- Reparto del descuento global de la venta, prorrateado a esta línea. Se
    -- guarda ya repartido para que base + cuota + total de la línea cuadren
    -- solos, sin tener que rehacer el prorrateo cada vez que alguien lee.
    descuento     numeric(10,2) NOT NULL DEFAULT 0 CHECK (descuento >= 0),

    base_imponible numeric(10,2) NOT NULL,
    iva_importe    numeric(10,2) NOT NULL,
    total          numeric(10,2) NOT NULL,

    -- Si esta línea era un PLAN, la suscripción real que creó. Es la prueba de
    -- que el bono vendido en el mostrador es el MISMO bono que usa el resto de
    -- Tentare, y no una copia paralela.
    suscripcion_id text,

    -- Devolución parcial: cuántas unidades de esta línea se han devuelto ya.
    -- Acumulado monótono, nunca un delta — mismo criterio que
    -- `devoluciones.importe_devuelto`.
    devuelta_cantidad integer NOT NULL DEFAULT 0 CHECK (devuelta_cantidad >= 0),

    orden         integer NOT NULL DEFAULT 0,

    CONSTRAINT ventas_pos_lineas_devolucion_acotada
      CHECK (devuelta_cantidad <= cantidad)
);

CREATE INDEX idx_ventas_pos_lineas_venta ON public.ventas_pos_lineas (venta_id, orden);
-- La consulta de "productos más vendidos" y "ventas por categoría".
CREATE INDEX idx_ventas_pos_lineas_referencia
  ON public.ventas_pos_lineas (studio_id, tipo, referencia_id);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.ventas_pos_lineas ENABLE ROW LEVEL SECURITY;
-- A `authenticated` también: una tabla nueva de `public` nace con las cuatro
-- operaciones concedidas por el pg_default_acl del proyecto, y un GRANT SELECT
-- posterior no retira las otras tres (verificado en vivo). Ver la nota larga en
-- 20260907145937_pos_caja.sql.
REVOKE ALL ON TABLE public.ventas_pos_lineas FROM anon, authenticated;
GRANT SELECT ON TABLE public.ventas_pos_lineas TO authenticated;
GRANT ALL ON TABLE public.ventas_pos_lineas TO service_role;

CREATE POLICY ventas_pos_lineas_lectura ON public.ventas_pos_lineas
  FOR SELECT TO authenticated
  USING (studio_id = public.current_studio_id() AND public.puede_ver_finanzas());

-- Sin INSERT/UPDATE/DELETE para el navegador: las líneas las escribe solo la
-- RPC de venta, que es quien puede garantizar que cuadran con su cabecera.

-- ─── Cerrar la escritura directa de ventas desde el navegador ────────────────
-- Antes: el TPV insertaba la venta con supabase-js y la RLS solo comprobaba
-- estudio + rol. Precio, descuento y total llegaban del cliente sin que nadie
-- los volviera a mirar — cualquier persona con la consola abierta podía
-- registrar una venta de 300 € por 0,01 €, con su factura sellada detrás.
--
-- Ahora todo pasa por `registrar_venta_pos` (service_role), que relee el
-- catálogo. Y el DELETE desaparece: un registro fiscal se ANULA, no se borra.
DROP POLICY IF EXISTS ventas_pos_escritura_insert ON public.ventas_pos;
DROP POLICY IF EXISTS ventas_pos_escritura_update ON public.ventas_pos;
DROP POLICY IF EXISTS ventas_pos_escritura_delete ON public.ventas_pos;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.ventas_pos FROM authenticated, anon;

COMMENT ON TABLE public.ventas_pos_lineas IS
  'POS: desglose por línea. tipo PLAN enlaza con planes_tarifa y crea una suscripcion real (suscripcion_id) — el bono del mostrador es el MISMO que el del resto de Tentare, no una copia.';
COMMENT ON COLUMN public.ventas_pos.estado IS
  'Hecho comercial: PENDIENTE_PAGO -> PAGADA | ANULADA. Solo el servidor la pasa a PAGADA, y solo tras releer el pago en el proveedor.';
COMMENT ON COLUMN public.ventas_pos.pago_estado IS
  'Lo que dice el proveedor de pago. Distinto de `estado`: una venta PENDIENTE_PAGO puede tener el pago PROCESANDO, RECHAZADO o EXPIRADO, y cada uno se cuenta distinto en el mostrador.';
COMMENT ON COLUMN public.ventas_pos.numero IS
  'Correlativo por estudio, para nombrar la venta en voz alta («#000182»). No es el numero de factura: ese lo asigna reservar_numero_factura.';
COMMENT ON COLUMN public.ventas_pos.idempotencia_clave IS
  'Clave que manda el TPV. Un doble toque en Cobrar o un reintento de red devuelven la MISMA venta en vez de cobrar dos veces.';
