-- RLS-1: Fotos de perfil de personas en bucket privado con acceso por URLs firmadas.
--
-- El bucket `avatars` es público y se accede SIN RLS (getPublicUrl devuelve URL
-- que cualquiera puede abrir). Los paths son predecibles (socios.id, instructor-<id>).
-- Migración a bucket privado + signed URLs (60s expiración).
--
-- Bucket público `avatars` conserva: logo, favicon, foto de clase, banner, producto.
-- Bucket privado `avatars-privadas` NUEVO: socias, instructoras, network profiles.
--
-- En BD: foto_url guardará SOLO el path (ej. "soc-abc123"), NO la URL pública.
-- Servidor genera URL firmada on-demand vía /api/foto/signed-url.

-- 1. Crear bucket privado
insert into storage.buckets (id, name, public, owner)
  values ('avatars-privadas', 'avatars-privadas', false, auth.uid())
  on conflict (id) do nothing;

-- 2. RLS: permítir a cualquier autenticado generar URLs firmadas (server-side endpoint)
-- La lectura se controla vía /api/foto/signed-url, no vía Storage.
-- Storage.objects no tiene política de SELECT (nadie puede listar/descargar directo).
create policy avatars_privadas_denegar_select on storage.objects
  for select to authenticated
  using (false);  -- sin acceso directo

create policy avatars_privadas_insert_autorizado on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars-privadas'
    and (
      -- Socia propia
      name = auth.uid()
      -- O instructor/propietaria de otro estudio (editando en panel)
      or name like 'instructor-%'
      or name like 'network-%'
    )
  );

create policy avatars_privadas_update_autorizado on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars-privadas')
  with check (bucket_id = 'avatars-privadas');

create policy avatars_privadas_delete_autorizado on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars-privadas');

-- 3. Helper: generar URL firmada (usado por /api/foto/signed-url)
create or replace function public.generar_url_foto_firmada(
  p_path text,
  p_duracion_segundos int default 3600
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_signed_url text;
begin
  -- Esta función será llamada por service_role desde un endpoint /api/foto/signed-url
  -- después de verificar permisos. No expone directamente la lógica de creación de URLs.
  -- El lado servidor (Node.js) crea la URL con getSupabaseAdmin().storage.from('avatars-privadas').createSignedUrl()
  return null;  -- placeholder; la lógica real en TypeScript
end;
$function$;

comment on function public.generar_url_foto_firmada(text, int) is
  'Placeholder: lógica real en /api/foto/signed-url (Node.js con Supabase admin SDK)';
