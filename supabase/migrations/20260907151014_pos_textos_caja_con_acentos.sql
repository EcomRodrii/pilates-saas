-- ═══════════════════════════════════════════════════════════════════════════
-- POS · Corrección de fidelidad repo ↔ producción: dos literales sin acentos
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Al aplicar `pos_rpc_caja` y `pos_rpc_devolucion` a producción se
-- ASCII-ificaron dos literales por precaución al pegar. Los dos son TEXTO
-- VISIBLE en el libro de caja:
--
--   'Devolucion de la venta #…'   →  'Devolución de la venta #…'
--   'Cierre de caja: cuadra'      →  'Cierre de caja — cuadra'
--
-- Una «Devolucion» sin tilde en el arqueo que lee la propietaria es una falta
-- de ortografía del producto. Y, sobre todo, dejaba el fichero y la base
-- diciendo cosas distintas: la deriva repo↔producción que este repo ya ha
-- pagado antes (ver `deriva-repo-vs-produccion-migraciones`).
--
-- Se recrean las dos funciones con los literales exactos de sus ficheros. Sin
-- ningún cambio de comportamiento. Los grants se vuelven a emitir porque un
-- CREATE OR REPLACE sobre la MISMA firma los conserva, pero re-emitirlos es
-- gratis y deja el fichero autocontenido.
--
-- ⚠️ Esta migración existe porque el cuerpo de una función PL/pgSQL se guarda
-- literal en `prosrc`: lo que se pega es lo que queda. Al aplicar a mano,
-- pegar el fichero VERBATIM, sin "limpiarlo".
-- ═══════════════════════════════════════════════════════════════════════════

-- El cuerpo de las dos funciones es exactamente el de
-- 20260907150401_pos_rpc_caja.sql (cerrar_caja) y
-- 20260907150458_pos_rpc_devolucion.sql (devolver_venta_pos). Se reproducen
-- aquí íntegras porque CREATE OR REPLACE no admite parches parciales.

