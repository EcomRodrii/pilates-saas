-- ═══════════════════════════════════════════════════════════════════════════
-- 0038 · TENTARE — Scoring de sustituciones: rankear_candidatas()
-- ═══════════════════════════════════════════════════════════════════════════
--
-- El "cerebro" del flujo baja→ranking. Dada una sesión que hay que cubrir,
-- devuelve el top-3 de candidatas con motivos en lenguaje humano (la propietaria
-- NUNCA ve un número; ve "ya ha dado esta clase 4 veces").
--
-- ELEGIBILIDAD (3 comprobaciones, doc §3.3): ventana semanal (o excepción 'extra')
-- cubre la franja · sin 'bloqueo' esa fecha/franja · sin conflicto con otra clase.
-- SCORING (doc §5, sobre base 100, solo elegibles):
--   +10 / -40  ya ha impartido este tipo de clase  (derivado de sesiones)
--   +20        va holgada de horas este mes vs. la media del grupo (reparto justo)
--   +5         hace >3 semanas que no sustituye (o nunca)
--
-- Zona horaria: las clases son timestamptz absolutos; para casar la franja con la
-- disponibilidad semanal (día+hora local) se interpreta en p_tz (Europe/Madrid por
-- defecto — ICP España). Parametrizable si algún día hay estudios fuera de ES.
--
-- Solo lectura, deriva de datos reales. Reversible: DROP FUNCTION.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.rankear_candidatas(
  p_sesion_id text,
  p_tz text DEFAULT 'Europe/Madrid'
)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
WITH ses AS (
  SELECT s.studio_id, s.tipo_clase_id, s.inicio, s.fin, s.instructor_id AS original_id,
         EXTRACT(DOW FROM (s.inicio AT TIME ZONE p_tz))::int AS dow,   -- 0=domingo..6=sábado
         (s.inicio AT TIME ZONE p_tz)::time AS t_ini,
         (s.fin    AT TIME ZONE p_tz)::time AS t_fin,
         (s.inicio AT TIME ZONE p_tz)::date AS fecha
  FROM public.sesiones s
  WHERE s.id = p_sesion_id
),
cand AS (   -- pool: instructoras activas del estudio, distintas de la que dio la baja
  SELECT i.id, i.nombre
  FROM public.instructores i, ses
  WHERE i.studio_id = ses.studio_id
    AND i.activo = true
    AND (ses.original_id IS NULL OR i.id <> ses.original_id)
),
elig AS (
  SELECT c.id, c.nombre,
    EXISTS (SELECT 1 FROM public.instructora_disponibilidad d
            WHERE d.instructor_id = c.id AND d.dia_semana = ses.dow
              AND d.hora_inicio <= ses.t_ini AND d.hora_fin >= ses.t_fin) AS en_ventana,
    EXISTS (SELECT 1 FROM public.instructora_disponibilidad_excepciones e
            WHERE e.instructor_id = c.id AND e.fecha = ses.fecha AND e.tipo = 'extra'
              AND (e.hora_inicio IS NULL OR (e.hora_inicio <= ses.t_ini AND e.hora_fin >= ses.t_fin))) AS extra,
    EXISTS (SELECT 1 FROM public.instructora_disponibilidad_excepciones e
            WHERE e.instructor_id = c.id AND e.fecha = ses.fecha AND e.tipo = 'bloqueo'
              AND (e.hora_inicio IS NULL OR (e.hora_inicio < ses.t_fin AND e.hora_fin > ses.t_ini))) AS bloqueada,
    public.instructor_tiene_conflicto(c.id, ses.inicio, ses.fin, p_sesion_id) AS conflicto,
    (SELECT count(*) FROM public.sesiones x
       WHERE x.instructor_id = c.id AND x.tipo_clase_id = ses.tipo_clase_id
         AND x.cancelada = false AND x.inicio < now())::int AS veces_tipo,
    public.instructor_horas_mes(c.id) AS horas,
    (SELECT max(su.resuelto_en) FROM public.sustituciones su
       WHERE su.sustituta_final_id = c.id AND su.estado = 'confirmada') AS ult_sust
  FROM cand c, ses
),
ok AS (   -- solo elegibles
  SELECT * FROM elig
  WHERE (en_ventana OR extra) AND NOT bloqueada AND NOT conflicto
),
scored AS (
  SELECT o.id, o.nombre, o.veces_tipo, o.horas, o.ult_sust,
    ( 100
      + (CASE WHEN o.veces_tipo > 0 THEN 10 ELSE -40 END)
      + (CASE WHEN o.horas < p.pool_avg THEN 20 ELSE 0 END)
      + (CASE WHEN o.ult_sust IS NULL OR o.ult_sust < now() - interval '21 days' THEN 5 ELSE 0 END)
    ) AS score,
    ( ARRAY['está disponible']
      || (CASE WHEN o.veces_tipo > 0
               THEN ARRAY['ya ha dado esta clase ' || o.veces_tipo || ' ' ||
                          (CASE WHEN o.veces_tipo = 1 THEN 'vez' ELSE 'veces' END) ||
                          ' — las alumnas la conocen']
               ELSE ARRAY['no ha impartido antes este tipo de clase'] END)
      || (CASE WHEN o.horas < p.pool_avg THEN ARRAY['este mes va holgada de horas'] ELSE ARRAY[]::text[] END)
      || (CASE WHEN o.ult_sust IS NULL OR o.ult_sust < now() - interval '21 days'
               THEN ARRAY['hace semanas que no sustituye'] ELSE ARRAY[]::text[] END)
    ) AS motivos
  FROM ok o, (SELECT avg(horas) AS pool_avg FROM ok) p
)
SELECT COALESCE(
  jsonb_agg(
    jsonb_build_object(
      'instructor_id', t.id,
      'nombre', t.nombre,
      'score', t.score,
      'motivos', to_jsonb(t.motivos)
    ) ORDER BY t.rn
  ) FILTER (WHERE t.rn <= 3),
  '[]'::jsonb
)
FROM (
  SELECT id, nombre, score, motivos,
         row_number() OVER (ORDER BY score DESC, nombre) AS rn
  FROM scored
) t;
$$;

GRANT EXECUTE ON FUNCTION public.rankear_candidatas(text, text) TO anon, authenticated, service_role;
