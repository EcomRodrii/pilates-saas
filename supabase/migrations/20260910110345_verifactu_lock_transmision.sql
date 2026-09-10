-- 20260910110000 · TENTARE — cerrojo de una sola fila contra transmisiones Veri*Factu concurrentes
--
-- 50ª pasada de auditoría (2026-09-10), hallazgo H-1. `transmitirPendientes()`
-- (lib/verifactu/transmitir.ts) no tenía ninguna protección contra dos
-- invocaciones solapadas del cron (Vercel Cron no garantiza que no se
-- solapen, y el endpoint también se puede disparar a mano con CRON_SECRET).
-- Dos ejecuciones a la vez podían mandar el MISMO registro pendiente dos
-- veces a la AEAT en sobres distintos y, peor, la segunda podía sobrescribir
-- el estado REGISTRADA que ya escribió la primera con RECHAZADA — lo que
-- además congela en falso toda transmisión posterior del estudio
-- (hayHuecoAntesDe) y dispara un aviso falso a la propietaria.
--
-- Una sola fila, no `pg_advisory_lock`: el certificado/conexión con la AEAT
-- es UN recurso global compartido por todos los estudios (un solo NIF
-- productor de software, lib/verifactu/config.ts), así que el cerrojo
-- también es global, y `pg_advisory_lock`/`unlock` de sesión no es fiable
-- llamado desde supabase-js (cada .rpc() puede ir por una conexión pooled
-- distinta — no hay garantía de que lock y unlock caigan en la misma sesión
-- de Postgres). Compare-and-set sobre una fila sí lo es.
--
-- Recuperación de cerrojo huérfano: si `iniciado_en` tiene más de 6 minutos
-- (el cron corre cada 10, maxDuration 300s = 5 min), se asume que la
-- ejecución anterior murió sin liberar (timeout de Vercel, crash) y se deja
-- adquirir de nuevo — sin esto, un cuelgue real dejaría Veri*Factu parado
-- para siempre sin que nadie lo notara.

create table if not exists public.verifactu_transmision_lock (
  id text primary key default 'global',
  en_curso boolean not null default false,
  iniciado_en timestamptz,
  actualizado_en timestamptz not null default now()
);

insert into public.verifactu_transmision_lock (id) values ('global')
  on conflict (id) do nothing;

comment on table public.verifactu_transmision_lock is
  'Cerrojo de una sola fila (compare-and-set) para que transmitirPendientes() nunca corra dos veces a la vez. Fila única "global": el certificado AEAT es un recurso compartido por todos los estudios, no por estudio.';

alter table public.verifactu_transmision_lock enable row level security;

-- Sin políticas para authenticated/anon: control-plane solo para el propio
-- cron (service_role). Mismo criterio que las tablas de /interno (43ª pasada).
revoke all on public.verifactu_transmision_lock from public, anon, authenticated;
grant select, insert, update on public.verifactu_transmision_lock to service_role;
