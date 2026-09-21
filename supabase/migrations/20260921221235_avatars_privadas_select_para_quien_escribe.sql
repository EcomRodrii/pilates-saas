-- La subida al bucket privado fallaba siempre con «new row violates row-level security policy»:
-- Storage inserta con RETURNING/upsert y necesita poder LEER la fila que acaba de escribir, y la
-- única política de SELECT era `using (false)`. Se sustituye por una que solo deja leer las
-- filas que la propia persona puede escribir (mismo predicado que INSERT/UPDATE/DELETE), de modo
-- que nadie ve fotos ajenas y la lectura para mostrarlas sigue yendo por URL firmada.
drop policy if exists avatars_privadas_denegar_select on storage.objects;
drop policy if exists avatars_privadas_select_propietario on storage.objects;
create policy avatars_privadas_select_propietario on storage.objects
  for select to authenticated
  using (
    bucket_id = 'avatars-privadas'
    and (public.avatars_path_escribible(name) or name = auth.uid()::text)
  );
