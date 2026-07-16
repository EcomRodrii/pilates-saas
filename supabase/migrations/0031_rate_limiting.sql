-- ═══════════════════════════════════════════════════════════════════════════
-- 0031 · I14 · Rate limiting respaldado por Postgres (ventana fija atómica)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- CONTEXTO (auditoría 15-jul, hallazgo I14)
-- No había rate limiting en los endpoints públicos/semipúblicos (studio-data,
-- reserva, canje, checkout Stripe…) → enumerables y abusables (fuerza bruta,
-- sondeo, coste de Stripe). Se implementa un limitador de VENTANA FIJA respaldado
-- por Postgres (Supabase) —sin vendor nuevo— con un contador atómico por clave.
--
-- Solo lo usa el servidor con service_role (getSupabaseAdmin). La tabla se cierra
-- a anon/authenticated (RLS sin políticas + REVOKE) en ESTA MISMA migración, para
-- no repetir el error de nacer accesible (ver 0030). El limitador FALLA-ABIERTO en
-- la app: si la RPC no existe o falla, se permite (nunca rompemos por el limiter).
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.rate_limits (
  bucket_key text primary key,
  count      integer     not null default 0,
  reset_at   timestamptz not null
);

-- Solo service_role (que se salta RLS) toca esta tabla. RLS ON sin políticas =
-- denegado para anon/authenticated; el REVOKE lo cierra también a nivel de tabla.
alter table public.rate_limits enable row level security;
revoke all on table public.rate_limits from anon, authenticated, public;

-- Índice para la purga periódica de cubos expirados (ver nota de limpieza abajo).
create index if not exists rate_limits_reset_at on public.rate_limits (reset_at);

-- Incremento ATÓMICO de ventana fija. Un solo UPSERT (lock de fila en el
-- conflicto) serializa peticiones concurrentes de la misma clave. Si la ventana
-- venció, reinicia el contador a 1 y abre una ventana nueva. Devuelve si la
-- petición está permitida (count <= max), cuántas quedan y cuándo se reinicia.
create or replace function public.rate_limit_hit(
  p_key text, p_max integer, p_window_seconds integer
) returns table(allowed boolean, remaining integer, reset_at timestamptz)
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_now   timestamptz := now();
  v_count integer;
  v_reset timestamptz;
begin
  insert into public.rate_limits as rl (bucket_key, count, reset_at)
    values (p_key, 1, v_now + make_interval(secs => p_window_seconds))
  on conflict (bucket_key) do update set
    count = case when rl.reset_at <= v_now then 1 else rl.count + 1 end,
    reset_at = case when rl.reset_at <= v_now
                    then v_now + make_interval(secs => p_window_seconds)
                    else rl.reset_at end
  returning rl.count, rl.reset_at into v_count, v_reset;

  return query select (v_count <= p_max), greatest(0, p_max - v_count), v_reset;
end;
$$;

revoke all on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;

-- LIMPIEZA (follow-up, no bloqueante): los cubos de IPs que no vuelven quedan en
-- la tabla. Una purga periódica los borra:
--   delete from public.rate_limits where reset_at < now() - interval '1 day';
-- Se puede colgar de un cron existente. La tabla es pequeña (clave = ip:ruta) y no
-- afecta a la corrección; queda anotado para higiene.
