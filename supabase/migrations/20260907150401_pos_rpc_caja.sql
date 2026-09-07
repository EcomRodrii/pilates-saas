-- ═══════════════════════════════════════════════════════════════════════════
-- POS · Caja: abrir, mover, cerrar
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Tres funciones, todas de servidor (la autorización de rol vive en
-- /api/pos/caja, con `puedeMoverDinero`). Mismo criterio que la RPC de venta.
--
-- El saldo esperado NO se guarda en ninguna columna mientras la caja está
-- abierta: se DERIVA del libro cada vez que se pregunta (`saldo_caja`). Un
-- contador incremental sería un segundo sitio donde puede quedar mal, y el
-- fallo clásico de toda caja es justo ese — el contador y el detalle
-- discrepando sin que nadie sepa cuál de los dos miente.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Saldo esperado en el cajón, derivado del libro ──────────────────────────
-- Solo cuenta el EFECTIVO: una venta con tarjeta es un movimiento del libro
-- pero no pone un billete en el cajón.
CREATE OR REPLACE FUNCTION public.saldo_caja(p_caja_id text)
RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT ROUND(
    COALESCE((SELECT c.fondo_inicial FROM public.cajas c WHERE c.id = p_caja_id), 0)
    + COALESCE((
        SELECT SUM(m.importe) FROM public.movimientos_caja m
         WHERE m.caja_id = p_caja_id
           AND m.metodo_pago = 'EFECTIVO'
           AND m.tipo <> 'APERTURA'
      ), 0)
  , 2);
$$;

-- ─── Abrir ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.abrir_caja(
  p_caja_id       text,
  p_studio_id     text,
  p_fondo_inicial numeric,
  p_por           uuid,
  p_por_nombre    text
)
RETURNS TABLE (r_caja_id text, r_ya_abierta boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_existente text;
BEGIN
  IF p_fondo_inicial IS NULL OR p_fondo_inicial < 0 OR p_fondo_inicial > 100000 THEN
    RAISE EXCEPTION 'FONDO_INVALIDO';
  END IF;

  -- Serializa dos aperturas simultáneas del mismo estudio. El índice parcial
  -- `cajas_una_abierta_por_estudio` ya lo impediría, pero levantando un 23505
  -- que quien llama tendría que interpretar; con el lock, la segunda llamada
  -- simplemente recibe la caja que abrió la primera.
  PERFORM pg_advisory_xact_lock(hashtext(p_studio_id || ':caja'));

  SELECT c.id INTO v_existente
    FROM public.cajas c
   WHERE c.studio_id = p_studio_id AND c.estado = 'ABIERTA';
  IF FOUND THEN
    RETURN QUERY SELECT v_existente, true;
    RETURN;
  END IF;

  INSERT INTO public.cajas (id, studio_id, estado, fondo_inicial, abierta_por, abierta_por_nombre)
  VALUES (p_caja_id, p_studio_id, 'ABIERTA', ROUND(p_fondo_inicial, 2), p_por, p_por_nombre);

  -- El fondo entra como movimiento de APERTURA para que el libro cuente la
  -- historia completa por sí solo. `saldo_caja` lo excluye de la suma a
  -- propósito (ya está en `fondo_inicial`): contarlo dos veces duplicaría el
  -- fondo en cada arqueo.
  INSERT INTO public.movimientos_caja (
    id, studio_id, caja_id, tipo, importe, metodo_pago, concepto, creado_por, creado_por_nombre
  ) VALUES (
    p_caja_id || '-ap', p_studio_id, p_caja_id, 'APERTURA', ROUND(p_fondo_inicial, 2),
    'EFECTIVO', 'Fondo inicial', p_por, p_por_nombre
  );

  RETURN QUERY SELECT p_caja_id, false;
END;
$$;

-- ─── Movimiento manual (entrada / salida) ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mover_caja(
  p_movimiento_id text,
  p_studio_id     text,
  p_caja_id       text,
  p_tipo          text,      -- 'ENTRADA' | 'SALIDA'
  p_importe       numeric,   -- SIEMPRE positivo; el signo lo pone el tipo
  p_concepto      text,
  p_metodo_pago   text,
  p_por           uuid,
  p_por_nombre    text
)
RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_estado text;
BEGIN
  IF p_tipo NOT IN ('ENTRADA', 'SALIDA') THEN RAISE EXCEPTION 'TIPO_MOVIMIENTO_INVALIDO'; END IF;
  IF p_importe IS NULL OR p_importe <= 0 OR p_importe > 100000 THEN RAISE EXCEPTION 'IMPORTE_INVALIDO'; END IF;
  IF NULLIF(trim(COALESCE(p_concepto, '')), '') IS NULL THEN RAISE EXCEPTION 'CONCEPTO_REQUERIDO'; END IF;

  SELECT c.estado INTO v_estado
    FROM public.cajas c WHERE c.id = p_caja_id AND c.studio_id = p_studio_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'CAJA_NO_ENCONTRADA'; END IF;
  -- Apuntar en una caja ya cerrada cambiaría a posteriori un arqueo que
  -- alguien ya firmó. Si el movimiento es real, va en la caja de hoy.
  IF v_estado <> 'ABIERTA' THEN RAISE EXCEPTION 'CAJA_CERRADA'; END IF;

  INSERT INTO public.movimientos_caja (
    id, studio_id, caja_id, tipo, importe, metodo_pago, concepto, creado_por, creado_por_nombre
  ) VALUES (
    p_movimiento_id, p_studio_id, p_caja_id, p_tipo,
    CASE WHEN p_tipo = 'SALIDA' THEN -ROUND(p_importe, 2) ELSE ROUND(p_importe, 2) END,
    COALESCE(p_metodo_pago, 'EFECTIVO'), left(trim(p_concepto), 200), p_por, p_por_nombre
  );

  RETURN public.saldo_caja(p_caja_id);
END;
$$;

-- ─── Cerrar (arqueo) ─────────────────────────────────────────────────────────
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

-- ─── Grants ──────────────────────────────────────────────────────────────────
-- Todas de servidor. `REVOKE ... FROM PUBLIC` no basta (pg_default_acl da
-- EXECUTE directo a anon/authenticated), de ahí los tres roles nombrados.
REVOKE ALL ON FUNCTION public.saldo_caja(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.saldo_caja(text) TO service_role;

REVOKE ALL ON FUNCTION public.abrir_caja(text,text,numeric,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.abrir_caja(text,text,numeric,uuid,text) TO service_role;

REVOKE ALL ON FUNCTION public.mover_caja(text,text,text,text,numeric,text,text,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mover_caja(text,text,text,text,numeric,text,text,uuid,text) TO service_role;

REVOKE ALL ON FUNCTION public.cerrar_caja(text,text,numeric,text,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cerrar_caja(text,text,numeric,text,uuid,text) TO service_role;

COMMENT ON FUNCTION public.saldo_caja(text) IS
  'Efectivo que DEBERÍA haber en el cajón: fondo inicial + movimientos en EFECTIVO. Derivado, nunca almacenado mientras la caja está abierta.';
COMMENT ON FUNCTION public.cerrar_caja(text,text,numeric,text,uuid,text) IS
  'Arqueo: congela el esperado, guarda lo contado y la diferencia, y deja fila de CIERRE en el libro aunque cuadre.';
