-- ═══════════════════════════════════════════════════════════════════════════
-- 31ª pasada de auditoría — asignar a una socia una venta del TPV ya
-- devuelta le entregaba un bono real y créditos por dinero que el estudio ya
-- no tiene.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `asignar_venta_pos_a_socia` (venta "sin ficha" cobrada de mostrador y
-- enganchada después a una clienta real, migr. 20260907170322) solo
-- comprobaba `estado <> 'PAGADA'` y `socio_id IS NOT NULL`. Pero una
-- devolución (`devolver_venta_pos`, migr. 20260907150458) NUNCA cambia
-- `ventas_pos.estado` — por diseño, el estado de COBRO y el de DEVOLUCIÓN
-- son cosas separadas — así que una venta devuelta al 100% seguía pasando
-- ambas comprobaciones.
--
-- El camino real: cobrar sin ficha una venta con una línea PLAN → devolverla
-- entera por el motivo que sea → asignarla semanas después a una socia real.
-- `entregarVentaPOS` se reejecuta desde cero (la línea PLAN nunca llegó a
-- crear suscripción, porque en el cobro original no había `socio_id`) y crea
-- un bono `ACTIVA` con sesiones de verdad, más los créditos de gamificación
-- de `otorgar_creditos_compra` calculados sobre `venta.total` sin restar lo
-- devuelto — un entitlement real por dinero que ya volvió al cliente
-- original. Alcanzable desde dos pantallas normales del panel (Devolución +
-- Asignar a una clienta), sin tocar la API a mano.
--
-- Arreglo mínimo: bloquear la asignación en cuanto haya CUALQUIER importe
-- devuelto (parcial o total). Permitir asignar solo la parte viva de una
-- devolución parcial es una decisión de producto nueva (habría que entregar
-- por línea, no por venta entera) — fuera del alcance de este fix.
CREATE OR REPLACE FUNCTION public.asignar_venta_pos_a_socia(
  p_studio_id text,
  p_venta_id  text,
  p_socio_id  text
)
RETURNS TABLE (r_aplicado boolean, r_recibo_id text, r_numero int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recibo_id       text;
  v_numero          int;
  v_estado          text;
  v_socio_actual    text;
  v_importe_devuelto numeric;
BEGIN
  -- Alias de tabla en TODAS las columnas: `RETURNS TABLE` expone r_recibo_id y
  -- r_numero como VARIABLES dentro del cuerpo, y sin calificar Postgres las
  -- confunde con las columnas homónimas (42702). Ya pasó tres veces en la fase
  -- de lista de espera.
  SELECT v.recibo_id, v.numero, v.estado, v.socio_id, COALESCE(v.importe_devuelto, 0)
    INTO v_recibo_id, v_numero, v_estado, v_socio_actual, v_importe_devuelto
    FROM public.ventas_pos v
   WHERE v.id = p_venta_id AND v.studio_id = p_studio_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'VENTA_NO_ENCONTRADA'; END IF;
  IF v_estado <> 'PAGADA' THEN RAISE EXCEPTION 'VENTA_NO_PAGADA'; END IF;
  IF v_socio_actual IS NOT NULL THEN RAISE EXCEPTION 'VENTA_YA_ASIGNADA'; END IF;
  -- 31ª pasada de auditoría: una venta devuelta (entera o en parte) ya
  -- "cerró" su entrega. Asignarla reejecutaría `entregarVentaPOS` y crearía
  -- un bono/créditos reales por dinero que el estudio ya no tiene.
  IF v_importe_devuelto > 0 THEN RAISE EXCEPTION 'VENTA_YA_DEVUELTA'; END IF;

  PERFORM 1 FROM public.socios s
   WHERE s.id = p_socio_id AND s.studio_id = p_studio_id AND s.borrado_en IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'CLIENTA_NO_ENCONTRADA'; END IF;

  UPDATE public.ventas_pos v
     SET socio_id = p_socio_id
   WHERE v.id = p_venta_id AND v.studio_id = p_studio_id AND v.socio_id IS NULL;

  -- El RECIBO también cambia de dueña: si no, el cobro no aparecería nunca en
  -- su ficha ni en su historial de pagos, que es medio motivo de asignarla.
  -- La FACTURA no se toca (ver la cabecera de la migración original): está
  -- sellada y encadenada como simplificada, y reescribir su receptor sería
  -- falsear un documento fiscal ya emitido.
  IF v_recibo_id IS NOT NULL THEN
    UPDATE public.recibos r
       SET socio_id = p_socio_id
     WHERE r.id = v_recibo_id AND r.studio_id = p_studio_id AND r.socio_id IS NULL;
  END IF;

  RETURN QUERY SELECT true, v_recibo_id, v_numero;
  -- `RETURN QUERY` NO termina la función: sin este RETURN seguiría ejecutando.
  RETURN;
END;
$$;

-- Misma firma que la función original: los grants ya concedidos siguen en
-- pie, pero se reafirman igualmente (regla de este repo: nunca fiarse de que
-- un `CREATE OR REPLACE` con la firma sin cambios no tocó nada).
REVOKE ALL ON FUNCTION public.asignar_venta_pos_a_socia(text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.asignar_venta_pos_a_socia(text,text,text) TO service_role;

COMMENT ON FUNCTION public.asignar_venta_pos_a_socia(text,text,text) IS
  'POS: engancha a una ficha una venta cobrada sin clienta. Compare-and-set sobre socio_id IS NULL. Rechaza VENTA_YA_DEVUELTA si tiene cualquier importe devuelto (31ª pasada de auditoría) — evita reentregar bono/créditos por dinero ya devuelto. Mueve también el recibo; NUNCA la factura. Solo service_role: el rol se comprueba en /api/pos/venta/asignar.';
