-- Tentare Network, Fase 2 — bucket PRIVADO nuevo (primer precedente de
-- bucket privado en este repo; el único existente, `avatars`, es público).
-- Documentos de identidad (DNI/pasaporte) y certificaciones subidos por la
-- profesional durante el wizard.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'red-documentos-identidad',
  'red-documentos-identidad',
  false,
  10485760, -- 10 MB
  array['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
)
on conflict (id) do nothing;

-- INSERT: el dueño sube a su PROPIA carpeta, prefijo auth.uid() — path del
-- tipo "<auth_user_id>/identidad-<...>" o "<auth_user_id>/certificacion-<...>".
-- Deliberadamente NO atado a perfil_id/red_perfiles: así el documento se
-- puede subir ANTES de crear la fila de verificación/certificación que lo
-- referencia (documento_path), sin depender del orden de escritura.
create policy red_documentos_identidad_insert_propio on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'red-documentos-identidad'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Deliberadamente SIN policy de SELECT/UPDATE/DELETE para anon ni
-- authenticated: la propia usuaria nunca vuelve a leer su documento desde
-- el bucket (ya lo tiene localmente al subirlo). Solo Tentare Interno lo
-- lee, server-side, con service_role (getSupabaseAdmin(), URLs firmadas —
-- construido en Fase 3). service_role bypasea RLS de Storage por diseño,
-- pero se deja una policy explícita para no depender de esa asunción
-- implícita si algún día cambia.
create policy red_documentos_identidad_service_role_todo on storage.objects
  for all to service_role
  using (bucket_id = 'red-documentos-identidad')
  with check (bucket_id = 'red-documentos-identidad');
