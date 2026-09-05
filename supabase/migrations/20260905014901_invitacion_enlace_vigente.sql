-- Amplía instructor_enlaces_vigentes (migr 0057) para cubrir también el
-- scope 'invitacion' — antes solo 'disponibilidad'/'reportar_baja' podían
-- revocarse (regenerar sobrescribe el enlace vigente y así invalida el
-- anterior). El token de invitación al equipo comparte el mismo mecanismo
-- HMAC (lib/sustituciones/token.ts) pero se firmaba directo, sin pasar por
-- esta tabla, así que cada reenvío emitía un token independientemente válido
-- durante 30 días sin invalidar los anteriores.
alter table public.instructor_enlaces_vigentes
  drop constraint instructor_enlaces_vigentes_scope_check;

alter table public.instructor_enlaces_vigentes
  add constraint instructor_enlaces_vigentes_scope_check
  check (scope in ('disponibilidad', 'reportar_baja', 'invitacion'));
