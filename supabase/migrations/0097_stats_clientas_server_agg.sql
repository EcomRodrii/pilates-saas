-- 0092 · F1 (B1) — contadores de clientas SERVER-SIDE. Los 4 KPI de /clientas
-- (total/activas/con bono/inactivas 30d) se calculaban sobre el array `socios` del
-- cliente, capado a 1000 → mienten a escala. RPC con count() SQL (no se capa); la
-- RLS acota por estudio (SECURITY INVOKER). Replica EXACTO la semántica del cliente:
--   con_bono = suscripción ACTIVA o PAUSADA · inactivas_30d = última visita ASISTIDA
--   > 30 días (o sin visita) · total = socios no borrados · activas = socios.activo.
create or replace function public.stats_clientas()
returns table(total bigint, activas bigint, con_bono bigint, inactivas_30d bigint)
language sql stable security invoker set search_path to 'public'
as $$
  with vis as (
    select r.socio_id, max(ss.inicio) as ultima
    from public.reservas r join public.sesiones ss on ss.id = r.sesion_id
    where r.estado = 'ASISTIDA'
    group by r.socio_id
  ),
  bono as (select distinct socio_id from public.suscripciones where estado in ('ACTIVA','PAUSADA'))
  select
    count(*)::bigint,
    count(*) filter (where s.activo)::bigint,
    count(*) filter (where s.id in (select socio_id from bono))::bigint,
    count(*) filter (where coalesce((select ultima from vis where vis.socio_id = s.id), 'epoch'::timestamptz) < now() - interval '30 days')::bigint
  from public.socios s
  where s.borrado_en is null;
$$;
