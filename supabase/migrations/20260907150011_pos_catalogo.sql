-- ═══════════════════════════════════════════════════════════════════════════
-- POS · El catálogo de género: stock, IVA e identificación
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `productos_pos` tenía SEIS columnas: id, studio_id, nombre, categoria,
-- precio, activo. Ni stock, ni IVA, ni imagen, ni referencia.
--
-- Lo del stock no era un olvido menor: la migración que endureció su RLS
-- (20260729162500) describe la tabla como "(nombre, precio, stock)" — el
-- stock se daba por existente y nunca existió. Un TPV que no sabe cuántos
-- calcetines quedan no puede impedir venderlos dos veces.
--
-- ─── Por qué NO se añade aquí una columna de "tipo bono/plan" ───────────────
-- Las categorías SESION y PACK de esta tabla son un duplicado NOMINAL de los
-- planes `planes_tarifa` de tipo PUNTUAL y BONO: mismo hecho de negocio, sin
-- FK ni join entre ellos, y vender un "PACK" desde el POS no creaba ninguna
-- `suscripciones` — la clienta pagaba un bono que no existía en su ficha.
--
-- La respuesta NO es enlazar las dos tablas: es que el POS venda los planes
-- DIRECTAMENTE desde `planes_tarifa`, que ya es su catálogo canónico y ya
-- sabe de sesiones, validez y cobertura por tipo de clase. `productos_pos`
-- se queda con lo que de verdad le corresponde — el género físico del
-- mostrador. Ver `ventas_pos_lineas.tipo` en la migración siguiente.
--
-- SESION y PACK se conservan en el CHECK por compatibilidad (hay filas en
-- producción usándolas), pero la UI del catálogo ya no las ofrece.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.productos_pos
  -- ─── Stock ────────────────────────────────────────────────────────────────
  -- NULL = este artículo NO controla stock (una clase, un servicio, un
  -- "otro"). Deliberadamente distinto de 0, que significa AGOTADO. Confundir
  -- los dos es el error clásico: un servicio con stock 0 dejaría de poder
  -- venderse para siempre. Mismo criterio que `reward_catalog.stock`.
  ADD COLUMN IF NOT EXISTS stock         integer,
  ADD COLUMN IF NOT EXISTS stock_minimo  integer NOT NULL DEFAULT 0,

  -- ─── IVA ──────────────────────────────────────────────────────────────────
  -- NULL = hereda `studios.iva_por_defecto`. Mismo patrón "hereda" que
  -- `tipos_clase.ventana_cancelacion_horas` (migr 0116) y toda la Fase 1 de
  -- reglas de reserva: la columna del hijo nullable, el default en el padre.
  --
  -- ⚠️ El precio es CON IVA INCLUIDO, igual que en el resto del sistema
  -- (`buildFactura` y `sellar-factura-server.ts` reparten total → base+cuota,
  -- nunca al revés). Este porcentaje solo dice cómo se reparte, no encarece.
  ADD COLUMN IF NOT EXISTS iva_pct       numeric(5,2),

  -- ─── Identificación y presentación ────────────────────────────────────────
  ADD COLUMN IF NOT EXISTS descripcion   text,
  ADD COLUMN IF NOT EXISTS imagen_url    text,
  ADD COLUMN IF NOT EXISTS sku           text,
  ADD COLUMN IF NOT EXISTS codigo_barras text,
  -- Orden manual en la rejilla del TPV. NULL = al final, por nombre. Lo que
  -- más se vende se pone primero y se cobra en un toque.
  ADD COLUMN IF NOT EXISTS orden         integer;

-- El stock nunca baja de 0. Defensa en profundidad: la RPC de venta ya lo
-- impide en el WHERE del decremento, pero un CHECK convierte cualquier vía
-- futura que se lo salte en un error ruidoso en vez de en un descuadre mudo.
-- Mismo par (RPC atómica + CHECK) que ya usa `reward_catalog` desde 0009.
ALTER TABLE public.productos_pos
  DROP CONSTRAINT IF EXISTS productos_pos_stock_no_negativo;
ALTER TABLE public.productos_pos
  ADD CONSTRAINT productos_pos_stock_no_negativo
  CHECK (stock IS NULL OR stock >= 0);

ALTER TABLE public.productos_pos
  DROP CONSTRAINT IF EXISTS productos_pos_stock_minimo_no_negativo;
ALTER TABLE public.productos_pos
  ADD CONSTRAINT productos_pos_stock_minimo_no_negativo
  CHECK (stock_minimo >= 0);

ALTER TABLE public.productos_pos
  DROP CONSTRAINT IF EXISTS productos_pos_iva_valido;
ALTER TABLE public.productos_pos
  ADD CONSTRAINT productos_pos_iva_valido
  CHECK (iva_pct IS NULL OR (iva_pct >= 0 AND iva_pct <= 100));

ALTER TABLE public.productos_pos
  DROP CONSTRAINT IF EXISTS productos_pos_precio_no_negativo;
ALTER TABLE public.productos_pos
  ADD CONSTRAINT productos_pos_precio_no_negativo
  CHECK (precio >= 0);

-- SKU y código de barras únicos POR ESTUDIO, y solo cuando están informados
-- (índice parcial): dos estudios distintos pueden usar la misma referencia de
-- proveedor sin pisarse, y quien no los use no queda obligado a inventarlos.
CREATE UNIQUE INDEX IF NOT EXISTS productos_pos_sku_unico
  ON public.productos_pos (studio_id, sku)
  WHERE sku IS NOT NULL AND sku <> '';

CREATE UNIQUE INDEX IF NOT EXISTS productos_pos_codigo_barras_unico
  ON public.productos_pos (studio_id, codigo_barras)
  WHERE codigo_barras IS NOT NULL AND codigo_barras <> '';

-- La consulta del TPV: los activos del estudio, en su orden.
CREATE INDEX IF NOT EXISTS productos_pos_activos
  ON public.productos_pos (studio_id, orden NULLS LAST, nombre)
  WHERE activo IS NOT false;

COMMENT ON COLUMN public.productos_pos.stock IS
  'NULL = no controla stock (servicio/clase/otro). 0 = AGOTADO. No son lo mismo: un servicio con 0 no podría venderse nunca.';
COMMENT ON COLUMN public.productos_pos.stock_minimo IS
  'Umbral de aviso "stock bajo" en el TPV y en el dashboard. 0 = solo avisa al agotarse.';
COMMENT ON COLUMN public.productos_pos.iva_pct IS
  'NULL = hereda studios.iva_por_defecto (patrón "hereda" de la Fase 1 de reglas de reserva). El precio es CON IVA incluido; esto solo dice cómo se reparte en base + cuota.';
COMMENT ON COLUMN public.productos_pos.orden IS
  'Orden manual en la rejilla del TPV. NULL = al final, alfabético.';
