-- F2 · Paso 4b — Materialización de plazas fijas (informe B2.2). La dispara el
-- cron nocturno (Vercel → /api/cron/materializar-plazas).
--
-- Crea reservas CONFIRMADA normales para las sesiones futuras (horizonte por
-- defecto 6 semanas) que encajan con cada plaza fija ACTIVA. Emparejamiento por
-- HORA LOCAL del estudio (Europe/Madrid; la app es 100% ES, no hay tz por estudio).
--
-- Garantías:
--  · Idempotente: no duplica si la socia ya tiene reserva activa en esa sesión.
--  · Respeta aforo_efectivo (Paso 2): sólo materializa hasta llenar, priorizando
--    las plazas más antiguas (rn <= huecos). Nunca sobre-vende.
--  · Respeta la vigencia de la plaza, el tipo de clase (si se acotó) y que la
--    socia tenga una suscripción ACTIVA (una PAUSADA/congelada no materializa).
--  · Sitio "de siempre": asigna pf.spot_id sólo si está libre en esa sesión; si no,
--    crea la reserva sin sitio (nunca aborta el lote por un choque de sitio).
--  · Dedup defensivo: una sola reserva por (socia, sesión) aunque haya 2 plazas.

create or replace function public.materializar_plazas_fijas(p_horizonte_dias int default 42)
  returns integer
  language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare
  v_creadas int;
begin
  with matches as (
    select
      pf.id         as plaza_id,
      pf.studio_id,
      pf.socio_id,
      pf.creada_en,
      s.id          as sesion_id,
      -- sitio preferido sólo si está libre en esta sesión; si no, null (sin sitio)
      case when pf.spot_id is not null and not exists (
             select 1 from reservas r3
             where r3.sesion_id = s.id and r3.spot_id = pf.spot_id
               and r3.estado in ('CONFIRMADA','ASISTIDA')
           ) then pf.spot_id else null end as spot_asignado,
      row_number() over (partition by pf.socio_id, s.id order by pf.creada_en, pf.id) as rn_dup
    from plazas_fijas pf
    join sesiones s
      on s.studio_id = pf.studio_id
     and s.sala_id = pf.sala_id
     and coalesce(s.cancelada, false) = false
     and s.inicio >= now()
     and s.inicio <  now() + make_interval(days => p_horizonte_dias)
     and extract(dow from s.inicio at time zone 'Europe/Madrid') = pf.dia_semana
     and (s.inicio at time zone 'Europe/Madrid')::time = pf.hora_inicio
     and (pf.tipo_clase_id is null or s.tipo_clase_id = pf.tipo_clase_id)
     and (s.inicio at time zone 'Europe/Madrid')::date >= pf.vigencia_desde
     and (pf.vigencia_hasta is null or (s.inicio at time zone 'Europe/Madrid')::date <= pf.vigencia_hasta)
    where pf.estado = 'ACTIVA'
      and exists (
        select 1 from suscripciones su
        where su.socio_id = pf.socio_id and su.studio_id = pf.studio_id and su.estado = 'ACTIVA'
      )
      and not exists (
        select 1 from reservas r
        where r.sesion_id = s.id and r.socio_id = pf.socio_id
          and r.estado in ('CONFIRMADA','LISTA_ESPERA','ASISTIDA')
      )
  ),
  candidatas as (
    select
      m.*,
      greatest(0, aforo_efectivo(m.sesion_id) - (
        select count(*) from reservas r2
        where r2.sesion_id = m.sesion_id and r2.estado in ('CONFIRMADA','ASISTIDA')
      )) as huecos,
      row_number() over (partition by m.sesion_id order by m.creada_en, m.plaza_id) as rn
    from matches m
    where m.rn_dup = 1
  )
  insert into reservas (id, studio_id, sesion_id, socio_id, estado, spot_id, posicion_espera, check_in_en, creado_en)
  select 'res-pf-' || gen_random_uuid()::text, studio_id, sesion_id, socio_id, 'CONFIRMADA', spot_asignado, null, null, now()
  from candidatas
  where rn <= huecos;

  get diagnostics v_creadas = row_count;
  return v_creadas;
end;
$$;

-- Sólo el cron (service-role). No anon, no authenticated directo.
revoke execute on function public.materializar_plazas_fijas(int) from anon, public;
grant  execute on function public.materializar_plazas_fijas(int) to service_role;
