-- B1 (F1 seguridad) — Cierra el bucket `avatars`, que estaba TOTALMENTE abierto a
-- `public` (incl. anon): SELECT + INSERT + UPDATE + DELETE. Es decir, cualquiera
-- sin login podía subir, sobrescribir, borrar o LISTAR cualquier avatar (logos de
-- estudio, fotos de socias/instructoras) — vandalismo / DoS / abuso de storage.
--
-- El bucket es público (storage.buckets.public = true), así que los objetos se
-- SIRVEN por su URL (getPublicUrl) SIN policy de RLS. Todas las subidas legítimas
-- (lib/portal-storage.ts: socias del portal + staff del panel) son de usuarios
-- `authenticated`. La app NO usa la API de listado/descarga de storage para
-- avatares (solo getPublicUrl), así que quitar el SELECT público:
--   · no rompe el display (sigue por URL pública),
--   · mata el listado anónimo (advisor public_bucket_allows_listing).
--
-- Follow-up (hardening más fino, riesgo menor): restringir cada escritura a su
-- propio path (una socia solo su socioId, un estudio solo logo-<studioId>, etc.).
-- Hoy cualquier autenticado puede sobrescribir cualquier avatar; mucho menor que
-- el acceso anónimo que aquí se cierra.

drop policy if exists public_read_avatars   on storage.objects;
drop policy if exists anyone_write_avatars   on storage.objects;
drop policy if exists anyone_update_avatars  on storage.objects;
drop policy if exists anyone_delete_avatars  on storage.objects;

create policy avatars_insert_authenticated on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars');

create policy avatars_update_authenticated on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars')
  with check (bucket_id = 'avatars');

create policy avatars_delete_authenticated on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars');
