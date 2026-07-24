-- 0090 · F0 (audit A4 / F0-8) — RLS de datos de salud alineada con el permiso de la
-- app. ANTES: las 3 tablas clínicas eran studio-scoped para CUALQUIER staff
-- autenticado (incl. RECEPCIÓN). La UI ya ocultaba la ficha clínica a recepción
-- (puedeVerFichaClinica = PROPIETARIO|INSTRUCTOR), pero la BD no lo forzaba → un
-- token de recepción podía leer condiciones de salud (RGPD art. 9) por REST.
--
-- AHORA (Tier 1): se añade el check de rol a las 3 tablas. Solo PROPIETARIO e
-- INSTRUCTOR. Las instructoras NO se ven afectadas (siguen viendo la salud de su
-- estudio) → 'adaptaciones en clase' intacto. Recepción queda fuera; los socios
-- (rol nulo) siguen fuera. Las 3 tablas son de escritura SOLO desde el panel
-- (calendario), nunca desde el portal de la socia → ningún camino de socia se rompe.
--
-- (Tier 2 —acotar la instructora a su propia clase— queda como refinamiento futuro.)

drop policy if exists admin_condiciones_salud on public.condiciones_salud;
create policy salud_condiciones_salud on public.condiciones_salud for all to authenticated
  using      (studio_id = current_studio_id() and current_rol() in ('PROPIETARIO','INSTRUCTOR'))
  with check (studio_id = current_studio_id() and current_rol() in ('PROPIETARIO','INSTRUCTOR'));

drop policy if exists admin_notas_progreso on public.notas_progreso;
create policy salud_notas_progreso on public.notas_progreso for all to authenticated
  using      (studio_id = current_studio_id() and current_rol() in ('PROPIETARIO','INSTRUCTOR'))
  with check (studio_id = current_studio_id() and current_rol() in ('PROPIETARIO','INSTRUCTOR'));

drop policy if exists admin_respuestas_sesion on public.respuestas_sesion;
create policy salud_respuestas_sesion on public.respuestas_sesion for all to authenticated
  using      (studio_id = current_studio_id() and current_rol() in ('PROPIETARIO','INSTRUCTOR'))
  with check (studio_id = current_studio_id() and current_rol() in ('PROPIETARIO','INSTRUCTOR'));
