-- Community & Messaging OS — Realtime Broadcast-from-DB, pieza 2/2:
-- difunde posts nuevos del Feed por el canal `feed:{studio_id}`.
--
-- Depende de `posts_comunidad.studio_id` (ya existente en el esquema base,
-- 0000_base.sql) y convive con `posts_comunidad.audiencia`/`imagen_url`
-- (20260826100000_posts_comunidad_audiencia.sql) sin usarlas directamente:
-- este trigger no filtra por audiencia, ver comentario más abajo.
--
-- `realtime.send` (no `broadcast_changes`, porque no interesa difundir la
-- fila entera del post — solo un aviso ligero para que el cliente recargue
-- el feed) tiene 4 argumentos en este proyecto (verificado en `pg_proc`
-- antes de escribir esto): (payload jsonb, event text, topic text, private
-- boolean). `private = true` porque el canal exige autorización (misma
-- cerradura de RLS que mensajería).
create or replace function public.difundir_post_comunidad_nuevo()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
begin
  perform realtime.send(
    jsonb_build_object('postId', new.id),
    'post_nuevo',
    'feed:' || new.studio_id,
    true
  );
  return new;
end;
$$;

-- Mismo gotcha de grants que la pieza 1/2 — revoke explícito de los tres
-- roles de cliente, verificado con `has_function_privilege`.
revoke all on function public.difundir_post_comunidad_nuevo() from public, anon, authenticated;
revoke all on function public.difundir_post_comunidad_nuevo() from service_role;
grant execute on function public.difundir_post_comunidad_nuevo() to service_role;

create trigger trg_difundir_post_comunidad_nuevo
  after insert on public.posts_comunidad
  for each row execute function public.difundir_post_comunidad_nuevo();

-- El feed es studio-wide para el STAFF de ese estudio, y para cualquier
-- socia ACTIVA de ese estudio — sin distinguir por `audiencia` a propósito:
-- el broadcast solo avisa "hay un post nuevo, recarga", el filtrado real por
-- audiencia lo sigue haciendo la query de lectura de `posts_comunidad`, no
-- el canal de aviso. La cerradura de tenant real está aquí: una socia o
-- instructora de OTRO estudio no puede suscribirse al canal `feed:{id}`
-- ajeno (verificado en vivo con execute_sql+ROLLBACK).
create policy feed_broadcast_lectura on realtime.messages
  for select
  to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and (
      exists (
        select 1 from public.socios s
         where s.auth_user_id = (select auth.uid())
           and s.activo = true
           and s.studio_id = split_part(realtime.topic(), ':', 2)
      )
      or split_part(realtime.topic(), ':', 2) = public.current_studio_id()
    )
  );
