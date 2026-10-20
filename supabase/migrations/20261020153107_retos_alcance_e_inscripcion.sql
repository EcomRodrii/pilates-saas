-- ─────────────────────────────────────────────────────────────────────────────
-- Retos: alcance («del estudio» o «con inscripción») e inscripción real.
--
-- ADITIVA y sin tocar datos de producción más allá de marcar los retos que ya
-- existen como «del estudio» (es lo que hacían: contaban a todas).
--
-- 1. challenge_definitions.alcance
--      ESTUDIO      → cuentan todas las alumnas, sin botón «Me apunto».
--      INSCRIPCION  → solo las que se apuntan, y desde que se apuntan.
--    Los retos NUEVOS nacen con INSCRIPCION (default): nada inscribe a nadie
--    sin que corresponda. Los que ya existían se quedan como ESTUDIO.
--
-- 2. reto_participaciones deja de aceptar solo 'core'/'cara'. Esa tabla ya
--    guarda quién se apunta a qué (y cuándo: created_at); los retos del estudio
--    la reutilizan con reto_key = id del reto, en vez de crear un segundo
--    sistema. La integridad ya no la da el CHECK de claves fijas: la da el
--    servidor (comprueba que el reto existe en el estudio de la alumna).
--
-- 3. reto_participaciones.baja_en: «Ya no participo» no borra la fila, porque
--    borrarla permitiría volver a apuntarse más tarde y contar con fecha nueva
--    lo ya hecho (o al revés, perder la fecha original). Con baja_en la
--    inscripción conserva su fecha. Los retos del carrusel siguen borrando.
-- ─────────────────────────────────────────────────────────────────────────────

-- Se añade con default ESTUDIO para que las filas que YA existen (que contaban a
-- todas) queden «del estudio», y justo después el default pasa a INSCRIPCION
-- para los retos nuevos.
alter table public.challenge_definitions
  add column if not exists alcance text not null default 'ESTUDIO';

alter table public.challenge_definitions
  alter column alcance set default 'INSCRIPCION';

alter table public.challenge_definitions
  drop constraint if exists challenge_definitions_alcance_check;
alter table public.challenge_definitions
  add constraint challenge_definitions_alcance_check
  check (alcance in ('ESTUDIO', 'INSCRIPCION'));

alter table public.reto_participaciones
  drop constraint if exists reto_participaciones_reto_key_check;
alter table public.reto_participaciones
  add constraint reto_participaciones_reto_key_check
  check (length(reto_key) between 1 and 100);

alter table public.reto_participaciones
  add column if not exists baja_en timestamptz;
