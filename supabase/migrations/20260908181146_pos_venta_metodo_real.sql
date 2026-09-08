-- ═══════════════════════════════════════════════════════════════════════════
-- 28ª pasada de auditoría — P-3 (27ª pasada) no cerraba las ventas de TPV.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- La 27ª pasada arregló que el desglose por método de un RECIBO mintiera: la
-- sesión de Bizum del mostrador acepta también tarjeta (#1744), así que el
-- método que pulsó quien cobra ("Bizum") puede no ser el que empleó la
-- clienta de verdad. Pero el mismo bug seguía vivo, sin tocar, para las
-- VENTAS de producto del TPV: `confirmar_pago_venta_pos` no recibía ningún
-- parámetro de método y usaba siempre `ventas_pos.metodo_pago`, fijado al
-- CREAR la venta, antes de que nadie pagara nada.
--
-- `p_metodo_pago` (nuevo, opcional): lo que el proveedor dice haber cobrado
-- DE VERDAD. `NULL` (el default, y lo que sigue mandando el datáfono y el
-- efectivo/manual, que no tienen esa ambigüedad) deja el método de creación
-- tal cual. Cambia de firma → gotcha de grants ya conocido en este repo:
-- Postgres crea un objeto función NUEVO con `EXECUTE` por defecto a PUBLIC
-- (no hereda el REVOKE de la firma anterior). Aquí además se DROPEA la firma
-- vieja en vez de dejarla como overload huérfano, porque PostgREST resuelve
-- la llamada de `admin.rpc(...)` por los NOMBRES de los parámetros que se le
-- pasan: con las dos firmas vivas a la vez, una llamada que solo pasara los
-- 4 parámetros antiguos sería ambigua (dos funciones la aceptarían).
DROP FUNCTION IF EXISTS public.confirmar_pago_venta_pos(text,text,text,numeric);

CREATE OR REPLACE FUNCTION public.confirmar_pago_venta_pos(
  p_venta_id   text,
  p_studio_id  text,
  p_payment_intent_id text,
  p_importe_confirmado numeric,   -- en euros, tal y como lo cobró el proveedor
  p_metodo_pago text DEFAULT NULL -- lo que el proveedor dice haber cobrado DE VERDAD; NULL = mantiene el de creación
)
RETURNS TABLE (r_aplicado boolean, r_total numeric, r_numero bigint, r_caja_id text, r_estado text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_total   numeric(10,2);
  v_numero  bigint;
  v_caja    text;
  v_metodo  text;
  v_por     uuid;
  v_por_nom text;
  v_estado  text;
BEGIN
  SELECT v.total, v.numero, v.caja_id, v.metodo_pago, v.vendido_por, v.vendido_por_nombre, v.estado
    INTO v_total, v_numero, v_caja, v_metodo, v_por, v_por_nom, v_estado
    FROM public.ventas_pos v
   WHERE v.id = p_venta_id AND v.studio_id = p_studio_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'VENTA_NO_ENCONTRADA'; END IF;

  -- El importe cobrado tiene que ser el de la venta. Si no coinciden, algo se
  -- ha desincronizado entre el carrito y el datáfono y NO se da por buena:
  -- mejor un aviso en el mostrador que una venta cuadrada de mentira.
  IF p_importe_confirmado IS NOT NULL
     AND ABS(p_importe_confirmado - v_total) > 0.01 THEN
    RAISE EXCEPTION 'IMPORTE_NO_COINCIDE:%:%', p_importe_confirmado, v_total;
  END IF;

  -- El método fijado al CREAR la venta es el que pulsó quien cobra, no
  -- necesariamente el cargo real. Si el proveedor dice lo que cobró de
  -- verdad, manda eso — mismo criterio que ya aplica `confirmarCobroRecibo`
  -- para recibos (P-3, 27ª pasada, extendido aquí a ventas en la 28ª).
  IF p_metodo_pago IS NOT NULL THEN
    v_metodo := p_metodo_pago;
  END IF;

  UPDATE public.ventas_pos v
     SET estado = 'PAGADA', pago_estado = 'PAGADO', pago_actualizado_en = now(),
         pago_error = NULL,
         metodo_pago = v_metodo,
         stripe_payment_intent_id = COALESCE(p_payment_intent_id, v.stripe_payment_intent_id)
   WHERE v.id = p_venta_id
     AND v.studio_id = p_studio_id
     AND v.estado = 'PENDIENTE_PAGO';

  IF NOT FOUND THEN
    -- No aplicó. Pero «ya estaba PAGADA» y «está ANULADA» NO son lo mismo, y
    -- por eso se devuelve `r_estado`: si el pago triunfa sobre una venta que
    -- ya se anuló (se canceló en el mostrador, o el proveedor devolvió un
    -- estado que se leyó como fallo, y la tarjeta liquidó después), el estudio
    -- se queda el dinero y la clienta sin bono, sin recibo y sin factura. Con
    -- un solo booleano eso pasaba en silencio.
    RETURN QUERY SELECT false, v_total, v_numero, v_caja, v_estado;
    RETURN;
  END IF;

  -- Entre que se lanzó el cobro y llega su confirmación, la caja puede haberse
  -- cerrado. Apuntar después de la fila de CIERRE ensuciaría ese arqueo.
  IF v_caja IS NOT NULL THEN
    PERFORM 1 FROM public.cajas c
     WHERE c.id = v_caja AND c.studio_id = p_studio_id AND c.estado = 'ABIERTA';
    IF NOT FOUND THEN v_caja := NULL; END IF;
  END IF;

  IF v_caja IS NOT NULL AND v_total > 0 THEN
    INSERT INTO public.movimientos_caja (
      id, studio_id, caja_id, tipo, importe, metodo_pago, concepto,
      referencia, creado_por, creado_por_nombre
    ) VALUES (
      p_venta_id || '-mov', p_studio_id, v_caja, 'VENTA', v_total, v_metodo,
      'Venta #' || lpad(v_numero::text, 6, '0'), p_venta_id, v_por, v_por_nom
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;

  RETURN QUERY SELECT true, v_total, v_numero, v_caja, 'PAGADA'::text;
END;
$$;

-- ─── Grants ──────────────────────────────────────────────────────────────────
-- Firma nueva = objeto función nuevo = EXECUTE por defecto a PUBLIC en este
-- proyecto (pg_default_acl da el privilegio DIRECTO a anon/authenticated, no
-- solo a PUBLIC — lección de `reservar_numero_factura`, PR #769). Los tres
-- pasos explícitos, sin excepción.
REVOKE ALL ON FUNCTION public.confirmar_pago_venta_pos(text,text,text,numeric,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirmar_pago_venta_pos(text,text,text,numeric,text) TO service_role;

COMMENT ON FUNCTION public.confirmar_pago_venta_pos(text,text,text,numeric,text) IS
  'POS: compare-and-set PENDIENTE_PAGO -> PAGADA. r_aplicado=true solo para el PRIMER camino que llega (TPV o webhook), que es el que debe entregar bono, créditos y factura. p_metodo_pago (opcional, 28ª pasada): el método REAL que dice haber cobrado el proveedor cuando puede resolverlo (Bizum admite también tarjeta) — si no es NULL, prevalece sobre el fijado al crear la venta.';
