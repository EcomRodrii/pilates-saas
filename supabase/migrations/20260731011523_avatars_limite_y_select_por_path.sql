-- Auditoría CTO: el bucket `avatars` no tenía `file_size_limit` ni
-- `allowed_mime_types` — la única validación de tamaño/formato
-- (lib/portal-storage.ts: validarImagenMarca/validarFotoPerfil) es en
-- CLIENTE, trivialmente saltable llamando a la Storage API directo con un
-- token válido. Y `avatars_select_authenticated` (0133) permitía a
-- CUALQUIER authenticated leer los objetos de CUALQUIER estudio — 0133 la
-- añadió sin scope porque sin SELECT el INSERT...RETURNING de
-- `storage.upload()` fallaba, pero el fix correcto es scopearla igual que ya
-- están scopeados INSERT/UPDATE/DELETE (20260730140022), no dejarla abierta
-- del todo.
--
-- Límite de tamaño: 5 MB, el mayor de los usados hoy (FOTO_PERFIL_MAX_BYTES
-- en lib/portal-storage.ts; logo/favicon ya piden menos en cliente).
-- Tipos: los mismos que ya valida el cliente (IMG_TIPOS) más 'image/*' para
-- cubrir el caso "cualquier imagen" de fotos de perfil.
update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/png','image/jpeg','image/webp','image/svg+xml','image/x-icon','image/vnd.microsoft.icon','image/gif']
where id = 'avatars';

drop policy if exists avatars_select_authenticated on storage.objects;

create policy avatars_select_autorizado on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and public.avatars_path_autorizado(name));
