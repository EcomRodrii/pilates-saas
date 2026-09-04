-- Auditoría 22ª pasada (3-sep-2026), S-6.
-- Dos policies `for select to anon using (true)` SIN filtro por estudio sobre
-- tablas de tenant. Hoy son letra muerta —`anon` no tiene el GRANT de tabla ni
-- de columna, comprobado con has_table_privilege y con `set local role anon`
-- (42501)—, pero basta que alguien pulse "enable read access" en el panel de
-- Supabase para exponer el contenido y los banners de TODOS los estudios a
-- internet. La lectura pública real va por service-role
-- (`/api/public/studio-data`), que no pasa por RLS, así que esto no lo usa
-- nadie. Las policies de staff (`admin_contenido_portal*`) no se tocan.
drop policy if exists public_read_contenido_portal on public.contenido_portal;
drop policy if exists public_read_contenido_portal_banners on public.contenido_portal_banners;
