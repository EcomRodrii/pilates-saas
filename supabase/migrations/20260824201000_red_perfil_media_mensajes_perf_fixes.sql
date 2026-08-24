-- Tentare Network F1 — dos hallazgos reales de get_advisors sobre migraciones
-- de esta misma tanda (red_perfil_media, red_mensajes), corregidos antes de
-- cerrar F1 (mismo criterio que F0).
--
-- 1) red_perfil_media: `red_perfil_media_select_publicado` +
--    `red_perfil_media_todo_propio` (FOR ALL, que incluye SELECT) generaban
--    dos políticas permisivas para authenticated/SELECT — advisor
--    multiple_permissive_policies. Se funde en UNA sola política de SELECT
--    (dueña OR publicado), mismo patrón que red_experiencias_select
--    (20260813111206), y se separan INSERT/UPDATE/DELETE "propio" en vez de
--    FOR ALL.
--
-- 2) red_mensajes: al reescribir red_mensajes_select/red_mensajes_insert
--    para admitir 'pendiente' se copió `auth.uid()` a secas de la política
--    original (que ya lo tenía así) — advisor auth_rls_initplan. Como esta
--    migración ya las toca, se corrige aquí a (select auth.uid()) en vez de
--    dejarlo para una migración futura.

drop policy red_perfil_media_select_publicado on public.red_perfil_media;
drop policy red_perfil_media_todo_propio on public.red_perfil_media;

create policy red_perfil_media_select on public.red_perfil_media
  for select to authenticated
  using (
    exists (
      select 1 from public.red_perfiles rp
      where rp.id = red_perfil_media.perfil_id
        and (rp.auth_user_id = (select auth.uid()) or rp.estado = 'published')
    )
  );

create policy red_perfil_media_insert_propio on public.red_perfil_media
  for insert to authenticated
  with check (
    exists (
      select 1 from public.red_perfiles rp
      where rp.id = red_perfil_media.perfil_id and rp.auth_user_id = (select auth.uid())
    )
  );

create policy red_perfil_media_update_propio on public.red_perfil_media
  for update to authenticated
  using (
    exists (
      select 1 from public.red_perfiles rp
      where rp.id = red_perfil_media.perfil_id and rp.auth_user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.red_perfiles rp
      where rp.id = red_perfil_media.perfil_id and rp.auth_user_id = (select auth.uid())
    )
  );

create policy red_perfil_media_delete_propio on public.red_perfil_media
  for delete to authenticated
  using (
    exists (
      select 1 from public.red_perfiles rp
      where rp.id = red_perfil_media.perfil_id and rp.auth_user_id = (select auth.uid())
    )
  );

drop policy red_mensajes_select on public.red_mensajes;
drop policy red_mensajes_insert on public.red_mensajes;

create policy red_mensajes_select on public.red_mensajes
  for select to authenticated
  using (
    exists (
      select 1 from public.red_solicitudes_contacto sc
      where sc.id = red_mensajes.solicitud_id
        and sc.estado in ('pendiente', 'aceptada')
        and (
          sc.studio_id = public.current_studio_id()
          or exists (select 1 from public.red_perfiles rp where rp.id = sc.perfil_id and rp.auth_user_id = (select auth.uid()))
        )
    )
  );

create policy red_mensajes_insert on public.red_mensajes
  for insert to authenticated
  with check (
    remitente = (select auth.uid())
    and exists (
      select 1 from public.red_solicitudes_contacto sc
      where sc.id = red_mensajes.solicitud_id
        and sc.estado in ('pendiente', 'aceptada')
        and (
          sc.studio_id = public.current_studio_id()
          or exists (select 1 from public.red_perfiles rp where rp.id = sc.perfil_id and rp.auth_user_id = (select auth.uid()))
        )
    )
  );