CREATE OR REPLACE FUNCTION public.cerrar_caja(
  p_caja_id          text,
  p_studio_id        text,
  p_efectivo_contado numeric,
  p_notas            text,
  p_por              uuid,
  p_por_nombre       text
)
RETURNS TABLE (r_esperado numeric, r_contado numeric, r_diferencia numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_esperado   numeric(10,2);
  v_diferencia numeric(10,2);
BEGIN
  IF p_efectivo_contado IS NULL OR p_efectivo_contado < 0 THEN RAISE EXCEPTION 'CONTEO_INVALIDO'; END IF;

  PERFORM 1 FROM public.cajas c
   WHERE c.id = p_caja_id AND c.studio_id = p_studio_id AND c.estado = 'ABIERTA'
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CAJA_NO_ABIERTA'; END IF;

  v_esperado   := public.saldo_caja(p_caja_id);
  v_diferencia := ROUND(p_efectivo_contado - v_esperado, 2);

  UPDATE public.cajas c
     SET estado = 'CERRADA', cerrada_en = now(), cerrada_por = p_por,
         cerrada_por_nombre = p_por_nombre,
         efectivo_contado = ROUND(p_efectivo_contado, 2),
         -- Se CONGELA el esperado. Recalcularlo meses después, con un libro
         -- que pudo crecer, daría otro número y el arqueo dejaría de cuadrar
         -- consigo mismo.
         efectivo_esperado = v_esperado,
         diferencia = v_diferencia,
         notas_cierre = left(COALESCE(p_notas, ''), 500)
   WHERE c.id = p_caja_id;

  -- La diferencia queda en el libro, aunque sea 0: un cierre sin fila de
  -- cierre es un turno del que no consta que nadie contara nada.
  INSERT INTO public.movimientos_caja (
    id, studio_id, caja_id, tipo, importe, metodo_pago, concepto,
    creado_por, creado_por_nombre, metadata
  ) VALUES (
    p_caja_id || '-ci', p_studio_id, p_caja_id, 'CIERRE', v_diferencia, 'EFECTIVO',
    CASE
      WHEN v_diferencia = 0 THEN 'Cierre de caja — cuadra'
      WHEN v_diferencia > 0 THEN 'Cierre de caja — sobra efectivo'
      ELSE 'Cierre de caja — falta efectivo'
    END,
    p_por, p_por_nombre,
    jsonb_build_object('esperado', v_esperado, 'contado', ROUND(p_efectivo_contado, 2))
  );

  RETURN QUERY SELECT v_esperado, ROUND(p_efectivo_contado, 2), v_diferencia;
END;
$$;

CREATE OR REPLACE FUNCTION public.devolver_venta_pos(
  p_devolucion_id text,
  p_venta_id      text,
  p_studio_id     text,
  -- [{ lineaId: text, cantidad: int }]. NULL o vacío = devolución TOTAL de
  -- todo lo que quede pendiente de devolver.
  p_lineas        jsonb,
  p_motivo        text,
  p_caja_id       text,
  p_por           uuid,
  p_por_nombre    text,
  -- Pre-vuelo: calcula el importe y NO escribe nada. Existe porque el dinero
  -- se devuelve en Stripe ANTES de tocar el libro, y para eso hay que saber
  -- cuánto sin haberlo apuntado ya. El prorrateo del descuento y el redondeo
  -- por línea viven aquí; recalcularlos en TypeScript sería una segunda
  -- implementación que se desviaría a la primera de cambio.
  p_simular       boolean DEFAULT false
)
RETURNS TABLE (
  r_importe_devuelto numeric,
  r_total_acumulado  numeric,
  r_es_total         boolean
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_estado       text;
  v_metodo       text;
  v_numero       bigint;
  v_total_venta  numeric(10,2);
  v_ya_devuelto  numeric(10,2);
  v_linea        jsonb;
  v_linea_id     text;
  v_cant         integer;
  v_rec          record;
  v_unitario_neto numeric(10,2);
  v_importe      numeric(10,2) := 0;
  v_acumulado    numeric(10,2);
  v_sesiones     integer;
  v_sesiones_plan integer;
BEGIN
  SELECT v.estado, v.metodo_pago, v.numero, v.total, COALESCE(v.importe_devuelto, 0)
    INTO v_estado, v_metodo, v_numero, v_total_venta, v_ya_devuelto
    FROM public.ventas_pos v
   WHERE v.id = p_venta_id AND v.studio_id = p_studio_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'VENTA_NO_ENCONTRADA'; END IF;
  IF v_estado <> 'PAGADA' THEN RAISE EXCEPTION 'VENTA_NO_PAGADA:%', v_estado; END IF;

  -- Sin líneas explícitas = devolver todo lo que quede.
  IF p_lineas IS NULL OR jsonb_array_length(p_lineas) = 0 THEN
    SELECT jsonb_agg(jsonb_build_object('lineaId', l.id, 'cantidad', l.cantidad - l.devuelta_cantidad))
      INTO p_lineas
      FROM public.ventas_pos_lineas l
     WHERE l.venta_id = p_venta_id AND l.cantidad > l.devuelta_cantidad;
    IF p_lineas IS NULL THEN RAISE EXCEPTION 'NADA_QUE_DEVOLVER'; END IF;
  END IF;

  -- Primera pasada: solo calcula. Sin `p_simular` seguiría de largo y escribiría
  -- en la misma vuelta.
  IF p_simular THEN
    FOR v_linea IN SELECT * FROM jsonb_array_elements(p_lineas)
    LOOP
      SELECT l.* INTO v_rec
        FROM public.ventas_pos_lineas l
       WHERE l.id = (v_linea->>'lineaId') AND l.venta_id = p_venta_id AND l.studio_id = p_studio_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'LINEA_NO_ENCONTRADA:%', v_linea->>'lineaId'; END IF;
      v_cant := COALESCE((v_linea->>'cantidad')::int, 0);
      IF v_cant <= 0 THEN RAISE EXCEPTION 'CANTIDAD_INVALIDA'; END IF;
      IF v_rec.devuelta_cantidad + v_cant > v_rec.cantidad THEN
        RAISE EXCEPTION 'DEVOLUCION_EXCEDE:%:%', v_rec.nombre, v_rec.cantidad - v_rec.devuelta_cantidad;
      END IF;
      v_unitario_neto := ROUND(v_rec.total / v_rec.cantidad, 2);
      IF v_rec.devuelta_cantidad + v_cant = v_rec.cantidad THEN
        v_importe := v_importe + ROUND(v_rec.total - (v_unitario_neto * v_rec.devuelta_cantidad), 2);
      ELSE
        v_importe := v_importe + ROUND(v_unitario_neto * v_cant, 2);
      END IF;
    END LOOP;
    v_importe := ROUND(v_importe, 2);
    RETURN QUERY SELECT v_importe, ROUND(v_ya_devuelto + v_importe, 2),
                        (ROUND(v_ya_devuelto + v_importe, 2) >= v_total_venta - 0.01);
    RETURN;
  END IF;

  FOR v_linea IN SELECT * FROM jsonb_array_elements(p_lineas)
  LOOP
    v_linea_id := v_linea->>'lineaId';
    v_cant     := COALESCE((v_linea->>'cantidad')::int, 0);
    IF v_cant <= 0 THEN RAISE EXCEPTION 'CANTIDAD_INVALIDA'; END IF;

    SELECT l.* INTO v_rec
      FROM public.ventas_pos_lineas l
     WHERE l.id = v_linea_id AND l.venta_id = p_venta_id AND l.studio_id = p_studio_id
     FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'LINEA_NO_ENCONTRADA:%', v_linea_id; END IF;
    IF v_rec.devuelta_cantidad + v_cant > v_rec.cantidad THEN
      RAISE EXCEPTION 'DEVOLUCION_EXCEDE:%:%', v_rec.nombre, v_rec.cantidad - v_rec.devuelta_cantidad;
    END IF;

    -- Se devuelve el importe NETO de la línea (ya con su parte del descuento
    -- descontada), no el precio de catálogo: si la clienta pagó 18 € por algo
    -- de 20 €, se le devuelven 18 €. Devolver el bruto sería regalar el
    -- descuento en cada devolución.
    v_unitario_neto := ROUND(v_rec.total / v_rec.cantidad, 2);
    -- La última unidad se lleva el redondeo, para que devolver TODAS las
    -- unidades sume exactamente el total de la línea.
    IF v_rec.devuelta_cantidad + v_cant = v_rec.cantidad THEN
      v_importe := v_importe + ROUND(v_rec.total - (v_unitario_neto * v_rec.devuelta_cantidad), 2);
    ELSE
      v_importe := v_importe + ROUND(v_unitario_neto * v_cant, 2);
    END IF;

    UPDATE public.ventas_pos_lineas l
       SET devuelta_cantidad = l.devuelta_cantidad + v_cant
     WHERE l.id = v_linea_id;

    -- Stock de vuelta al estante.
    IF v_rec.tipo = 'PRODUCTO' THEN
      UPDATE public.productos_pos p
         SET stock = p.stock + v_cant
       WHERE p.id = v_rec.referencia_id AND p.studio_id = p_studio_id AND p.stock IS NOT NULL;
    END IF;

    -- Bono vendido: solo se retira si no se ha tocado.
    IF v_rec.tipo = 'PLAN' AND v_rec.suscripcion_id IS NOT NULL THEN
      SELECT s.sesiones_restantes, pt.sesiones
        INTO v_sesiones, v_sesiones_plan
        FROM public.suscripciones s
        LEFT JOIN public.planes_tarifa pt ON pt.id = s.plan_id
       WHERE s.id = v_rec.suscripcion_id AND s.studio_id = p_studio_id
       FOR UPDATE;
      IF FOUND THEN
        IF v_sesiones IS NOT NULL AND v_sesiones_plan IS NOT NULL
           AND v_sesiones < v_sesiones_plan THEN
          RAISE EXCEPTION 'BONO_YA_EMPEZADO:%:%', v_rec.nombre, v_sesiones_plan - v_sesiones;
        END IF;
        UPDATE public.suscripciones s
           SET estado = 'CANCELADA', sesiones_restantes = 0
         WHERE s.id = v_rec.suscripcion_id AND s.studio_id = p_studio_id;
      END IF;
    END IF;
  END LOOP;

  v_importe   := ROUND(v_importe, 2);
  v_acumulado := ROUND(v_ya_devuelto + v_importe, 2);
  IF v_acumulado > v_total_venta + 0.01 THEN
    RAISE EXCEPTION 'DEVOLUCION_SUPERA_VENTA:%:%', v_acumulado, v_total_venta;
  END IF;

  -- Espejo de lectura rápida en la venta. `devuelta_en` solo se informa
  -- cuando ya se ha devuelto TODO — mismo significado que en el camino de
  -- Stripe, donde marca la devolución total y no las parciales.
  UPDATE public.ventas_pos v
     SET importe_devuelto = v_acumulado,
         devuelta_en = CASE WHEN v_acumulado >= v_total_venta - 0.01 THEN now() ELSE v.devuelta_en END
   WHERE v.id = p_venta_id;

  -- Caja: sale dinero del cajón. Signo negativo, como toda salida.
  -- L-2: `p_caja_id` es el único parámetro que no se cotejaba contra el
  -- estudio. Las rutas la resuelven ellas mismas y nunca la toman del body, así
  -- que no es cross-tenant — pero apuntar en una caja ajena o ya cerrada
  -- ensuciaría un arqueo que alguien ya firmó. Si no cuadra, se apunta sin caja.
  IF p_caja_id IS NOT NULL THEN
    PERFORM 1 FROM public.cajas c
     WHERE c.id = p_caja_id AND c.studio_id = p_studio_id AND c.estado = 'ABIERTA';
    IF NOT FOUND THEN p_caja_id := NULL; END IF;
  END IF;

  IF p_caja_id IS NOT NULL AND v_importe > 0 THEN
    INSERT INTO public.movimientos_caja (
      id, studio_id, caja_id, tipo, importe, metodo_pago, concepto, referencia,
      creado_por, creado_por_nombre, metadata
    ) VALUES (
      p_devolucion_id || '-mov', p_studio_id, p_caja_id, 'DEVOLUCION', -v_importe,
      v_metodo, 'Devolución de la venta #' || lpad(v_numero::text, 6, '0'),
      p_venta_id, p_por, p_por_nombre,
      jsonb_build_object('motivo', left(COALESCE(p_motivo, ''), 200))
    );
  END IF;

  RETURN QUERY SELECT v_importe, v_acumulado, (v_acumulado >= v_total_venta - 0.01);
END;
$$;

REVOKE ALL ON FUNCTION public.cerrar_caja(text,text,numeric,text,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cerrar_caja(text,text,numeric,text,uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.devolver_venta_pos(text,text,text,jsonb,text,text,uuid,text,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.devolver_venta_pos(text,text,text,jsonb,text,text,uuid,text,boolean) TO service_role;
