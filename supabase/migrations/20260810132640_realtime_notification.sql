-- ═══════════════════════════════════════════════════════════════════════════
-- Notificaciones en tiempo real · añadir `notification` a Realtime
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️  Cambia la publicación `supabase_realtime` en producción (NO es un cambio
--     de esquema de datos: no crea/altera tablas ni columnas).
--
-- CONTEXTO
-- Petición del fundador: cuando entra una venta, el mostrador (propietaria/
-- recepción/manager) debe verlo AL MOMENTO en el panel — toast + sonido — sin
-- esperar al siguiente tic del polling de 60s de la campana
-- (components/notifications/notification-bell.tsx). El evento nuevo
-- `venta.registrada` (lib/notifications/catalog.ts) ya escribe una fila en
-- `notification` por cada destinatario del mostrador; falta que la tabla
-- publique esos cambios. Mismo patrón ya usado por `instructores` (migr
-- 20260801233748) y `mensajes_equipo` (migr 0022): sin esto, la suscripción del
-- cliente a `postgres_changes` se crea con éxito pero no recibe NINGÚN evento,
-- en silencio.
--
-- Aislamiento: Realtime respeta RLS. La policy `notification_select`
-- (authenticated, recipient_user_id = auth.uid()) ya existe (migr
-- 20260805195208) — cada usuaria solo recibe SUS PROPIAS notificaciones, nunca
-- las de otro miembro del mostrador ni las de otro estudio.
--
-- Solo se necesita INSERT (una notificación nunca se actualiza para producir el
-- toast; el UPDATE de "leído" no debe disparar un segundo toast) — pero
-- `postgres_changes` no permite filtrar por tipo de evento con
-- `alter publication`; el filtrado a solo INSERT y a `event_type =
-- 'venta.registrada'` se hace en el cliente (notification-bell.tsx).
-- ═══════════════════════════════════════════════════════════════════════════

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notification'
  ) then
    alter publication supabase_realtime add table public.notification;
  end if;
end $$;
