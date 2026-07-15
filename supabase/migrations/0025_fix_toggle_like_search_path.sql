-- ═══════════════════════════════════════════════════════════════════════════
-- 0025 · HOTFIX · toggle_like_post fallaba con 42P01 "relation instructores
--        does not exist"
-- ═══════════════════════════════════════════════════════════════════════════
--
-- CAUSA RAÍZ
-- 0023 definió toggle_like_post con `set search_path = ''` (hardening) y dentro
-- llama a `public.current_studio_id()`. Esa función (0000_base) NO fija su propio
-- search_path y usa `instructores`/`studios` SIN cualificar; al ejecutarse
-- heredando el search_path vacío del llamador, esas tablas no resuelven → 42P01.
-- El dar "me gusta" en Comunidad reventaba (confirmado en Sentry, 5 usuarias).
--
-- FIX
-- Recrear la función con `set search_path = public` (path FIJO, sigue
-- satisfaciendo el advisor de "search_path mutable"), para que la llamada anidada
-- a current_studio_id resuelva sus tablas. Todo lo demás sigue cualificado.
-- (mis_likes_comunidad NO llama a current_studio_id y funciona con '', se deja.)
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.toggle_like_post(p_post_id text, p_studio_id text)
returns table(liked boolean, likes integer)
language plpgsql security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'NO_AUTH'; end if;
  if p_studio_id is distinct from public.current_studio_id() then
    raise exception 'STUDIO_MISMATCH';
  end if;

  if exists (select 1 from public.post_likes l where l.post_id = p_post_id and l.user_id = v_uid) then
    delete from public.post_likes l where l.post_id = p_post_id and l.user_id = v_uid;
    liked := false;
  else
    insert into public.post_likes (post_id, user_id, studio_id)
      values (p_post_id, v_uid, p_studio_id)
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
