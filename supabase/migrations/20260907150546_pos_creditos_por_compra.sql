-- ═══════════════════════════════════════════════════════════════════════════
-- POS · Créditos por compra ("+100 créditos por cada 10 € gastados")
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Las seis reglas de recompensa que existen hoy (ASISTENCIA_CLASE,
-- RENOVACION_PLAN, REFERIDO_AMIGO, SEMANA_COMPLETA, PRIMERA_RESERVA,
-- OBJETIVO_MENSUAL) dan un número FIJO de créditos: el hecho ocurre o no
-- ocurre. Ninguna mira un importe — `RENOVACION_PLAN` se dispara con un
-- recibo cobrado y ni siquiera lee cuánto.
--
-- Una regla por compra es proporcional, así que necesita una segunda cifra:
-- cuántos euros valen esos créditos. De ahí `unidad_euros`.
--
--     creditos_a_otorgar = floor(importe / unidad_euros) * creditos
--
-- Con creditos=100 y unidad_euros=10, una compra de 30 € da 300 créditos y
-- una de 37,50 € da 300 también (se trunca hacia abajo, nunca se redondea al
-- alza: regalar créditos que no se han ganado es la clase de detalle que
-- convierte la gamificación en un agujero).
--
-- ─── Por qué una función NUEVA y no ampliar `otorgar_credito_disparador` ───
-- Esa RPC está endurecida y cambiarle la firma crearía un objeto función
-- distinto con EXECUTE por defecto para PUBLIC — el gotcha que ya se ha
-- pisado varias veces en este repo (`reservar_plaza`, `cancelar_reserva_plaza`,
-- `mis_estudios`). Una función nueva se estrena con sus grants explícitos y no
-- pone en riesgo un camino que hoy funciona.
--
-- ─── Idempotencia ─────────────────────────────────────────────────────────
-- La misma que ya usa todo el motor: `UNIQUE (studio_id, trigger, ref_id)` en
-- `reward_actions`, con `ref_id` = id de la venta. El webhook y el TPV pueden
-- confirmar la misma venta a la vez; solo la primera suma créditos. Cero
-- mecanismos nuevos.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.reward_rules
  ADD COLUMN IF NOT EXISTS unidad_euros numeric(10,2);

ALTER TABLE public.reward_rules DROP CONSTRAINT IF EXISTS reward_rules_unidad_euros_positiva;
ALTER TABLE public.reward_rules
  ADD CONSTRAINT reward_rules_unidad_euros_positiva
  CHECK (unidad_euros IS NULL OR unidad_euros > 0);

COMMENT ON COLUMN public.reward_rules.unidad_euros IS
  'Solo para el disparador COMPRA: cada cuántos euros se otorgan `creditos`. NULL en el resto de reglas, que son de importe fijo.';

