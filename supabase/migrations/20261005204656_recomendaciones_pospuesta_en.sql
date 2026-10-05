-- ─────────────────────────────────────────────────────────────────────────────
-- Recomendaciones: cuándo las dejó la propietaria «para más adelante».
--
-- `recomendaciones.pospuesta_en` (timestamptz): lo escribe «Recuérdamelo»
-- (POST /api/decisiones/[id]/posponer, `dbPosponerRecomendacion`) en el mismo
-- UPDATE que aplaza su `expira_en`. La recomendación sigue PENDIENTE: posponer
-- no la resuelve.
--
-- Por qué: el mensaje del día que se aplazaba se quitaba de la pantalla en el
-- momento, y al recargar volvía con sus botones como si nadie lo hubiera
-- tocado. Nada guardaba que se había aplazado. Con esto, GET /api/decisiones
-- sabe que el mensaje de hoy se aplazó hoy y el veredicto lo dice («Lo has
-- dejado para más adelante»), en vez de volver a pedirle lo mismo.
--
-- NULL = nunca se ha aplazado. El refresco del análisis no la pisa:
-- `recomendacionToDb` (lib/decision/db.ts) no la lleva.
--
-- Grants: desde 20261005143004 `authenticated` solo tiene SELECT de TABLA sobre
-- `recomendaciones` (que alcanza a toda columna nueva) y la escribe solo el
-- servidor con service-role. Se repite el REVOKE de escritura (idempotente, y
-- también para `anon`, que nunca la escribe): una columna nueva hereda los
-- privilegios de TABLA, así que la garantía es la de la tabla, no la de la
-- columna. Verificar después de aplicar:
--   select has_column_privilege('authenticated', 'public.recomendaciones', 'pospuesta_en', 'SELECT'),
--          has_column_privilege('authenticated', 'public.recomendaciones', 'pospuesta_en', 'UPDATE'),
--          has_column_privilege('service_role',  'public.recomendaciones', 'pospuesta_en', 'UPDATE');
--   → true, false, true.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.recomendaciones add column if not exists pospuesta_en timestamptz;

revoke insert, update, delete on table public.recomendaciones from anon, authenticated;

comment on column public.recomendaciones.pospuesta_en is
  'Cuándo la aplazó la propietaria con «Recuérdamelo» (sigue PENDIENTE). NULL = nunca. Lo escribe solo el servidor; el refresco del análisis no lo toca.';
