-- ─────────────────────────────────────────────────────────────────────────────
-- rankear_candidatas: la disponibilidad CUBRE la clase, no coincide con franjas
-- fijas escritas a mano.
--
-- ⚠️ BUG EN PRODUCCIÓN desde el 7-sep (#1686). La rejilla de disponibilidad
-- (lib/sustituciones/franjas.ts) pasó de TRES franjas a CUATRO:
--   06:00-10:00 · 10:00-14:00 · 14:00-18:00 · 18:00-23:59
-- pero `en_ventana` (20260804231727, rehecha en 20260810231458) seguía
-- exigiendo que existiera una fila EXACTA por cada una de las tres antiguas
-- que se solapaba con la clase:
--   ('06:00','14:00') · ('14:00','20:00') · ('20:00','23:59')
-- Ninguna pantalla puede guardar ya esas filas (ni «Mi perfil», ni el enlace
-- público, ni «La marco yo»), así que toda disponibilidad marcada desde el 7-sep
-- era INVISIBLE para el motor: «Ninguna candidata disponible para esta franja»
-- con la instructora marcada justo a esa hora. Lo destapó la evaluación del
-- 13-sep: Carmen con martes 18:00-23:59 no salía para un Yoga del martes 20:00.
-- La propia 20260804231727 lo advertía («deben mantenerse en sync si esos
-- límites cambian algún día»), y no se mantuvieron.
--
-- Arreglo: no volver a atar el SQL a unos límites concretos. Una instructora
-- está en ventana si la UNIÓN de sus filas de ese día cubre la clase entera,
-- vengan en el formato que vengan:
--   · filas de 4 franjas (las de ahora),
--   · filas de 3 franjas (las guardadas antes del 7-sep, que siguen en la tabla),
--   · y clases que cruzan un corte (el caso de 20260804231727), porque las
--     franjas son contiguas y la unión no tiene hueco.
-- Se comprueba muestreando la clase cada 5 minutos más su último minuto: los
-- cortes de franja caen en horas en punto, así que un hueco real nunca se escapa
-- entre dos muestras. `hora_fin = 23:59` cubre hasta el final del día (es como la
-- rejilla escribe «hasta el cierre»).
--
-- Todo lo demás es IDÉNTICO a 20260810231458 (historial, probabilidad,
-- excepciones, conflicto, scoring y motivos).
--
-- CREATE OR REPLACE con la MISMA firma (p_sesion_id text, p_tz text): conserva
-- los GRANT existentes — sin el gotcha de firma nueva. Aun así se verifica
-- `has_function_privilege` para anon/authenticated tras aplicar.
-- ─────────────────────────────────────────────────────────────────────────────

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
         (s.inicio AT TIME ZONE p_tz)::date AS fecha,
         -- Minutos de clase dentro del día (una clase que cruzara medianoche
         -- se evalúa hasta las 23:59, como el resto del modelo de franjas).
         GREATEST(
           (EXTRACT(EPOCH FROM (
              LEAST((s.fin AT TIME ZONE p_tz)::time, '23:59'::time) - (s.inicio AT TIME ZONE p_tz)::time
            )) / 60)::int,
           1
         ) AS minutos
  FROM public.sesiones s
  WHERE s.id = p_sesion_id
),
muestras AS (
  -- Instantes de la clase que tienen que estar cubiertos: cada 5 minutos desde
  -- el inicio, más el último minuto.
  SELECT ses.t_ini + make_interval(mins => m) AS t
  FROM ses, generate_series(0, ses.minutos - 1, 5) AS m
  UNION
  SELECT ses.t_ini + make_interval(mins => ses.minutos - 1) FROM ses
),
oferta AS (
  SELECT sc.instructor_id,
         bool_or(sc.estado = 'aceptado')  AS acepto,
         bool_or(sc.estado = 'rechazado') AS rechazo,
         min(sc.enviado_en)               AS primer_aviso,
         max(su.resuelto_en)              AS resuelto_en
  FROM public.sustitucion_contactos sc
  JOIN public.sustituciones su ON su.id = sc.sustitucion_id
  JOIN ses ON sc.studio_id = ses.studio_id
  WHERE su.estado IN ('confirmada', 'sin_sustituta', 'resuelta_fuera', 'cancelada')
    AND sc.enviado_en >= now() - interval '365 days'
  GROUP BY sc.instructor_id, sc.sustitucion_id
),
hist AS (
  SELECT o.instructor_id,
         count(*) FILTER (WHERE o.acepto)::int AS aceptadas,
         count(*)::int                         AS ofertas
  FROM oferta o
  WHERE o.acepto OR o.rechazo
     OR (o.resuelto_en IS NOT NULL AND o.resuelto_en >= o.primer_aviso + interval '45 minutes')
  GROUP BY o.instructor_id
),
pool AS (
  SELECT COALESCE(sum(aceptadas)::numeric / NULLIF(sum(ofertas), 0), 0.5) AS prior FROM hist
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
    NOT EXISTS (
      SELECT 1 FROM muestras mu
      WHERE NOT EXISTS (
        SELECT 1 FROM public.instructora_disponibilidad d
        WHERE d.instructor_id = c.id AND d.dia_semana = ses.dow
          AND d.hora_inicio <= mu.t
          AND (d.hora_fin > mu.t OR d.hora_fin >= '23:59'::time)
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
       WHERE su.sustituta_final_id = c.id AND su.estado = 'confirmada') AS ult_sust,
    COALESCE(h.aceptadas, 0) AS aceptadas,
    COALESCE(h.ofertas, 0)   AS ofertas
  FROM cand c
  CROSS JOIN ses
  LEFT JOIN hist h ON h.instructor_id = c.id
),
ok AS (
  SELECT * FROM elig
  WHERE (en_ventana OR extra) AND NOT bloqueada AND NOT conflicto
),
scored AS (
  SELECT o.id, o.nombre, o.veces_tipo, o.horas, o.ult_sust, o.aceptadas, o.ofertas,
    CASE WHEN o.ofertas >= 5
         THEN round(((o.aceptadas + 5 * pl.prior) / (o.ofertas + 5))::numeric, 3)
         ELSE NULL END AS prob_aceptacion,
    ( 100
      + (CASE WHEN o.veces_tipo > 0 THEN 10 ELSE -40 END)
      + (CASE WHEN o.horas < p.pool_avg THEN 20 ELSE 0 END)
      + (CASE WHEN o.ult_sust IS NULL OR o.ult_sust < now() - interval '21 days' THEN 5 ELSE 0 END)
      + (CASE WHEN o.ofertas >= 5
              THEN round(((o.aceptadas + 5 * pl.prior) / (o.ofertas + 5) - pl.prior) * 40)
              ELSE 0 END)
    )::int AS score,
    ( ARRAY['está disponible']
      || (CASE WHEN o.veces_tipo > 0
               THEN ARRAY['ya ha dado esta clase ' || o.veces_tipo || ' ' ||
                          (CASE WHEN o.veces_tipo = 1 THEN 'vez' ELSE 'veces' END) ||
                          ' — las alumnas la conocen']
               ELSE ARRAY['no ha impartido antes este tipo de clase'] END)
      || (CASE WHEN o.horas < p.pool_avg THEN ARRAY['este mes va holgada de horas'] ELSE ARRAY[]::text[] END)
      || (CASE WHEN o.ult_sust IS NULL OR o.ult_sust < now() - interval '21 days'
               THEN ARRAY['hace semanas que no sustituye'] ELSE ARRAY[]::text[] END)
      || (CASE WHEN o.ofertas >= 5
               THEN ARRAY['ha dicho que sí ' || o.aceptadas || ' de las últimas ' || o.ofertas || ' veces que se le pidió']
               ELSE ARRAY[]::text[] END)
    ) AS motivos
  FROM ok o, (SELECT avg(horas) AS pool_avg FROM ok) p, pool pl
)
SELECT COALESCE(
  jsonb_agg(
    jsonb_build_object(
      'instructor_id', t.id,
      'nombre', t.nombre,
      'score', t.score,
      'compatibilidad', LEAST(99, GREATEST(55, t.score))::int,
      'veces', t.veces_tipo,
      'prob_aceptacion', t.prob_aceptacion,
      'prob_aceptadas', t.aceptadas,
      'prob_ofertas', t.ofertas,
      'motivos', to_jsonb(t.motivos)
    ) ORDER BY t.rn
  ) FILTER (WHERE t.rn <= 3),
  '[]'::jsonb
)
FROM (
  SELECT id, nombre, score, veces_tipo, motivos, prob_aceptacion, aceptadas, ofertas,
         row_number() OVER (ORDER BY score DESC, nombre) AS rn
  FROM scored
) t;
$$;
