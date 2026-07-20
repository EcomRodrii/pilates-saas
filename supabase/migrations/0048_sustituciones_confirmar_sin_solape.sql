-- ═══════════════════════════════════════════════════════════════════════════
-- 0048 · TENTARE — anti-doble-reserva REAL: exclusion constraint + re-check atómico
-- ═══════════════════════════════════════════════════════════════════════════
--
-- El conflicto de horario solo se comprobaba al RANKEAR candidatas
-- (instructor_tiene_conflicto, 0037). Entre rankear y confirmar puede pasar
-- tiempo (la propietaria decide, la candidata acepta por email); si en ese
-- hueco a la instructora le surge otra clase, confirmar_sustitucion la
-- doble-reservaba sin darse cuenta.
--
-- La forma correcta de cerrar esa ventana NO es "volver a hacer el mismo
-- SELECT antes del UPDATE" (eso sigue siendo check-then-act: dos confirmar()
-- concurrentes podrían pasar la comprobación a la vez). La forma correcta es
-- una EXCLUSION CONSTRAINT: Postgres garantiza, a nivel de fila y de forma
-- atómica, que ninguna instructora activa tenga dos sesiones con horario
-- solapado — para CUALQUIER camino de escritura (esta función, edición manual
-- del calendario, batch de series recurrentes…), no solo sustituciones.
--
-- confirmar_sustitucion() atrapa la excepción de esa restricción y responde
-- {ok:false, motivo:'conflicto_horario'} en vez de reventar con un error 500:
-- el panel puede ofrecer elegir otra candidata sin perder el resto del flujo.
--
-- Reversible: DROP CONSTRAINT + CREATE OR REPLACE al cuerpo anterior (0043).
-- ═══════════════════════════════════════════════════════════════════════════

-- Necesaria para poder combinar igualdad (instructor_id) y solape de rango
-- (tstzrange) en el mismo índice GiST de la exclusion constraint.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Ninguna instructora puede tener dos sesiones activas con horario solapado.
-- Parcial (WHERE): las canceladas y las sesiones sin instructora asignada no
-- cuentan. Verificado antes de aplicar: 0 solapes en los datos reales.
ALTER TABLE public.sesiones
  ADD CONSTRAINT sesiones_instructor_sin_solape
  EXCLUDE USING gist (
    instructor_id WITH =,
    tstzrange(inicio, fin) WITH &&
  )
  WHERE (cancelada = false AND instructor_id IS NOT NULL);

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
  -- Bloque anidado: si la restricción salta, el ROLLBACK del sub-bloque
  -- deshace TAMBIÉN el UPDATE de sustituciones de más arriba (implicit
  -- savepoint) — la sustitución no queda mal marcada como 'confirmada'
  -- mientras la clase se quedó con la instructora antigua.
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

    -- Reasignar la clase a la sustituta, en la MISMA transacción. Si esto
    -- viola sesiones_instructor_sin_solape, Postgres lanza exclusion_violation.
    UPDATE public.sesiones
      SET instructor_id = p_instructor_id
    WHERE id = v_sesion;

    RETURN jsonb_build_object('ok', true, 'sesion_id', v_sesion);
  EXCEPTION WHEN exclusion_violation THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'conflicto_horario');
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirmar_sustitucion(text, text, text, uuid)
  TO authenticated, service_role;
