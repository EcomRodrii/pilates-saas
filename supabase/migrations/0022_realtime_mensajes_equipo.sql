-- ═══════════════════════════════════════════════════════════════════════════
-- 0022 · Chat de equipo en tiempo real · añadir mensajes_equipo a Realtime
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️  Cambia la publicación `supabase_realtime` en producción (NO es un cambio
--     de esquema de datos: no crea/altera tablas ni columnas).
--
-- CONTEXTO
-- El chat de equipo pasa a tiempo real (hook useTeamChat, Fase 1). La suscripción
-- del cliente a `postgres_changes` (INSERT) sobre `mensajes_equipo` solo recibe
-- eventos si la tabla está en la publicación `supabase_realtime`. Sin esto, el
-- chat sigue funcionando (carga al abrir + refresco al recuperar el foco), pero
-- NO actualiza al instante cuando otra persona del equipo escribe.
--
-- Aislamiento: Realtime respeta RLS. La policy `admin_mensajes_equipo`
-- (authenticated, studio_id = current_studio_id()) ya existe, así que cada
-- usuaria solo recibe los mensajes de su propio estudio. No hace falta tocar RLS.
--
-- Solo suscribimos INSERT → no se necesita REPLICA IDENTITY FULL (eso es para
-- recibir la fila anterior en UPDATE/DELETE).
-- ═══════════════════════════════════════════════════════════════════════════

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'mensajes_equipo'
  ) then
    alter publication supabase_realtime add table public.mensajes_equipo;
  end if;
end $$;
