-- ═══════════════════════════════════════════════════════════════════════════
-- 0045 · TENTARE — asistencia media por instructora (para el rediseño de Equipo)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- % de asistencia = reservas ASISTIDA / (ASISTIDA + NO_ASISTIO) de las clases que
-- dio cada instructora. Solo cuenta reservas ya "resueltas" (asistió o no vino);
-- ignora CANCELADA / CONFIRMADA / LISTA_ESPERA (aún sin desenlace). `base` deja a
-- la UI mostrar "—" cuando todavía no hay historial suficiente.
-- Reversible: DROP FUNCTION.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.instructor_asistencia_estudio(p_studio_id text)
RETURNS TABLE(instructor_id text, asistencia_pct integer, base bigint)
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    s.instructor_id,
    round(100.0 * count(*) FILTER (WHERE r.estado = 'ASISTIDA')
          / NULLIF(count(*) FILTER (WHERE r.estado IN ('ASISTIDA', 'NO_ASISTIO')), 0))::int,
    count(*) FILTER (WHERE r.estado IN ('ASISTIDA', 'NO_ASISTIO'))::bigint
  FROM public.reservas r
  JOIN public.sesiones s ON s.id = r.sesion_id
  WHERE s.studio_id = p_studio_id
    AND s.instructor_id IS NOT NULL
  GROUP BY s.instructor_id
  HAVING count(*) FILTER (WHERE r.estado IN ('ASISTIDA', 'NO_ASISTIO')) > 0;
$$;

GRANT EXECUTE ON FUNCTION public.instructor_asistencia_estudio(text)
  TO authenticated, service_role;
