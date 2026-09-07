-- ═══════════════════════════════════════════════════════════════════════════
-- POS · devolver_venta_pos: devolución total o parcial, sin borrar nada
-- ═══════════════════════════════════════════════════════════════════════════
--
-- La venta original NO se toca: se marca lo devuelto y se deja el rastro.
-- `ventas_pos_lineas.devuelta_cantidad` es un acumulado monótono (nunca un
-- delta), mismo criterio que `devoluciones.importe_devuelto` — así devolver
-- 1 de 3 hoy y 1 más mañana no puede descuadrar.
--
-- ─── Qué hace esta función y qué NO hace ──────────────────────────────────
-- HACE la parte que solo el POS conoce: cantidades por línea, reposición de
-- stock, anulación del bono vendido y movimiento de caja.
--
-- NO mueve dinero. El reembolso real (Stripe) lo lanza /api/pos/devolucion
-- ANTES de llamar aquí, y la fila de auditoría en `devoluciones` la escribe
-- quien corresponda según el canal: el webhook de Stripe para los cobros con
-- tarjeta/Bizum (`procesarReembolsoVentaPos`, ya existente e idempotente por
-- charge), y la propia ruta vía `registrarDevolucion` para el efectivo. No se
-- duplica esa tabla aquí: es "la tabla única de reembolsos de cualquier
-- canal" desde la migración 20260902001713 y sigue siéndolo.
--
-- ─── Bonos ya empezados ───────────────────────────────────────────────────
-- Una línea de PLAN solo se puede devolver si su suscripción sigue INTACTA
-- (ninguna sesión gastada). Devolver un bono del que ya se han dado tres
-- clases sería regalar esas tres clases; si el estudio quiere hacerlo igual,
-- es una decisión suya que toma en la ficha de la clienta, no un automatismo
-- del mostrador.
-- ═══════════════════════════════════════════════════════════════════════════

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
  p_por_nombre    text
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

REVOKE ALL ON FUNCTION public.devolver_venta_pos(text,text,text,jsonb,text,text,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.devolver_venta_pos(text,text,text,jsonb,text,text,uuid,text) TO service_role;

COMMENT ON FUNCTION public.devolver_venta_pos(text,text,text,jsonb,text,text,uuid,text) IS
  'POS: devolución total o parcial por línea. Repone stock, retira el bono si sigue intacto y apunta la salida de caja. NO mueve dinero ni escribe en `devoluciones` — eso lo hace /api/pos/devolucion (Stripe) o el webhook.';
