-- ═══════════════════════════════════════════════════════════════════════════
-- Instructores en tiempo real · añadir instructores a Realtime
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️  Cambia la publicación `supabase_realtime` en producción (NO es un cambio
--     de esquema de datos: no crea/altera tablas ni columnas).
--
-- CONTEXTO
-- El self-claim de una instructora (confirmar el correo de invitación) ocurre
-- en su propia sesión/pestaña, con un UPDATE de auth_user_id en servidor con
-- service-role — la pestaña de la propietaria no se enteraba hasta recargar.
-- lib/studio-context.tsx añade una suscripción a `postgres_changes` sobre
-- `instructores`, mismo patrón que ya usa mensajes_equipo (migr 0022) para el
-- chat de equipo. Sin esta migración, esa suscripción no recibe NINGÚN evento
-- silenciosamente: el cliente se suscribe con éxito, pero la tabla nunca
-- publica cambios si no está en `supabase_realtime`.
--
-- Aislamiento: Realtime respeta RLS. La policy `read_instructores`
-- (authenticated, studio_id = current_studio_id()) ya existe, así que cada
-- usuaria solo recibe cambios de instructoras de su propio estudio.
--
-- Suscribimos INSERT/UPDATE/DELETE (self-claim es un UPDATE) → replica
-- identity DEFAULT ya basta: para DELETE entrega igualmente las columnas de
-- la clave primaria (`id`), que es lo único que usa el cliente en ese caso.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'instructores'
  ) then
    alter publication supabase_realtime add table public.instructores;
  end if;
end $$;
