-- Community & Messaging OS — Realtime Broadcast-from-DB, pieza 1/2:
-- difunde mensajes nuevos por el canal `conversacion:{id}`.
--
-- ⚠️ Firma real de `realtime.broadcast_changes` en este proyecto (verificado
-- con `pg_proc` antes de escribir esto, nunca de memoria): 8 argumentos, con
-- un octavo parámetro `level` que algunos ejemplos de referencia omiten —
-- aquí se pasa `tg_level` (siempre 'ROW', porque el trigger es
-- FOR EACH ROW), no un valor inventado.
--
-- "Esto es solo la UI... la cerradura está en la RLS" — la policy de lectura
-- sobre `realtime.messages` es la que decide quién puede suscribirse al
-- canal, replicando EXACTAMENTE la misma condición que ya usa
-- `mensajes_lectura` (community_messaging_os_rls, 2/4): EQUIPO/ALUMNA_MOSTRADOR
-- por studio+rol de mostrador, o participante directo vía
-- `es_participante_conversacion`.
--
-- ⚠️ `realtime.messages` YA tiene RLS activada por defecto en este proyecto
-- (verificado en vivo) y es propiedad de `supabase_realtime_admin`, no de
-- `postgres` — un `ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY`
-- falla aquí con "must be owner of table messages" aunque sea un no-op.
-- `CREATE POLICY` sí funciona (no exige ser dueño para esto en este
-- proyecto), así que se omite esa línea a propósito.
create or replace function public.difundir_mensaje_nuevo()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
begin
  perform realtime.broadcast_changes(
    'conversacion:' || new.conversacion_id, -- topic_name
    tg_op,                                   -- event_name
    tg_op,                                   -- operation
    tg_table_name,                           -- table_name
    tg_table_schema,                         -- table_schema
    new,                                      -- new record
    old,                                      -- old record
    tg_level                                  -- level ('ROW', trigger real)
  );
  return new;
end;
$$;

-- Gotcha ya documentado en este repo (pg_default_acl da EXECUTE directo a
-- anon/authenticated en toda función SECURITY DEFINER nueva, no heredado de
-- PUBLIC): revoke explícito de los tres roles de cliente. La ejecución real
-- solo ocurre vía el propio trigger (corre con los privilegios del dueño de
-- la función/tabla, no necesita EXECUTE concedido a un rol de sesión).
-- Verificado con `has_function_privilege` para anon/authenticated/service_role.
revoke all on function public.difundir_mensaje_nuevo() from public, anon, authenticated;
revoke all on function public.difundir_mensaje_nuevo() from service_role;
grant execute on function public.difundir_mensaje_nuevo() to service_role;

create trigger trg_difundir_mensaje_nuevo
  after insert on public.mensajes
  for each row execute function public.difundir_mensaje_nuevo();

-- `realtime.messages` es la tabla de Supabase Realtime donde vive cada
-- broadcast/presence; sin esta policy, ningún `authenticated` podría leer
-- NADA en broadcast (RLS por defecto deniega todo sin policy), y con una
-- policy demasiado ancha cualquiera podría suscribirse a CUALQUIER topic y
-- leer mensajes de una conversación ajena. Esta RLS ES la cerradura real del
-- canal — la UI nunca decide esto.
create policy mensajeria_broadcast_lectura on realtime.messages
  for select
  to authenticated
  using (
    realtime.messages.extension = 'broadcast'
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
