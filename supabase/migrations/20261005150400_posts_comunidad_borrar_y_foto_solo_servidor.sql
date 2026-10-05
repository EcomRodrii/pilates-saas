-- ─────────────────────────────────────────────────────────────────────────────
-- Borrar una publicación del tablón borra su foto del bucket público, y el
-- navegador ya no puede saltárselo.
--
-- `comunidad-media` es público (SEC-05): la foto se sirve a quien tenga la URL.
-- El panel borraba la fila por RLS desde el navegador
-- (`posts_comunidad_borrar`) y la foto se quedaba en el bucket para siempre. El
-- borrado pasa a `DELETE /api/comunidad/posts/[id]` (service-role), que quita
-- primero la foto y después la fila.
--
--   · Fuera el DELETE de `posts_comunidad` para el navegador, y su política.
--   · `imagen_url` decide qué objeto se borra: el navegador no puede reescribirla
--     (ni `autor_id`, que decide quién puede borrar). REVOKE de tabla y luego
--     GRANT por columnas: un REVOKE de columna no resta de un GRANT de tabla.
--     Son las columnas que escribe `dbUpdatePostComunidad` (lib/supabase-data.ts):
--     editar, fijar, audiencia y evento. `likes` y `comentarios_count` se quedan
--     porque esa función todavía los acepta; los mueven las RPC.
--
-- ⚠️ Va DESPUÉS de desplegar el código: un panel con el bundle anterior (la PWA
-- del iPad) borra por RLS. Con esto aplicado, ese camino falla a la vista (42501:
-- el post vuelve a su sitio y sale el aviso) en vez de dejar la foto huérfana. Se
-- puede repetir.
-- ─────────────────────────────────────────────────────────────────────────────

revoke delete on table public.posts_comunidad from authenticated;
drop policy if exists posts_comunidad_borrar on public.posts_comunidad;

revoke update on table public.posts_comunidad from authenticated;
grant update (texto, likes, comentarios_count, fijado, audiencia, tipo, evento_fecha, evento_aforo, evento_lugar)
  on table public.posts_comunidad to authenticated;

do $$
begin
  if has_table_privilege('authenticated', 'public.posts_comunidad', 'DELETE')
     or has_table_privilege('authenticated', 'public.posts_comunidad', 'UPDATE')
     or has_column_privilege('authenticated', 'public.posts_comunidad', 'imagen_url', 'UPDATE')
     or has_column_privilege('authenticated', 'public.posts_comunidad', 'autor_id', 'UPDATE')
     or has_column_privilege('authenticated', 'public.posts_comunidad', 'studio_id', 'UPDATE')
     or has_column_privilege('authenticated', 'public.posts_comunidad', 'id', 'UPDATE') then
    raise exception 'posts_comunidad: el navegador sigue pudiendo borrar o reescribir la foto';
  end if;
  if exists (select 1 from pg_policy p where p.polrelid = 'public.posts_comunidad'::regclass
              and p.polname = 'posts_comunidad_borrar') then
    raise exception 'posts_comunidad: sigue la política de borrar';
  end if;
  -- Lo que el panel sigue escribiendo con su sesión.
  if not has_column_privilege('authenticated', 'public.posts_comunidad', 'fijado', 'UPDATE')
     or not has_column_privilege('authenticated', 'public.posts_comunidad', 'texto', 'UPDATE')
     or not has_column_privilege('authenticated', 'public.posts_comunidad', 'evento_fecha', 'UPDATE')
     or not has_table_privilege('authenticated', 'public.posts_comunidad', 'SELECT') then
    raise exception 'posts_comunidad: el panel ha perdido editar o fijar';
  end if;
end $$;
