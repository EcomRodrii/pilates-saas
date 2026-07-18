-- ═══════════════════════════════════════════════════════════════════════════
-- 0040 · TENTARE — confirmar_sustitucion(): aceptación atómica + reasignar clase
-- ═══════════════════════════════════════════════════════════════════════════
--
-- La corrección nuclear del motor (doc §3.2): dos candidatas no pueden cubrir la
-- misma clase jamás. La confirmación es un compare-and-set — solo gana quien
-- llega con el estado aún "en juego" — y la reasignación de la clase va en la
-- MISMA transacción (la función es atómica por sí misma).
--
-- Devuelve {ok:true, sesion_id} si confirmó, o {ok:false, motivo:'ya_resuelta'}
-- si otra confirmación/cancelación llegó antes (0 filas afectadas → NO reasigna).
--
-- Reversible: DROP FUNCTION.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.confirmar_sustitucion(
  p_sustitucion_id text,
  p_instructor_id text,
  p_studio_id text,
  p_aprobada_por uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sesion text;
BEGIN
  -- Compare-and-set: solo pasa si sigue "en juego" y es de este estudio.
  UPDATE public.sustituciones
    SET estado = 'confirmada',
        sustituta_final_id = p_instructor_id,
        aprobada_por = p_aprobada_por,
        aprobada_at = now(),
        resuelto_en = now()
  WHERE id = p_sustitucion_id
    AND studio_id = p_studio_id
    AND estado IN ('buscando', 'pendiente_aprobacion', 'contactando')
  RETURNING sesion_id INTO v_sesion;

  IF v_sesion IS NULL THEN
    -- Alguien confirmó o canceló antes: no reasignar.
    RETURN jsonb_build_object('ok', false, 'motivo', 'ya_resuelta');
  END IF;

  -- Reasignar la clase a la sustituta, en la MISMA transacción.
  UPDATE public.sesiones
    SET instructor_id = p_instructor_id
  WHERE id = v_sesion;

  RETURN jsonb_build_object('ok', true, 'sesion_id', v_sesion);
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirmar_sustitucion(text, text, text, uuid)
  TO authenticated, service_role;
