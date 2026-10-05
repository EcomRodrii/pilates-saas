-- ─────────────────────────────────────────────────────────────────────────────
-- Recomendaciones del Centro de Control: lo que pasó al ejecutarlas, y nadie
-- las escribe desde el navegador (ni a ellas, ni el mensaje del día).
--
-- 1. `recomendaciones.resultado` (jsonb): lo que hizo DE VERDAD el ejecutor
--    (`ejecutarRecomendacion`, lib/inngest/decision.ts) al cerrarla como
--    EJECUTADA o FALLIDA, en el mismo UPDATE que el estado. Forma en
--    lib/decision/resultado-ejecucion.ts: `{ detalle, cobro?, interrumpida? }`,
--    y en un cobro el desglose por recibo (cobrados y sus €, adeudos SEPA en
--    curso aparte, los cobrados en Stripe sin quedar cobrado su recibo, los que
--    ya no estaban pendientes, los sin confirmar y los rechazados con su motivo).
--    `interrumpida`: el ejecutor agotó sus reintentos y su `onFailure` la cerró
--    FALLIDA sin saber hasta dónde llegó.
--    Antes no se guardaba en ningún sitio que se pudiera leer: tras «Cobrar
--    ahora» la pantalla no sabía si se había cobrado o rechazado (un rechazo no
--    deja rastro en Cobros), y «Mientras dormías» daba por cobrado lo que el
--    análisis pensaba cobrar. NULL = aún sin ejecutar, o ejecutada antes de esta
--    columna. El refresco del análisis no la pisa (`recomendacionToDb` no la
--    lleva).
--
-- 2. `authenticated` pierde INSERT, UPDATE y DELETE sobre `recomendaciones`,
--    `recomendacion_outcomes` y `decision_mensajes_dia`; conserva SELECT (las RLS
--    `owner_*` siguen acotando la lectura a la propietaria de su estudio).
--    Las tres las escribe solo el servidor: lib/decision/db.ts con service-role,
--    y funciones SECURITY DEFINER que solo ejecuta service_role y no dependen de
--    los privilegios de quien las llama:
--      · `aprobar_recomendacion_autonoma` (el piloto automático: PENDIENTE →
--        APROBADA en `recomendaciones`, 20260910163827);
--      · `anonimizar_socio`, `anonimizar_instructor` (supresión: anonimizan
--        `recomendaciones` y el `motivo_motor` de `decision_mensajes_dia`);
--      · `purgar_estudio_vencido` (borra las tres con el resto del estudio).
--    Ningún código del navegador escribe en ellas (comprobado con grep en app/,
--    components/ y lib/: todas las escrituras van por lib/decision/db.ts, con
--    service-role), ninguna de las tres tiene triggers, ninguna FK apunta a
--    `decision_mensajes_dia`, y las cascadas de las FK (la de
--    `tareas.recomendacion_id`, ON DELETE SET NULL) corren como dueño de
--    la tabla, no como quien borra.
--    Por qué: con `owner_*` FOR ALL y el grant de tabla, la propietaria podía
--    escribir con su sesión una fila de SU estudio con el `socio_id` (o los
--    `reciboIds`) de otro estudio —la FK a socios es global—, y los
--    consumidores con service-role (ejecutor, medición) leían esos ids sin
--    filtrar por estudio. En `decision_mensajes_dia`, el `recomendacion_id` del
--    mensaje del día lo leía GET /api/decisiones con service-role, sin acotar al
--    estudio, y lo devolvía como veredicto; y sus filas deciden la «semana
--    tranquila», el resumen semanal y la calibración del Umbral: escribirlas a
--    mano era elegir qué enseña la pantalla y qué aprende el motor. El código ya
--    filtra por `studio_id` en cada consulta; esto cierra la puerta por la que
--    entraban.
--    TRUNCATE, TRIGGER y REFERENCES ya están retirados para todo `public`
--    (20260823124234), y `anon` no tiene nada en estas tablas (20260913233722).
--
-- Verificar después de aplicar, para los tres roles, con el privilegio efectivo
-- y no con lo que dice este fichero:
--   select r, t, p, has_table_privilege(r, t, p) from
--     unnest(array['anon','authenticated','service_role']) r,
--     unnest(array['public.recomendaciones','public.recomendacion_outcomes','public.decision_mensajes_dia']) t,
--     unnest(array['SELECT','INSERT','UPDATE','DELETE']) p;
--   → authenticated: solo SELECT · service_role: los cuatro · anon: ninguno.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.recomendaciones add column if not exists resultado jsonb;

comment on column public.recomendaciones.resultado is
  'Lo que pasó al ejecutarla (lo escribe el ejecutor al cerrarla como EJECUTADA o FALLIDA): { detalle, cobro?, interrumpida? }. Forma en lib/decision/resultado-ejecucion.ts.';

revoke insert, update, delete on table public.recomendaciones from authenticated;
revoke insert, update, delete on table public.recomendacion_outcomes from authenticated;
revoke insert, update, delete on table public.decision_mensajes_dia from authenticated;
