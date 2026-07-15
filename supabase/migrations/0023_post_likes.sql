-- ═══════════════════════════════════════════════════════════════════════════
-- 0023 · Likes idempotentes en Comunidad (post_likes) — arregla el contador que
--        se infla
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️  Cambia el ESQUEMA de producción (tabla + RPCs nuevas) y RESETEA el contador
--     `posts_comunidad.likes` al valor real. Señalado antes de aplicar.
--
-- PROBLEMA
-- Un "like" era un contador entero anónimo en la fila del post; toggleLikePost
-- hacía `likes + 1` incondicional (sin registro de quién ni idempotencia, no
-- alternaba), y escribía un valor absoluto no atómico. Cada click sumaba; en
-- prod hay posts con 20 likes falsos. La comunidad es solo staff (dashboard), así
-- que el actor es siempre un usuario autenticado (auth.uid()).
--
-- FIX
--   · Tabla post_likes con PK (post_id, user_id) → un like por usuario y post.
--   · toggle_like_post: RPC atómica e idempotente (inserta/borra el like del
--     usuario actual y recomputa likes = count(*) real). Aislada por estudio.
--   · mis_likes_comunidad: los post_id que el usuario actual ya ha likeado (para
--     pintar el estado "me gusta").
--   · RLS + revoke a anon/PUBLIC (lección Fase 0: no exponer RPCs SECURITY
--     DEFINER al rol anónimo).
--   · Reset de posts_comunidad.likes al conteo real (0 de inicio, ya que la tabla
--     nace vacía) — los valores antiguos eran basura.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.post_likes (
  post_id   text not null references public.posts_comunidad(id) on delete cascade,
  user_id   uuid not null,
  studio_id text not null references public.studios(id) on delete cascade,
  creado_en timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index if not exists idx_post_likes_post on public.post_likes(post_id);

alter table public.post_likes enable row level security;

-- Cada usuaria gestiona SUS likes, aislado por estudio. (SELECT del propio
-- estudio para poder contar; INSERT/DELETE solo de filas propias.)
drop policy if exists post_likes_select on public.post_likes;
create policy post_likes_select on public.post_likes
  for select to authenticated
  using (studio_id = public.current_studio_id());

drop policy if exists post_likes_write on public.post_likes;
create policy post_likes_write on public.post_likes
  for all to authenticated
  using (user_id = auth.uid() and studio_id = public.current_studio_id())
  with check (user_id = auth.uid() and studio_id = public.current_studio_id());

-- ── RPC: alterna el like del usuario actual, devuelve (liked, likes real) ─────
create or replace function public.toggle_like_post(p_post_id text, p_studio_id text)
returns table(liked boolean, likes integer)
language plpgsql security definer
set search_path = ''
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'NO_AUTH'; end if;
  -- Aislamiento por estudio en llamadas autenticadas (staff). La service-role
  -- (auth.uid() NULL) no llega aquí porque exigimos v_uid.
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

-- ── RPC: post_ids que el usuario actual ha likeado ───────────────────────────
create or replace function public.mis_likes_comunidad()
returns setof text
language sql stable security definer
set search_path = ''
as $$
  select l.post_id from public.post_likes l where l.user_id = auth.uid();
$$;

-- ── Cierre de acceso (defensa en profundidad, como en 0004/0021) ─────────────
revoke execute on function public.toggle_like_post(text, text) from public, anon;
grant  execute on function public.toggle_like_post(text, text) to authenticated, service_role;
revoke execute on function public.mis_likes_comunidad() from public, anon;
grant  execute on function public.mis_likes_comunidad() to authenticated, service_role;

-- ── Reset del contador inflado al valor real (tabla nace vacía → 0) ───────────
update public.posts_comunidad p
  set likes = (select count(*) from public.post_likes l where l.post_id = p.id);
