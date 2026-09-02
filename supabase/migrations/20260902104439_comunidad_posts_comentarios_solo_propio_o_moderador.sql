-- F-18 (auditoría 20ª pasada, 1-sep-2026): `admin_posts_comunidad` y
-- `admin_comentarios_comunidad` eran `FOR ALL` con el único predicado
-- `studio_id = current_studio_id()`, sin comprobación de rol ni de autoría —
-- CUALQUIER staff autenticado del estudio (instructora incluida) podía
-- editar/fijar/borrar el post o comentario de CUALQUIER otro. `admin_novedades_estudio`
-- (26-ago) sí exige rol; comunidad se quedó atrás.
--
-- Verificado en producción con impersonación ANTES de aplicar (transacción con
-- ROLLBACK): la instructora 5b75084f-1328-4fd0-a724-6c29210149d9 pudo editar
-- texto/fijado de un post ajeno y BORRAR el post-4 (de otro autor). Tras el
-- fix: la misma instructora queda a 0 filas tocadas sobre lo ajeno, pero sigue
-- pudiendo editar lo suyo y leer el feed entero (9 posts). La propietaria
-- (current_rol() = PROPIETARIO) sigue pudiendo moderar cualquier post.
--
-- Causa raíz igual que sesiones/reservas (20260730012600) y valoraciones
-- (20260901135856, F-9): una sola policy FOR ALL sin distinguir fila ni rol.
-- Mismo modelo que allí: PROPIETARIO/MANAGER/RECEPCION mantienen control
-- total (moderación); el resto del staff solo lo suyo.
--
-- No se toca SELECT: la lectura del feed/hilo de comentarios tiene que seguir
-- siendo del estudio entero para cualquier rol (así lee el panel hoy,
-- `fetchCriticalStudioData` con la clave de usuario cuando no hay
-- service-role, p.ej. en el navegador) — solo se reparte INSERT/UPDATE/DELETE.
--
-- INSERT gana `autor_id = auth.uid()::text`: cierra en la RLS el hueco que
-- señalaba también F-18 ("escribir autor_id/autor_nombre a mano") — hoy el
-- único INSERT alcanzable pasa por /api/comunidad/posts y
-- /api/comunidad/comentarios (service-role, autor ya viene del JWT), pero
-- `dbInsertPostComunidad` (F-27) es código muerto con la misma forma que, si
-- se recablea sin mirar esto, dejaría suplantar autoría — la cerradura real
-- va en la BD, no en que hoy nadie llame a esa función.
--
-- Grants: ambas tablas daban GRANT ALL A anon (0000_base/0012), sin ninguna
-- policy que lo aproveche — fail-closed hoy (42501), mismo desajuste
-- policy↔grant que ya documenta 20260901135856. Se revoca por el mismo
-- motivo: que alguien conceda una policy a anon en el futuro no debe abrir
-- escritura/lectura cross-tenant de golpe.

drop policy admin_posts_comunidad on public.posts_comunidad;

create policy posts_comunidad_lectura on public.posts_comunidad
  for select to authenticated
  using (studio_id = public.current_studio_id());

create policy posts_comunidad_insertar_propio on public.posts_comunidad
  for insert to authenticated
  with check (studio_id = public.current_studio_id() and autor_id = auth.uid()::text);

create policy posts_comunidad_editar on public.posts_comunidad
  for update to authenticated
  using (studio_id = public.current_studio_id()
         and (autor_id = auth.uid()::text or public.current_rol() in ('PROPIETARIO','MANAGER','RECEPCION')))
  with check (studio_id = public.current_studio_id()
              and (autor_id = auth.uid()::text or public.current_rol() in ('PROPIETARIO','MANAGER','RECEPCION')));

create policy posts_comunidad_borrar on public.posts_comunidad
  for delete to authenticated
  using (studio_id = public.current_studio_id()
         and (autor_id = auth.uid()::text or public.current_rol() in ('PROPIETARIO','MANAGER','RECEPCION')));

drop policy admin_comentarios_comunidad on public.comentarios_comunidad;

create policy comentarios_comunidad_lectura on public.comentarios_comunidad
  for select to authenticated
  using (studio_id = public.current_studio_id());

create policy comentarios_comunidad_insertar_propio on public.comentarios_comunidad
  for insert to authenticated
  with check (studio_id = public.current_studio_id() and autor_id = auth.uid()::text);

create policy comentarios_comunidad_editar on public.comentarios_comunidad
  for update to authenticated
  using (studio_id = public.current_studio_id()
         and (autor_id = auth.uid()::text or public.current_rol() in ('PROPIETARIO','MANAGER','RECEPCION')))
  with check (studio_id = public.current_studio_id()
              and (autor_id = auth.uid()::text or public.current_rol() in ('PROPIETARIO','MANAGER','RECEPCION')));

create policy comentarios_comunidad_borrar on public.comentarios_comunidad
  for delete to authenticated
  using (studio_id = public.current_studio_id()
         and (autor_id = auth.uid()::text or public.current_rol() in ('PROPIETARIO','MANAGER','RECEPCION')));

revoke all on table public.posts_comunidad from anon;
revoke all on table public.comentarios_comunidad from anon;

comment on policy posts_comunidad_editar on public.posts_comunidad is
  'F-18: solo el autor o PROPIETARIO/MANAGER/RECEPCION pueden editar/fijar un post ajeno. Auditoría 20ª pasada, 1-sep-2026.';
comment on policy comentarios_comunidad_editar on public.comentarios_comunidad is
  'F-18: mismo criterio que posts_comunidad_editar.';
