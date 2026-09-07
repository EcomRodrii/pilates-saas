-- ─────────────────────────────────────────────────────────────────────────────
-- Un cobro de mostrador que no pasaba por la caja
--
-- Hasta hoy, las ÚNICAS escrituras en `movimientos_caja` venían de las RPC del
-- TPV. Nada más en todo el repo apunta ahí. Pero `/cobros` sí deja marcar un
-- recibo como cobrado **en efectivo**: la socia paga sus 60 € en mano, alguien
-- lo marca, el dinero entra en el cajón — y en el libro de caja no consta.
--
-- `saldo_caja` es `fondo_inicial + movimientos en EFECTIVO`, así que al cerrar
-- el recuento sale por encima de lo esperado exactamente por esa cantidad. Un
-- sobrante sin explicación, cada vez, y sin ninguna pista de dónde viene. Es un
-- descuadre de dinero real, no un detalle de presentación.
--
-- Esto añade el apunte que faltaba. NO reescribe `marcarCobrado`: esa función
-- ya lleva dentro el compare-and-set que evita dos facturas para un cobro, el
-- sellado fiscal y la renovación del bono, y todo eso costó auditorías. Solo se
-- le engancha detrás el movimiento de caja.
--
-- ⚠️ QUÉ ENTRA Y QUÉ NO. La caja sirve para cuadrar lo que pasa por el
-- MOSTRADOR, así que se apuntan EFECTIVO, TARJETA, DATAFONO y BIZUM (todos se
-- cobran con la clienta delante) y se dejan fuera TRANSFERENCIA y SEPA, que
-- llegan al banco sin pasar por el cajón. Meterlas inflaría «lo cobrado hoy
-- aquí» con dinero que nunca estuvo aquí.
--
-- ⚠️ Y hay un motivo técnico además del conceptual: `movimientos_caja` acota
-- `metodo_pago` a EFECTIVO/TARJETA/BIZUM/TRANSFERENCIA/DATAFONO/OTRO, mientras
-- que `recibos.metodo_cobro` admite SEPA. Un recibo cobrado por SEPA habría
-- reventado el CHECK en tiempo de ejecución.
-- ─────────────────────────────────────────────────────────────────────────────

-- Un cobro de recibo no es una VENTA del TPV y mezclarlos haría ilegible el
-- arqueo: son dos cosas distintas que entran por la misma puerta.
ALTER TABLE public.movimientos_caja DROP CONSTRAINT IF EXISTS movimientos_caja_tipo_check;
ALTER TABLE public.movimientos_caja ADD CONSTRAINT movimientos_caja_tipo_check
  CHECK (tipo = ANY (ARRAY['APERTURA','VENTA','DEVOLUCION','ENTRADA','SALIDA','CIERRE','COBRO']));

CREATE OR REPLACE FUNCTION public.apuntar_cobro_en_caja(
  p_studio_id  text,
  p_recibo_id  text,
  p_por        uuid,
  p_por_nombre text
)
RETURNS TABLE (r_apuntado boolean, r_importe numeric, r_motivo text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_importe  numeric(10,2);
  v_metodo   text;
  v_estado   text;
  v_concepto text;
  v_caja_id  text;
  v_filas    integer;
BEGIN
  -- Los datos se leen de la BASE, nunca de quien llama: el importe de un
  -- apunte de caja no puede venir del navegador. Alias en todas las columnas
  -- porque `RETURNS TABLE` expone r_importe y r_motivo como variables (42702).
  SELECT r.importe, r.metodo_cobro, r.estado, r.concepto
    INTO v_importe, v_metodo, v_estado, v_concepto
    FROM public.recibos r
   WHERE r.id = p_recibo_id AND r.studio_id = p_studio_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0::numeric, 'RECIBO_NO_ENCONTRADO'; RETURN;
  END IF;

  -- Solo dinero que de verdad se ha cobrado. Apuntar un pendiente sería
  -- inventar un ingreso.
  IF v_estado <> 'COBRADO' THEN
    RETURN QUERY SELECT false, v_importe, 'RECIBO_NO_COBRADO'; RETURN;
  END IF;

  IF v_metodo IS NULL OR v_metodo NOT IN ('EFECTIVO','TARJETA','BIZUM','DATAFONO') THEN
    RETURN QUERY SELECT false, v_importe, 'METODO_FUERA_DE_MOSTRADOR'; RETURN;
  END IF;

  IF v_importe IS NULL OR v_importe <= 0 THEN
    RETURN QUERY SELECT false, COALESCE(v_importe, 0), 'IMPORTE_NO_APUNTABLE'; RETURN;
  END IF;

  SELECT c.id INTO v_caja_id
    FROM public.cajas c
   WHERE c.studio_id = p_studio_id AND c.estado = 'ABIERTA'
   LIMIT 1;
  IF v_caja_id IS NULL THEN
    -- Sin caja abierta no hay nada que cuadrar, y no es un error: un estudio
    -- puede no usar caja. El cobro ya está registrado en `recibos`, que es
    -- donde vive el dinero; la caja solo cuenta el cajón.
    RETURN QUERY SELECT false, v_importe, 'SIN_CAJA_ABIERTA'; RETURN;
  END IF;

  -- Id DERIVADO del recibo: dos clics, un reintento de red o el cobro masivo
  -- pasando dos veces por el mismo recibo no pueden apuntar el dinero dos
  -- veces. Mismo patrón que los ids derivados de `entregarVentaPOS`.
  INSERT INTO public.movimientos_caja (
    id, studio_id, caja_id, tipo, importe, metodo_pago, concepto,
    referencia, creado_por, creado_por_nombre
  ) VALUES (
    'mov-rec-' || p_recibo_id, p_studio_id, v_caja_id, 'COBRO', v_importe,
    v_metodo, 'Cobro: ' || left(COALESCE(v_concepto, 'recibo'), 80),
    p_recibo_id, p_por, p_por_nombre
  )
  ON CONFLICT (id) DO NOTHING;

  GET DIAGNOSTICS v_filas = ROW_COUNT;
  IF v_filas = 0 THEN
    RETURN QUERY SELECT false, v_importe, 'YA_APUNTADO'; RETURN;
  END IF;

  RETURN QUERY SELECT true, v_importe, 'APUNTADO';
  -- `RETURN QUERY` no termina la función.
  RETURN;
END;
$$;

-- ─── Grants ──────────────────────────────────────────────────────────────────
-- Función nueva: nace con EXECUTE concedido DIRECTO a anon y a authenticated
-- por el pg_default_acl de este proyecto, y `REVOKE ... FROM PUBLIC` no lo
-- retira porque no lo heredan de ahí.
REVOKE ALL ON FUNCTION public.apuntar_cobro_en_caja(text,text,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apuntar_cobro_en_caja(text,text,uuid,text) TO service_role;

COMMENT ON FUNCTION public.apuntar_cobro_en_caja(text,text,uuid,text) IS
  'Caja: apunta en el libro de caja un recibo ya COBRADO a mano en el mostrador (efectivo, tarjeta, datáfono o Bizum). Lee importe y método de la BD, nunca del cliente. Idempotente por id derivado del recibo. Deja fuera TRANSFERENCIA y SEPA, que no pasan por el cajón. Solo service_role: el rol se comprueba en /api/pos/caja/apuntar-cobro.';
