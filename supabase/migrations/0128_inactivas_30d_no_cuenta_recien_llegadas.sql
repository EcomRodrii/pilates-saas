-- «Sin venir 30d» contaba a las clientas que acababas de dar de alta.
--
-- La 0097 resuelve la última visita con:
--   coalesce((select ultima from vis where ...), 'epoch'::timestamptz) < now() - 30 days
--
-- Es decir: quien no tiene ninguna reserva ASISTIDA se trata como si su última
-- visita hubiera sido en 1970, así que entra en el contador desde el segundo
-- uno. Al dar de alta la primera clienta de un estudio nuevo, el panel decía
-- «Sin venir 30d: 1» — con la ficha creada hacía tres segundos.
--
-- No es solo un número feo en el día 1: es el tipo de dato que, cuando no
-- cuadra con lo que la dueña sabe de su propio negocio, le hace dejar de
-- creerse el resto del panel. Y alimenta la tarjeta de alerta del dashboard.
--
-- Semántica correcta: «lleva 30 días sin aparecer». Para quien nunca ha venido,
-- eso se cuenta desde su ALTA, no desde el principio de los tiempos. Así, una
-- clienta nueva entra en el contador cuando de verdad lleva un mes sin ir — que
-- es justo el momento en el que quieres llamarla.
--
-- Lo demás (total, activas, con_bono) no cambia.

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
  where s.borrado_en is null;
$$;
