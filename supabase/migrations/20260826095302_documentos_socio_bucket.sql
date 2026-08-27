-- Buzón de documentos (Community & Messaging OS, P2) — bucket PRIVADO.
--
-- Clon del patrón de `red-documentos-identidad` (20260813222528), NO del de
-- `comunidad-media` (público): aquí el documento es de negocio/dinero
-- (contrato, factura), nunca debe quedar accesible sin control.
--
-- Carpeta por estudio: "<studio_id>/<archivo>" — igual que
-- `avatars_valida_path_por_estudio`, no por auth.uid() (aquí sube el
-- STAFF, no la dueña del documento).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documentos-socio',
  'documentos-socio',
  false,
  10485760, -- 10 MB
  array['application/pdf', 'image/png', 'image/jpeg']
)
on conflict (id) do nothing;

-- INSERT: solo quien puede gestionar clientas, y solo en la carpeta de SU
-- propio estudio — evita que el staff de un estudio escriba en la carpeta de
-- otro con un path falsificado desde el cliente.
create policy documentos_socio_bucket_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documentos-socio'
    and public.puede_gestionar_clientas()
    and (storage.foldername(name))[1] = public.current_studio_id()
  );

-- Deliberadamente SIN ninguna policy de SELECT/UPDATE/DELETE, ni para
-- `authenticated` ni para `anon`: ni siquiera el staff lee directo del
-- bucket. Toda lectura (staff o socia) pasa por una API route con
-- service_role que primero comprueba `documentos_socio.borrado_en` y
-- `caduca_en` en la tabla, y solo entonces genera una URL firmada — así la
-- caducidad/soft-delete de la tabla se puede hacer valer siempre, cosa que
-- una policy de storage no puede mirar sin duplicar esa lógica ahí.
create policy documentos_socio_bucket_service_role_todo on storage.objects
  for all to service_role
  using (bucket_id = 'documentos-socio')
  with check (bucket_id = 'documentos-socio');
