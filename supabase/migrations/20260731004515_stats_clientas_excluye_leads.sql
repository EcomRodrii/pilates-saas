-- Auditoría CTO: «Total clientas» contaba también los leads/interesadas del
-- CRM (socios.lead_stage en 'LEAD'/'INTERESADA' — el mismo criterio de
-- "entrada" ya usado por lib/decision/especialistas/captacion.ts y por
-- app/(dashboard)/marketing/page.tsx, "Leads captados"). Un lead es un
-- contacto que aún no se ha apuntado a nada — mezclarlo con clientas reales
-- infla el total y falsea "activas"/"con bono"/"sin venir 30d" del panel.
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
    count(*) filter (
      where coalesce(
              (select ultima from vis where vis.socio_id = s.id),
              s.fecha_alta,           -- nunca ha venido → se cuenta desde su alta
              'epoch'::timestamptz    -- sin alta (datos antiguos): como antes
            ) < now() - interval '30 days'
    )::bigint
  from public.socios s
  where s.borrado_en is null
    and coalesce(s.lead_stage, '') not in ('LEAD', 'INTERESADA');
$$;
