-- ═══════════════════════════════════════════════════════════════════════════
-- Tentare Brain · Fase 1 — el paso que faltaba en las sustituciones: PREDECIR
-- ═══════════════════════════════════════════════════════════════════════════
--
-- El motor de sustituciones ya hacía 5 de sus 7 pasos (detectar, analizar,
-- contactar, gestionar respuestas, actualizar). Faltaban PREDECIR y APRENDER,
-- y resulta que el dato para ambos lleva meses escribiéndose y nadie lo lee:
-- `sustitucion_contactos` guarda 'aceptado'/'rechazado' con su `respondido_en`
-- desde 0037, pero `rankear_candidatas` nunca lo ha mirado. Su scoring es una
-- heurística fija (100 +10/-40 +20 +5) que no aprende nada de lo que pasa.
--
-- Esta migración cierra el bucle: la misma función pasa a estimar con qué
-- probabilidad ACEPTARÁ cada candidata, a partir de lo que hizo cada vez que se
-- le pidió antes.
--
-- ── Qué cuenta como "una oferta" ──────────────────────────────────────────
-- Un par (candidata, sustitución), NO una fila de contacto: a una candidata se
-- le avisa por email y luego se le da un toque por WhatsApp/SMS, y eso son 3
-- filas de UNA sola petición. Contar filas inflaría el denominador de quien más
-- insistencia recibió, que es justo la que peor responde.
--
-- ── Qué cuenta como "no aceptó" ───────────────────────────────────────────
-- Aquí está la trampa que hace inútil la versión ingenua. Nadie escribe nunca
-- el estado 'expirado' (verificado en el código: solo
-- app/api/public/aceptar-sustitucion/route.ts escribe, y solo 'aceptado' y
-- 'rechazado'). Una candidata que ignora el email se queda en 'enviado' para
-- siempre. Si el denominador fuese solo aceptado+rechazado, quien contesta 1 de
-- cada 10 veces y esa vez dice que sí saldría con un 100 % de aceptación —
-- exactamente al revés de lo que hace falta saber.
--
-- Así que también cuenta como observación el silencio, pero solo cuando fue un
-- silencio REAL: la sustitución llegó a un estado terminal al menos 45 minutos
-- después de avisarla. 45 min es VENTANA_MAX (lib/sustituciones/ventanas.ts),
-- el ciclo completo de escalado por candidata — por debajo de eso otra persona
-- aceptó antes de que le diera tiempo a mirar el móvil, y apuntárselo en contra
-- sería injusto.
--
-- ── Por qué se suaviza, y por qué a veces no devuelve nada ────────────────
-- Estimación suavizada hacia la tasa media del estudio (Beta-Binomial con
-- pseudo-cuentas): (aceptadas + k·prior) / (ofertas + k), con k = 5.
-- Sin suavizar, "3 de 3" sería un 100 % que no significa nada.
--
-- Y por debajo de 5 ofertas devuelve NULL, no un número. Es la misma regla que
-- ya rige en el resto del Decision OS (ConfianzaMedicion MEDIDO/NO_MEDIBLE,
-- el mínimo de muestras de calibrarUmbral): un porcentaje inventado que la
-- propietaria se cree es peor que no enseñar ninguno. Las constantes 5 y 5 son
-- MUESTRA_MINIMA y FUERZA_PRIOR de lib/decision/prediccion.ts — si se tocan
-- allí, hay que tocarlas aquí (y al revés).
--
-- ── Efecto en el orden ────────────────────────────────────────────────────
-- La probabilidad NO sustituye al score ni reordena por su cuenta: entra como
-- un ajuste de ±20 puntos proporcional a cuánto se desvía esa candidata de la
-- media del estudio, del mismo tamaño que el +20 que ya daba "va holgada de
-- horas". El orden sigue siendo explicable con los `motivos` de siempre, ahora
-- con uno más.
--
-- CREATE OR REPLACE con la MISMA firma (p_sesion_id text, p_tz text) — conserva
-- los GRANT existentes, no aplica el gotcha de firma nueva. Aun así se
-- re-endurecen los permisos al final, porque `anon` tenía EXECUTE heredado de
-- 0038: hoy es inofensivo (la función es SECURITY INVOKER y toda la RLS de
-- `instructores` es para authenticated, así que anon recibe []), pero deja una
-- mina para el día que alguien la pase a SECURITY DEFINER sin mirar.
--
-- Solo lectura, deriva de datos reales. Reversible: reaplicar 20260804231727.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.rankear_candidatas(
  p_sesion_id text,
  p_tz text DEFAULT 'Europe/Madrid'
)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $fn$
WITH ses AS (
  SELECT s.studio_id, s.tipo_clase_id, s.inicio, s.fin, s.instructor_id AS original_id,
         EXTRACT(DOW FROM (s.inicio AT TIME ZONE p_tz))::int AS dow,
         (s.inicio AT TIME ZONE p_tz)::time AS t_ini,
         (s.fin    AT TIME ZONE p_tz)::time AS t_fin,
         (s.inicio AT TIME ZONE p_tz)::date AS fecha
  FROM public.sesiones s
  WHERE s.id = p_sesion_id
),
-- Una fila por (candidata, sustitución cerrada): UNA oferta, aunque se le
-- avisara por varios canales. Acotado a 365 días y al estudio de la sesión.
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
     -- silencio real: tuvo su ventana completa de escalado y no contestó
     OR (o.resuelto_en IS NOT NULL AND o.resuelto_en >= o.primer_aviso + interval '45 minutes')
  GROUP BY o.instructor_id
),
-- Tasa media del estudio: el prior hacia el que se suaviza. Sin historial
-- ninguno da igual qué valga (nadie llega a las 5 ofertas mínimas).
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
    -- Cubierta si NO hay ninguna franja fija que se solape con la sesión y que
    -- la instructora no tenga marcada (ver 20260804231727: la disponibilidad
    -- vive como rejilla de 3 franjas contiguas, no como rango continuo).
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
      -- Ajuste por desviación respecto a la media del estudio: ±20 puntos como
      -- mucho, del mismo tamaño que "va holgada de horas". No reordena sola.
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
      -- El motivo lleva SIEMPRE las cifras que lo sostienen: en este producto la
      -- propietaria nunca ve un número sin su respaldo.
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
      -- NULL = no hay historial suficiente para afirmar nada. Quien lo pinte
      -- debe tratarlo como "no lo sé", NUNCA como probabilidad cero.
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
$fn$;

-- Re-endurecido de permisos (ver cabecera): quitar el EXECUTE que `anon`
-- heredaba de 0038. REVOKE FROM PUBLIC y no solo FROM anon — anon hereda de
-- PUBLIC, no tiene el privilegio directo, así que revocárselo a él no basta.
REVOKE EXECUTE ON FUNCTION public.rankear_candidatas(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rankear_candidatas(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rankear_candidatas(text, text) TO authenticated, service_role, postgres;
