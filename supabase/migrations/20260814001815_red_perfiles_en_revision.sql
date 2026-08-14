-- Fundador (feedback directo): "cuando una instructora abre su perfil lo
-- rellena todo, se pasa automáticamente la revisión" — hasta ahora, el
-- dueño podía poner su propio perfil en 'published' vía el endpoint (que
-- ya usaba service-role sin más barrera de negocio que nombre+ciudad+
-- especialidad) Y, más grave, vía RLS: red_perfiles_update_propio solo
-- excluía 'suspended', así que un UPDATE directo a Supabase REST con el
-- JWT propio (sin pasar por la API) podía publicar sin que nadie de
-- Tentare lo viera nunca. Nuevo estado 'en_revision': lo único que el
-- dueño puede pedir al terminar el wizard. 'published' pasa a ser
-- EXCLUSIVO de moderación (service-role, app/api/interno/network/perfiles),
-- igual que ya lo era 'suspended'.

alter table public.red_perfiles drop constraint red_perfiles_estado_check;
alter table public.red_perfiles add constraint red_perfiles_estado_check
  check (estado in ('draft', 'en_revision', 'published', 'hidden', 'suspended'));

drop policy if exists red_perfiles_update_propio on public.red_perfiles;
create policy red_perfiles_update_propio on public.red_perfiles
  for update to authenticated
  using (auth_user_id = (select auth.uid()) and estado <> 'suspended')
  with check (auth_user_id = (select auth.uid()) and estado in ('draft', 'en_revision', 'hidden'));
