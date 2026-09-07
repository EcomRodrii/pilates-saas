-- ─────────────────────────────────────────────────────────────────────────────
-- Stock de verdad: entradas, ajustes, mermas — y un historial que los explique
--
-- Hasta hoy el stock era un número que se teclea en el formulario del producto.
-- Se descontaba solo al vender (`registrar_venta_pos`) y volvía al devolver,
-- pero cualquier otra variación era un `UPDATE` a pelo desde el navegador: se
-- podía pasar de 3 a 300 sin que nada lo registrara. Eso no es control de
-- existencias, es un campo editable — y es exactamente el hueco por el que en
-- una tienda se tapa una merma.
--
-- Tres cosas faltaban, y son las tres que hacen falta: meter mercancía cuando
-- llega, corregir el número cuando se cuenta, y poder responder «¿por qué hay
-- 7 y no 10?».
--
-- ⚠️ EL HISTORIAL NO GUARDA LAS VENTAS. Se leen de `ventas_pos_lineas`, que ya
-- es su fuente de verdad, y se unen a estos movimientos al pintarlos. Copiarlas
-- aquí habría obligado a tocar otra vez `registrar_venta_pos` y
-- `devolver_venta_pos` —dos funciones de dinero, ya auditadas— para acabar con
-- dos copias del mismo hecho que pueden divergir. Un historial que se DERIVA no
-- puede contradecir a la venta; uno que se copia, sí.
--
-- ⚠️ El saldo de apertura es la creación del producto. Quien lo da de alta pone
-- su stock inicial y ahí empieza el libro; no se inventa un movimiento para un
-- recuento que nadie hizo.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.movimientos_stock (
  id                text PRIMARY KEY,
  studio_id         text NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  producto_id       text NOT NULL REFERENCES public.productos_pos(id) ON DELETE CASCADE,
  -- ENTRADA: llegó mercancía. MERMA: se rompió, caducó o se perdió.
  -- AJUSTE: se contó y el número real es otro (el motivo lo explica).
  tipo              text NOT NULL CHECK (tipo IN ('ENTRADA','MERMA','AJUSTE')),
  -- CON SIGNO, siempre: +12 entraron, -3 se perdieron. Un libro de existencias
  -- con cantidades sin signo obliga a interpretar el tipo para saber si suma o
  -- resta, y basta un tipo nuevo para que la suma deje de cuadrar.
  cantidad          integer NOT NULL CHECK (cantidad <> 0),
  stock_anterior    integer,
  stock_resultante  integer NOT NULL CHECK (stock_resultante >= 0),
  motivo            text,
  -- Lo que costó la mercancía que entra. Opcional, y solo informativo por
  -- ahora: no hay valoración de inventario ni coste medio, y fingir que la hay
  -- con un solo campo sería peor que no tenerlo.
  coste_unitario    numeric(10,2) CHECK (coste_unitario IS NULL OR coste_unitario >= 0),
  creado_por        uuid,
  creado_por_nombre text,
  creado_en         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS movimientos_stock_producto_idx
  ON public.movimientos_stock (studio_id, producto_id, creado_en DESC);

ALTER TABLE public.movimientos_stock ENABLE ROW LEVEL SECURITY;

-- Solo lectura, y solo para quien ve finanzas. No hay política de escritura a
-- propósito: se escribe por `mover_stock` con service_role. Un libro de
-- existencias que el navegador puede escribir a mano no explica nada — sería
-- el mismo campo editable de antes con más pasos.
DROP POLICY IF EXISTS movimientos_stock_lectura ON public.movimientos_stock;
CREATE POLICY movimientos_stock_lectura ON public.movimientos_stock
  FOR SELECT USING (studio_id = current_studio_id() AND puede_ver_finanzas());

-- ⚠️ Una tabla nueva de `public` NACE con INSERT/UPDATE/DELETE concedidos a
-- `authenticated` por el pg_default_acl de este proyecto. Un `GRANT SELECT`
-- posterior NO retira esos privilegios: hay que revocarlos explícitamente.
REVOKE ALL ON TABLE public.movimientos_stock FROM anon, authenticated;
GRANT SELECT ON TABLE public.movimientos_stock TO authenticated;

-- ─── Mover existencias ───────────────────────────────────────────────────────
--
-- ⚠️ `p_cantidad` significa DOS cosas según el tipo, y por eso lo dice el
-- nombre del parámetro en la UI:
--   · ENTRADA / MERMA → cuántas unidades entran o se pierden (siempre positivo).
--   · AJUSTE          → cuántas hay DE VERDAD tras contarlas.
--
-- El ajuste va por valor absoluto y no por diferencia a propósito: quien cuenta
-- dice «hay 7», no «quita 3». Y calcular la diferencia aquí dentro, con la fila
-- bloqueada, evita la carrera de leer 10, vender una, y aplicar «-3» sobre 9.
CREATE OR REPLACE FUNCTION public.mover_stock(
  p_studio_id      text,
  p_producto_id    text,
  p_tipo           text,
  p_cantidad       integer,
  p_motivo         text,
  p_coste_unitario numeric,
  p_por            uuid,
  p_por_nombre     text
)
RETURNS TABLE (r_stock_anterior integer, r_stock_resultante integer, r_delta integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_stock  integer;
  v_nombre text;
  v_delta  integer;
  v_nuevo  integer;
BEGIN
  IF p_tipo NOT IN ('ENTRADA','MERMA','AJUSTE') THEN
    RAISE EXCEPTION 'TIPO_MOVIMIENTO_INVALIDO:%', COALESCE(p_tipo,'(null)');
  END IF;
  IF p_cantidad IS NULL OR p_cantidad < 0 OR p_cantidad > 100000 THEN
    RAISE EXCEPTION 'CANTIDAD_INVALIDA:%', COALESCE(p_cantidad, -1);
  END IF;

  -- FOR UPDATE: el mismo cerrojo que usa la venta. Sin él, una entrada y una
  -- venta simultáneas del mismo artículo se pisan y el stock queda mal.
  SELECT p.stock, p.nombre INTO v_stock, v_nombre
    FROM public.productos_pos p
   WHERE p.id = p_producto_id AND p.studio_id = p_studio_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ARTICULO_NO_ENCONTRADO:%', p_producto_id; END IF;

  -- `stock IS NULL` es «no controla existencias», que NO es lo mismo que cero.
  -- Mover el stock de una clase o un servicio no significa nada; que lo diga en
  -- vez de inventar un cero.
  IF v_stock IS NULL THEN
    RAISE EXCEPTION 'SIN_CONTROL_DE_STOCK:%', v_nombre;
  END IF;

  IF p_tipo = 'AJUSTE' THEN
    v_delta := p_cantidad - v_stock;
    IF v_delta = 0 THEN RAISE EXCEPTION 'AJUSTE_SIN_CAMBIO:%', p_cantidad; END IF;
  ELSIF p_tipo = 'ENTRADA' THEN
    IF p_cantidad = 0 THEN RAISE EXCEPTION 'CANTIDAD_INVALIDA:0'; END IF;
    v_delta := p_cantidad;
  ELSE -- MERMA
    IF p_cantidad = 0 THEN RAISE EXCEPTION 'CANTIDAD_INVALIDA:0'; END IF;
    v_delta := -p_cantidad;
  END IF;

  v_nuevo := v_stock + v_delta;
  IF v_nuevo < 0 THEN
    RAISE EXCEPTION 'STOCK_NEGATIVO:%:%', v_nombre, v_stock;
  END IF;

  UPDATE public.productos_pos p SET stock = v_nuevo
   WHERE p.id = p_producto_id AND p.studio_id = p_studio_id;

  INSERT INTO public.movimientos_stock (
    id, studio_id, producto_id, tipo, cantidad, stock_anterior, stock_resultante,
    motivo, coste_unitario, creado_por, creado_por_nombre
  ) VALUES (
    'mstk-' || replace(gen_random_uuid()::text, '-', ''),
    p_studio_id, p_producto_id, p_tipo, v_delta, v_stock, v_nuevo,
    NULLIF(btrim(COALESCE(p_motivo, '')), ''), p_coste_unitario, p_por, p_por_nombre
  );

  RETURN QUERY SELECT v_stock, v_nuevo, v_delta;
  -- `RETURN QUERY` no termina la función.
  RETURN;
END;
$$;

-- ─── Grants ──────────────────────────────────────────────────────────────────
-- Función nueva: nace con EXECUTE concedido DIRECTO a anon y authenticated, que
-- `REVOKE ... FROM PUBLIC` no retira porque no lo heredan de ahí.
REVOKE ALL ON FUNCTION public.mover_stock(text,text,text,integer,text,numeric,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mover_stock(text,text,text,integer,text,numeric,uuid,text) TO service_role;

COMMENT ON TABLE public.movimientos_stock IS
  'Libro de existencias: entradas, mermas y ajustes de recuento. NO guarda las ventas — se derivan de ventas_pos_lineas al pintar el historial, para que no puedan contradecirla. Solo lectura desde el cliente; se escribe por mover_stock.';
COMMENT ON FUNCTION public.mover_stock(text,text,text,integer,text,numeric,uuid,text) IS
  'Stock: mueve existencias y lo deja apuntado, en una transacción. p_cantidad son unidades en ENTRADA/MERMA y el total contado en AJUSTE. Solo service_role: el rol se comprueba en /api/pos/stock.';
