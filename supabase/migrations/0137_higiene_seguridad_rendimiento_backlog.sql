-- Higiene de seguridad/rendimiento del backlog priorizado (Tier 0/Tier 2),
-- 3 arreglos independientes y mecánicos, sin cambios de app:

-- 1) `slug_estudio_disponible()` volvió a ser ejecutable por `anon`. La 0054
-- ya la había dejado solo para `authenticated` (el alta real de estudio pasa
-- por dbCreateStudio, que exige sesión ya iniciada por magic link ANTES de
-- llegar aquí — ver app/crear-estudio/page.tsx). La 0119 (slugs antiguos) la
-- reescribió con `create or replace function` y volvió a conceder a
-- `anon, authenticated` sin darse cuenta de que pisaba el revoke de la 0054.
-- No confundir con `studio_id_por_slug()` (0054), esa SÍ necesita `anon` de
-- verdad: resuelve el slug público de /portal y /reservar antes de login.
revoke execute on function public.slug_estudio_disponible(text) from anon;

-- 2) La extensión `btree_gist` vivía en `public` (la usan las EXCLUDE
-- constraint de sesiones_instructor_sin_solape/sesiones_sala_sin_solape,
-- migr 0048/0074) — moverla de esquema no toca esas constraints (Postgres
-- las resuelve por OID de la clase de operadores, no por nombre).
alter extension btree_gist set schema extensions;

-- 3) Las 4 políticas de notificaciones que quedaban sin envolver auth.uid()/
-- current_studio_id() en subconsulta (initplan) — mismo patrón que la 0069
-- (rls_auth_initplan_fix), que dejó estas 4 fuera por llegar de una migración
-- posterior (notification_engine).
drop policy if exists notification_select on public.notification;
create policy notification_select on public.notification
  for select to authenticated
  using (recipient_user_id = (select auth.uid()) or studio_id = (select public.current_studio_id()));

drop policy if exists notification_update on public.notification;
create policy notification_update on public.notification
  for update to authenticated
  using (recipient_user_id = (select auth.uid()) or studio_id = (select public.current_studio_id()))
  with check (recipient_user_id = (select auth.uid()) or studio_id = (select public.current_studio_id()));

drop policy if exists preference_all on public.notification_preference;
create policy preference_all on public.notification_preference
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists push_all on public.push_subscription;
create policy push_all on public.push_subscription
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
