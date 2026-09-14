-- La propietaria puede LEER las conversaciones instructora–alumna de su estudio
-- (decisión del fundador, 14-sep-2026). Solo lectura: no se toca
-- `mensajes_escritura` ni las políticas de UPDATE de leído, así que no puede
-- escribir ni marcar leído en nombre de nadie.
--
-- «Propietaria» = `current_rol() = 'PROPIETARIO'` en la sede activa, el mismo
-- criterio que el resto de la RLS (incluye copropietarias). Gerencia y
-- recepción no ganan nada.
--
-- Se lanza a la vez que el aviso fijo en el chat para la alumna y la
-- instructora («El estudio también puede leer esta conversación»).
--
-- Una rama más DENTRO de cada política de lectura, no una segunda política
-- permisiva (dispararía `multiple_permissive_policies`). Las ramas existentes
-- quedan idénticas. Sin funciones nuevas: no aplica el paso de grants.

drop policy if exists conversaciones_lectura on public.conversaciones;
create policy conversaciones_lectura on public.conversaciones
  for select to authenticated
  using (
    (tipo = 'EQUIPO' and studio_id = public.current_studio_id())
    or (tipo = 'ALUMNA_MOSTRADOR' and studio_id = public.current_studio_id() and public.puede_gestionar_calendario())
    or (tipo = 'ALUMNA_INSTRUCTORA' and studio_id = (select public.current_studio_id()) and (select public.current_rol()) = 'PROPIETARIO')
    or public.es_participante_conversacion(id)
  );

drop policy if exists conversacion_participantes_lectura on public.conversacion_participantes;
create policy conversacion_participantes_lectura on public.conversacion_participantes
  for select to authenticated
  using (
    exists (
      select 1 from public.conversaciones c
       where c.id = conversacion_participantes.conversacion_id
         and (
           (c.tipo = 'EQUIPO' and c.studio_id = public.current_studio_id())
           or (c.tipo = 'ALUMNA_MOSTRADOR' and c.studio_id = public.current_studio_id() and public.puede_gestionar_calendario())
           or (c.tipo = 'ALUMNA_INSTRUCTORA' and c.studio_id = (select public.current_studio_id()) and (select public.current_rol()) = 'PROPIETARIO')
           or public.es_participante_conversacion(c.id)
         )
    )
  );

drop policy if exists mensajes_lectura on public.mensajes;
create policy mensajes_lectura on public.mensajes
  for select to authenticated
  using (
    exists (
      select 1 from public.conversaciones c
       where c.id = mensajes.conversacion_id
         and c.studio_id = mensajes.studio_id
         and (
           (c.tipo = 'EQUIPO' and c.studio_id = public.current_studio_id())
           or (c.tipo = 'ALUMNA_MOSTRADOR' and c.studio_id = public.current_studio_id() and public.puede_gestionar_calendario())
           or (c.tipo = 'ALUMNA_INSTRUCTORA' and c.studio_id = (select public.current_studio_id()) and (select public.current_rol()) = 'PROPIETARIO')
           or public.es_participante_conversacion(c.id)
         )
    )
  );

drop policy if exists mensajeria_broadcast_lectura on realtime.messages;
create policy mensajeria_broadcast_lectura on realtime.messages
  for select to authenticated
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
           or (c.tipo = 'ALUMNA_INSTRUCTORA' and c.studio_id = (select public.current_studio_id()) and (select public.current_rol()) = 'PROPIETARIO')
           or public.es_participante_conversacion(c.id)
         )
    )
  );
