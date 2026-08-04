-- Bug reportado en producción: una instructora marca su disponibilidad
-- COMPLETA (mañana + tarde + noche) y aun así no aparece como candidata para
-- sustituir una clase que cruza exactamente el límite entre dos franjas
-- (p.ej. 13:00-14:30, que cruza el corte mañana/tarde a las 14:00; o
-- 19:30-20:30, que cruza el corte tarde/noche a las 20:00).
--
-- Causa raíz: `instructora_disponibilidad` guarda una fila POR FRANJA
-- (mañana 06:00-14:00, tarde 14:00-20:00, noche 20:00-23:59 — ver
-- lib/sustituciones/franjas.ts, la rejilla de onboarding de disponibilidad).
-- Las franjas son contiguas (fin de una = inicio de la siguiente), pero
-- `en_ventana` en rankear_candidatas (0041) exigía que UNA SOLA fila
-- cubriera la sesión entera:
--   d.hora_inicio <= ses.t_ini AND d.hora_fin >= ses.t_fin
-- Con la disponibilidad completa marcada como 3 filas independientes, una
-- sesión que cruza un corte de franja no encuentra NINGUNA fila que la
-- cubra por sí sola — aunque las 3 franjas seguidas sí la cubran juntas.
--
-- Arreglo: en vez de buscar una fila que cubra toda la sesión, se comprueba
-- que CADA una de las franjas fijas (06:00-14:00 / 14:00-20:00 / 20:00-23:59
-- — mismos límites que lib/sustituciones/franjas.ts, deben mantenerse en
-- sync si esos límites cambian algún día) que se solapa con la sesión tenga
-- su fila correspondiente en instructora_disponibilidad. Esto reproduce
-- fielmente el modelo de "rejilla de toques" de la UI, en vez de exigir un
-- rango continuo que el propio modelo de datos nunca produce como una sola
-- fila cuando cruza un corte.
--
-- CREATE OR REPLACE con la MISMA firma (p_sesion_id text, p_tz text) —
-- conserva los GRANT existentes, sin gotcha de firma nueva.

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
         EXTRACT(DOW FROM (s.inicio AT TIME ZONE p_tz))::int AS dow,
         (s.inicio AT TIME ZONE p_tz)::time AS t_ini,
         (s.fin    AT TIME ZONE p_tz)::time AS t_fin,
         (s.inicio AT TIME ZONE p_tz)::date AS fecha
  FROM public.sesiones s
  WHERE s.id = p_sesion_id
),
cand AS (
  SELECT i.id, i.nombre
  FROM public.instructores i, ses
  WHERE i.studio_id = ses.studio_id
    AND i.activo = true
    AND (ses.original_id IS NULL OR i.id <> ses.original_id)
),
elig AS (
  SELECT c.id, c.nombre,
    -- Cubierta si NO hay ninguna franja fija que se solape con la sesión y
    -- que la instructora no tenga marcada. Una sesión sin ninguna franja
    -- solapada (imposible en la práctica, 06:00-23:59 cubre el día entero)
    -- se consideraría cubierta por vacuidad — coherente con "nada que cubrir".
    NOT EXISTS (
      SELECT 1 FROM (VALUES
        ('06:00'::time, '14:00'::time),
        ('14:00'::time, '20:00'::time),
        ('20:00'::time, '23:59'::time)
      ) AS franja(f_ini, f_fin)
      WHERE franja.f_ini < ses.t_fin AND franja.f_fin > ses.t_ini
        AND NOT EXISTS (
          SELECT 1 FROM public.instructora_disponibilidad d
          WHERE d.instructor_id = c.id AND d.dia_semana = ses.dow
            AND d.hora_inicio = franja.f_ini AND d.hora_fin = franja.f_fin
        )
    ) AS en_ventana,
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
ok AS (
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
      'compatibilidad', LEAST(99, GREATEST(55, t.score))::int,
      'veces', t.veces_tipo,
      'motivos', to_jsonb(t.motivos)
    ) ORDER BY t.rn
  ) FILTER (WHERE t.rn <= 3),
  '[]'::jsonb
)
FROM (
  SELECT id, nombre, score, veces_tipo, motivos,
         row_number() OVER (ORDER BY score DESC, nombre) AS rn
  FROM scored
) t;
$$;
