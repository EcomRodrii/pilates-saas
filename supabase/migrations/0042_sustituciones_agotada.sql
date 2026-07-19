-- ═══════════════════════════════════════════════════════════════════════════
-- 0042 · TENTARE — estado 'agotada' + confirmar_sustitucion lo admite
-- ═══════════════════════════════════════════════════════════════════════════
--
-- El motor de escalado (lib/inngest/sustituciones.ts) marca una sustitución como
-- 'agotada' cuando, en modo autónomo, avisó a TODAS las candidatas del ranking y
-- ninguna respondió. Es un estado ACTIVO (la dueña aún debe decidir: avisar a
-- alguien por su cuenta o cancelar), por eso NO entra en el índice único parcial
-- `uq_sustitucion_activa_por_sesion` (sigue bloqueando duplicados).
--
-- Aquí solo hace falta que la confirmación atómica admita 'agotada' entre los
-- estados "en juego", para que la dueña pueda confirmar manualmente a alguien
-- (p.ej. una candidata que dijo que sí por teléfono) después del agotamiento.
-- El resto de la función es idéntica a 0040. Reversible: reaplicar 0040.
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
    AND estado IN ('buscando', 'pendiente_aprobacion', 'contactando', 'agotada')
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
