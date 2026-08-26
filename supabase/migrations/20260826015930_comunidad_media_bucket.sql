-- Community & Messaging OS, P1 — bucket de Storage para la imagen de un post
-- del Feed de comunidad. Mismo patrón que `avatars` (bucket público, servido
-- por getPublicUrl() sin pasar por RLS en ese endpoint), NO el patrón de
-- `red-documentos-identidad` (bucket privado): la imagen de un post es
-- contenido que cualquier socia con el enlace debe poder ver embebido en un
-- <img src>, igual que un logo o un avatar.
--
-- Path esperado: "<studio_id>/<...>", ej. "studio-abc123/post-<id>.webp".
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'comunidad-media',
  'comunidad-media',
  true,
  5242880, -- 5 MB, mismo límite que avatars (avatars_limite_y_select_por_path)
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

-- INSERT: solo `authenticated` (staff con sesión de panel — la propietaria/
-- manager/recepción que publica en el Feed), y solo en la carpeta de SU
-- propio estudio activo. `current_studio_id()` devuelve `text`, mismo tipo
-- que `(storage.foldername(name))[1]`, sin cast.
create policy comunidad_media_insert_autorizado on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'comunidad-media'
    and (storage.foldername(name))[1] = public.current_studio_id()
  );

-- SELECT: SOLO `authenticated`, scopeada por estudio — NO se añade una
-- policy de SELECT para `anon`/`public`. Dos motivos, ambos ya vividos en
-- este repo con el bucket `avatars`:
--   1) Un bucket `public = true` se sirve por su URL pública
--      (getPublicUrl()) SIN evaluar RLS en ese endpoint — el <img src> del
--      Feed funciona igual que hoy funciona un avatar, sin necesitar
--      ninguna policy de lectura anónima.
--   2) Añadir una policy de SELECT a `anon`/`public` reabriría exactamente
--      el listado anónimo del bucket que 0077_avatars_bucket_lockdown.sql
--      cerró (advisor `public_bucket_allows_listing`) — sería repetir ese
--      agujero en un bucket nuevo.
-- La policy de SELECT que sí hace falta es para `authenticated`, por el
-- mismo motivo que forzó 0133/20260731011523 en `avatars`:
-- `storage.upload()` hace un INSERT ... RETURNING por debajo, y sin SELECT
-- ese RETURNING falla con "new row violates row-level security policy" aun
-- cuando el INSERT en sí está permitido. A diferencia de `avatars` (que
-- pasó primero por una versión sin scope y tuvo que corregirse después),
-- aquí se scopea por estudio desde el primer día.
create policy comunidad_media_select_autorizado on storage.objects
  for select to authenticated
  using (
    bucket_id = 'comunidad-media'
    and (storage.foldername(name))[1] = public.current_studio_id()
  );

-- Sin UPDATE/DELETE para `authenticated` en P1 (mismo alcance pedido en el
-- diseño): borrar/reemplazar la imagen de un post, si hace falta, es
-- trabajo de servidor/service-role, no de esta pieza.