-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.otorgar_creditos_compra(
  p_studio_id text,
  p_socio_id  text,
  p_venta_id  text,
  p_importe   numeric
)
RETURNS TABLE (r_saldo integer, r_creditos integer, r_otorgado boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_creditos_regla int;
  v_unidad         numeric(10,2);
  v_creditos       int;
  v_saldo          int;
  v_id             text;
BEGIN
  IF p_socio_id IS NULL OR p_venta_id IS NULL THEN
    RETURN QUERY SELECT 0, 0, false;
    RETURN;
  END IF;

  PERFORM public.validar_socio_del_studio(p_socio_id, p_studio_id);

  SELECT rr.creditos, rr.unidad_euros
    INTO v_creditos_regla, v_unidad
    FROM public.reward_rules rr
   WHERE rr.studio_id = p_studio_id AND rr.trigger = 'COMPRA' AND rr.activa
   LIMIT 1;

  -- Sin regla activa no es un error: es que el estudio ha decidido que sus
  -- compras no dan créditos. Se responde "no otorgado" y la venta sigue su
  -- curso — la gamificación nunca puede tumbar un cobro.
  IF v_creditos_regla IS NULL OR v_creditos_regla <= 0 THEN
    RETURN QUERY SELECT 0, 0, false;
    RETURN;
  END IF;

  v_unidad   := COALESCE(v_unidad, 1);
  v_creditos := floor(GREATEST(p_importe, 0) / v_unidad)::int * v_creditos_regla;
  IF v_creditos <= 0 THEN
    RETURN QUERY SELECT 0, 0, false;
    RETURN;
  END IF;

  v_id := 'rwa-pos-' || substr(md5(p_studio_id || '|COMPRA|' || p_venta_id), 1, 20);

  BEGIN
    INSERT INTO public.reward_actions (id, studio_id, socio_id, trigger, ref_id, creado_en)
    VALUES (v_id, p_studio_id, p_socio_id, 'COMPRA', p_venta_id, now());
  EXCEPTION WHEN unique_violation THEN
    -- Esta venta ya dio créditos. Es el segundo camino llegando (webhook vs
    -- TPV), no un fallo.
    SELECT mc.saldo INTO v_saldo FROM public.member_credits mc
     WHERE mc.socio_id = p_socio_id AND mc.studio_id = p_studio_id;
    RETURN QUERY SELECT COALESCE(v_saldo, 0), 0, false;
    RETURN;
  END;

  INSERT INTO public.member_credits (socio_id, studio_id, saldo, total_ganado, total_canjeado, actualizado_en)
  VALUES (p_socio_id, p_studio_id, v_creditos, v_creditos, 0, now())
  ON CONFLICT (socio_id) DO UPDATE SET
    saldo        = public.member_credits.saldo + v_creditos,
    total_ganado = public.member_credits.total_ganado + v_creditos,
    actualizado_en = now()
  RETURNING public.member_credits.saldo INTO v_saldo;

  -- El apunte del libro va DENTRO de esta transacción, no en una escritura
  -- posterior desde TypeScript como hace `otorgarCreditosServidor`. Ese
  -- reparto es justo por lo que hoy el saldo y el historial pueden divergir:
  -- si el proceso muere entre la RPC y el insert, la socia ve créditos que su
  -- historial no explica. Aquí, o entran los dos o no entra ninguno.
  INSERT INTO public.credit_transactions (id, studio_id, socio_id, tipo, creditos, descripcion, ref_id, creado_en)
  VALUES (
    'ct-pos-' || substr(md5(p_studio_id || '|' || p_venta_id), 1, 20),
    p_studio_id, p_socio_id, 'GANANCIA', v_creditos,
    'Compra en el estudio', p_venta_id, now()
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN QUERY SELECT v_saldo, v_creditos, true;
END;
$$;

-- ─── Retirar créditos al devolver ────────────────────────────────────────────
-- Si la compra se devuelve, los créditos que dio se retiran. Sin esto, comprar
-- y devolver sería una máquina de fabricar créditos gratis.
--
-- El saldo NO puede quedar negativo: si la socia ya se gastó esos créditos, se
-- le retira lo que quede y se anota lo que realmente se pudo retirar. Dejarla
-- en números rojos la bloquearía para canjear nada nunca más por un premio que
-- el estudio ya le entregó.
CREATE OR REPLACE FUNCTION public.retirar_creditos_compra(
  p_studio_id text,
  p_socio_id  text,
  p_venta_id  text
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_creditos int;
  v_saldo    int;
  v_retirar  int;
BEGIN
  IF p_socio_id IS NULL OR p_venta_id IS NULL THEN RETURN 0; END IF;

  SELECT ct.creditos INTO v_creditos
    FROM public.credit_transactions ct
   WHERE ct.studio_id = p_studio_id AND ct.ref_id = p_venta_id AND ct.tipo = 'GANANCIA'
   LIMIT 1;
  IF v_creditos IS NULL OR v_creditos <= 0 THEN RETURN 0; END IF;

  SELECT mc.saldo INTO v_saldo FROM public.member_credits mc
   WHERE mc.socio_id = p_socio_id AND mc.studio_id = p_studio_id
   FOR UPDATE;
  IF v_saldo IS NULL THEN RETURN 0; END IF;

  v_retirar := LEAST(v_creditos, v_saldo);
  IF v_retirar <= 0 THEN RETURN 0; END IF;

  UPDATE public.member_credits mc
     SET saldo = mc.saldo - v_retirar,
         total_ganado = GREATEST(0, mc.total_ganado - v_retirar),
         actualizado_en = now()
   WHERE mc.socio_id = p_socio_id AND mc.studio_id = p_studio_id;

  INSERT INTO public.credit_transactions (id, studio_id, socio_id, tipo, creditos, descripcion, ref_id, creado_en)
  VALUES (
    'ct-posdev-' || substr(md5(p_studio_id || '|' || p_venta_id), 1, 20),
    p_studio_id, p_socio_id, 'CANJE', v_retirar,
    'Devolución de una compra', p_venta_id, now()
  )
  ON CONFLICT (id) DO NOTHING;

  -- Se borra la marca de idempotencia para que una compra futura de la misma
  -- venta (no puede pasar hoy) no quede bloqueada, y sobre todo para que el
  -- estado quede coherente: sin créditos otorgados, sin acción registrada.
  DELETE FROM public.reward_actions ra
   WHERE ra.studio_id = p_studio_id AND ra.trigger = 'COMPRA' AND ra.ref_id = p_venta_id;

  RETURN v_retirar;
END;
$$;

REVOKE ALL ON FUNCTION public.otorgar_creditos_compra(text,text,text,numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.otorgar_creditos_compra(text,text,text,numeric) TO service_role;

REVOKE ALL ON FUNCTION public.retirar_creditos_compra(text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.retirar_creditos_compra(text,text,text) TO service_role;

COMMENT ON FUNCTION public.otorgar_creditos_compra(text,text,text,numeric) IS
  'POS: créditos proporcionales al importe de una venta. Idempotente por reward_actions UNIQUE (studio_id, trigger, ref_id) con ref_id = id de venta. Sin regla COMPRA activa devuelve otorgado=false sin error: la gamificación nunca tumba un cobro.';
COMMENT ON FUNCTION public.retirar_creditos_compra(text,text,text) IS
  'POS: retira los créditos que dio una venta al devolverla. Nunca deja el saldo negativo — si ya se gastaron, retira solo lo que quede.';
