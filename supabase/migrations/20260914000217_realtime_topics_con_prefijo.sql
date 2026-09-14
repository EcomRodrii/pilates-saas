-- Realtime: cada política de `realtime.messages` autoriza SU prefijo de topic.
--
-- ANTES:
--   · `feed_broadcast_lectura` autorizaba cualquier topic cuyo SEGUNDO trozo
--     fuera un estudio del usuario, sin mirar el primero. La usaban `feed:` y
--     `creditos:` (este último sin política propia), pero abría también
--     cualquier topic privado futuro de la forma `<lo_que_sea>:<studio_id>`.
--   · `mensajeria_broadcast_lectura`, igual con el id de conversación.
-- Ensayado en producción: el personal de un estudio real podía suscribirse a
-- `notificaciones:<su estudio>` y a `otro:<id de una conversación suya>`,
-- topics que nadie emite hoy.
--
-- Topics que emite la base hoy (leído de `pg_proc`, no del repo):
--   conversacion:<conversacion_id>  difundir_mensaje_nuevo
--   feed:<studio_id>                difundir_post_comunidad_nuevo
--   aforo:<studio_id>               difundir_cambio_aforo  (políticas propias, sin cambios)
--   creditos:<studio_id>            difundir_cambio_creditos
--
-- DESPUÉS: mismas audiencias que antes, pero cada política exige su prefijo y
-- un topic de exactamente dos trozos. `aforo_*` ya lo exigía y no se toca.
-- Un canal nuevo necesita su prefijo aquí, a propósito.

drop policy if exists feed_broadcast_lectura on realtime.messages;
create policy feed_broadcast_lectura on realtime.messages
  for select
  to authenticated
  using (
    extension = 'broadcast'
    and split_part(realtime.topic(), ':', 1) in ('feed', 'creditos')
    and split_part(realtime.topic(), ':', 3) = ''
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

drop policy if exists mensajeria_broadcast_lectura on realtime.messages;
create policy mensajeria_broadcast_lectura on realtime.messages
  for select
  to authenticated
  using (
    extension = 'broadcast'
    and split_part(realtime.topic(), ':', 1) = 'conversacion'
    and split_part(realtime.topic(), ':', 3) = ''
    and exists (
      select 1 from public.conversaciones c
       where c.id = split_part(realtime.topic(), ':', 2)
         and (
           (c.tipo = 'EQUIPO' and c.studio_id = public.current_studio_id())
           or (c.tipo = 'ALUMNA_MOSTRADOR' and c.studio_id = public.current_studio_id() and public.puede_gestionar_calendario())
           or public.es_participante_conversacion(c.id)
         )
    )
  );
