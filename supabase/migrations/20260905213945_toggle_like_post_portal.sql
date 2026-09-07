-- Abre "me gusta" a la SOCIA desde el portal — hasta ahora el corazón del
-- tablón era de solo lectura ahí (comentario explícito en
-- components/student/domain/PostCard.tsx: "no hay ruta pública para darlos,
-- y pintar un corazón que no guarda nada sería un control muerto"). Pedido
-- expresamente por el usuario tras verlo en producción.
--
-- No se reutiliza `toggle_like_post` (0023): esa función usa
-- `current_studio_id()`, que solo resuelve identidad de STAFF (tabla
-- `instructores`) — para una socia devuelve NULL y la función siempre
-- lanzaría STUDIO_MISMATCH. La socia tampoco llega a `auth.uid()` en RLS
-- normal (su sesión no tiene JWT `authenticated` de Postgres, mismo motivo
-- documentado en todas las rutas /api/public/*) — así que esta función es
-- SECURITY DEFINER, solo invocable por service-role, y recibe el
-- auth_user_id ya resuelto y verificado en la API route (verificarUsuarioSupabase
-- + socioAutenticado), nunca de un valor que el cliente pueda falsear.
--
-- Reutiliza la MISMA tabla `post_likes` (0023) que ya usa el staff: un like
-- es un like sea cual sea el rol de quien lo da, la PK (post_id, user_id) ya
-- lo hace idempotente sin importar de qué tabla de identidad salga el uuid.
--
-- Verificado en vivo contra producción (execute_sql + ROLLBACK) antes de
-- aplicar: toggle da like → toggle quita el like, contador exacto en ambos
-- pasos; un post_id de otro estudio lanza POST_NOT_FOUND.
create or replace function public.toggle_like_post_portal(p_post_id text, p_studio_id text, p_auth_user_id uuid)
returns table(liked boolean, likes integer)
language plpgsql security definer
set search_path = ''
as $$
begin
  if p_auth_user_id is null then raise exception 'NO_AUTH'; end if;
  if not exists (select 1 from public.posts_comunidad p where p.id = p_post_id and p.studio_id = p_studio_id) then
    raise exception 'POST_NOT_FOUND';
  end if;

  if exists (select 1 from public.post_likes l where l.post_id = p_post_id and l.user_id = p_auth_user_id) then
    delete from public.post_likes l where l.post_id = p_post_id and l.user_id = p_auth_user_id;
    liked := false;
  else
    insert into public.post_likes (post_id, user_id, studio_id)
      values (p_post_id, p_auth_user_id, p_studio_id)
      on conflict (post_id, user_id) do nothing;
    liked := true;
  end if;

  update public.posts_comunidad p
    set likes = (select count(*) from public.post_likes l where l.post_id = p_post_id)
    where p.id = p_post_id and p.studio_id = p_studio_id
    returning p.likes into likes;

  return next;
end;
$$;

-- Mismo gotcha de grants ya documentado varias veces en este repo: una
-- función con firma nueva nace con EXECUTE a PUBLIC por defecto.
revoke execute on function public.toggle_like_post_portal(text, text, uuid) from public, anon, authenticated;
grant execute on function public.toggle_like_post_portal(text, text, uuid) to service_role;
