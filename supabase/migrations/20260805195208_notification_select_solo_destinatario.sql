-- El SELECT de `notification` seguía siendo de estudio entero: cualquier staff
-- con su clave anon podía leer por PostgREST el título y el CUERPO de TODOS los
-- avisos del estudio —los de la propietaria y los de todas las socias— sin pasar
-- por ninguna pantalla. La instructora incluida.
--
-- La migración que arregló el UPDATE (`notification_update_solo_destinatario`,
-- aplicada como 20260729172349) dejó escrito que el SELECT amplio "sí es
-- intencional, no se toca", asumiendo que la vista admin del estudio
-- (Notification Center) lo necesitaba. Comprobado ahora: NO lo necesita, y
-- nadie más tampoco. Los TRES caminos que leen o escriben esta tabla usan
-- service-role (`getSupabaseAdmin()`), que se salta la RLS entera:
--   - app/api/notifications        (la campana de cada cual, ya acotada por
--                                   recipient_user_id)
--   - app/api/notifications/admin  (la vista agregada; su cerradura es el rol
--                                   comprobado en la route, no esta policy)
--   - lib/notifications/engine.ts  (recibe el cliente por parámetro; su único
--                                   llamador es la route de arriba)
-- Es decir: esta política no tenía un solo consumidor legítimo. Era superficie
-- de ataque y nada más. Se queda igual que el UPDATE — cada quien, lo suyo.
--
-- De paso se REAFIRMA el rol de `notification_update`: aquella migración hizo
-- drop + create sin cláusula `TO`, así que Postgres la dejó sobre `public` y no
-- sobre `authenticated` como la creó la 0092. Hoy no es explotable porque `anon`
-- no tiene ningún GRANT sobre la tabla, pero la política dependía de ese GRANT
-- ausente en vez de decir por sí misma a quién aplica. Verificado contra prod
-- antes de escribir esto (pg_policies + has_table_privilege).
--
-- `(select auth.uid())` y no `auth.uid()` a secas: es la optimización
-- auth_rls_initplan (se evalúa una vez, no por fila). El SELECT ya la tenía en
-- prod aunque el fichero de la 0092 no la escribiera; el UPDATE no, y aquí se
-- iguala.
--
-- ⚠️ Efecto sobre filas con `recipient_user_id IS NULL`: quedan invisibles para
-- `authenticated`. Es lo correcto, no un daño colateral — esa fila existe como
-- ANCLA del envío por email/SMS a una socia sin cuenta (ver comentario de la
-- 0092), no para que nadie la lea in-app, y quien sí la necesita (el motor de
-- envío y el historial) va por service-role. Hoy hay 0 filas así en prod, pero
-- la columna sigue siendo nullable a propósito, así que esto es una decisión,
-- no una casualidad del dato actual.

drop policy if exists notification_select on public.notification;
create policy notification_select on public.notification
  for select to authenticated
  using (recipient_user_id = (select auth.uid()));

drop policy if exists notification_update on public.notification;
create policy notification_update on public.notification
  for update to authenticated
  using (recipient_user_id = (select auth.uid()))
  with check (recipient_user_id = (select auth.uid()));
