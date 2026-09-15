-- Plazas fijas: cuatro fallos del motor que reserva cada semana.
--
-- 1. PLAN VENCIDO. La materialización solo miraba `suscripciones.estado =
--    'ACTIVA'`. Una suscripción que sigue ACTIVA con `fecha_fin` ya pasada (la
--    renovación no llegó, o nadie la cerró) seguía recibiendo reservas cada
--    noche. Ahora exige lo mismo que `reservar_plaza`: vigente HOY
--    (`fecha_fin is null or fecha_fin >= current_date`) y que el plan cubra el
--    tipo de clase (`plan_cubre_tipo_clase`). Mismo criterio que
--    `tieneEntitlementActivo` en lib/bono-logic.ts.
--
-- 2. UNA PLAZA SIN AUTORIZAR TUMBABA LA NOCHE DE TODOS. La materialización es
--    UN solo INSERT para todos los estudios, y `trg_exigir_autorizacion_tipo_clase`
--    hace `raise` si la socia no está autorizada para ese tipo de clase: una
--    sola fila así abortaba el INSERT entero y ningún estudio recibía reservas.
--    Ahora esas coincidencias se excluyen antes (mismo criterio que el trigger)
--    y se avisan con el motivo `sin_autorizacion`.
--
-- 3. UNA RESERVA PENDIENTE DE APROBAR TAMBIÉN LA TUMBABA. El `not exists` de
--    reservas activas no contaba `PENDIENTE_APROBACION`, pero
--    `uq_reserva_activa_socio_sesion` sí: el INSERT chocaba con el índice único
--    y, otra vez, abortaba la pasada entera.
--
-- 4. PAUSAR O QUITAR UNA PLAZA NO SOLTABA SUS CLASES. Las reservas ya creadas
--    (hasta 6 semanas) seguían CONFIRMADAS. El servidor ahora las cancela
--    (`retirarReservasFuturasPlazaFija`) y las marca con
--    `cancelada_motivo = 'plaza_fija_retirada'`, que sirve para dos cosas:
--      · el barrido semanal de recuperaciones no las cuenta como «canceló a
--        tiempo y no le cupo otra» (no lo decidió la socia clase a clase);
--      · la materialización NO las trata como cancelación puntual: al reanudar
--        la plaza, esas semanas vuelven a reservarse. Una cancelación puntual
--        (`cancelada_motivo` NULL) sigue respetándose como siempre.
--
-- Firmas intactas → `create or replace` conserva dueño, SECURITY DEFINER y la
-- ACL (EXECUTE solo service_role desde 20260807151942). Comprobación después:
--   select r, has_function_privilege(r, 'public.materializar_plazas_fijas(integer)', 'EXECUTE'),
--             has_function_privilege(r, 'public.plazas_fijas_sin_materializar(integer)', 'EXECUTE')
--     from unnest(array['anon','authenticated','service_role']) r;
--   → anon f/f, authenticated f/f, service_role t/t.
--
-- ORDEN: aplicar ANTES de desplegar el código (el código escribe y lee
-- `cancelada_motivo`). El código viejo trata un motivo desconocido con el texto
-- de «semana completa»: aplicar, mergear y desplegar antes de las 02:00 UTC,
-- cuando corre el cron.

alter table public.reservas
  add column if not exists cancelada_motivo text;

alter table public.reservas
  drop constraint if exists reservas_cancelada_motivo_valido;
alter table public.reservas
  add constraint reservas_cancelada_motivo_valido
  check (cancelada_motivo is null or cancelada_motivo in ('plaza_fija_retirada'));

comment on column public.reservas.cancelada_motivo is
  'Por qué se canceló, cuando no fue una decisión puntual. NULL = cancelación normal (socia o mostrador). plaza_fija_retirada = la cancela el servidor al pausar o quitar la plaza fija: no genera recuperación semanal y no bloquea que la plaza vuelva a reservarla si se reanuda.';

create or replace function public.materializar_plazas_fijas(p_horizonte_dias integer default 42)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
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
      and not public.fecha_en_cierre(pf.studio_id, (s.inicio at time zone 'Europe/Madrid')::date)
      -- (1) Plan vigente HOY que cubra esta clase, no solo «ACTIVA».
      and exists (
        select 1 from suscripciones su
        where su.socio_id = pf.socio_id and su.studio_id = pf.studio_id and su.estado = 'ACTIVA'
          and (su.fecha_fin is null or su.fecha_fin >= current_date)
          and public.plan_cubre_tipo_clase(su.plan_id, s.tipo_clase_id)
      )
      -- (2) Mismo criterio que trg_exigir_autorizacion_tipo_clase: lo que el
      -- trigger rechazaría no entra en el INSERT.
      and not exists (
        select 1 from tipos_clase tc
        where tc.id = s.tipo_clase_id and coalesce(tc.requiere_autorizacion, false)
          and not exists (
            select 1 from socio_tipos_clase_autorizados a
            where a.studio_id = pf.studio_id and a.socio_id = pf.socio_id and a.tipo_clase_id = tc.id
          )
      )
      -- (3) Los mismos estados que uq_reserva_activa_socio_sesion.
      and not exists (
        select 1 from reservas r
        where r.sesion_id = s.id and r.socio_id = pf.socio_id
          and r.estado in ('CONFIRMADA','LISTA_ESPERA','ASISTIDA','PENDIENTE_APROBACION')
      )
      -- Cancelación puntual respetada; la retirada al pausar/quitar, no (4).
      and not exists (
        select 1 from reservas r5
        where r5.sesion_id = s.id and r5.socio_id = pf.socio_id
          and r5.estado = 'CANCELADA' and r5.id like 'res-pf-%'
          and r5.cancelada_motivo is distinct from 'plaza_fija_retirada'
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
  insert into reservas (id, studio_id, sesion_id, socio_id, estado, spot_id, posicion_espera, check_in_en, creado_en, bono_consumo_rastreado)
  select 'res-pf-' || gen_random_uuid()::text, studio_id, sesion_id, socio_id, 'CONFIRMADA', spot_asignado, null, null, now(), false
  from candidatas
  where rn <= huecos;

  get diagnostics v_creadas = row_count;
  return v_creadas;
end;
$function$;

-- Espejo de la anterior para avisar a la socia de lo que NO se reservó. Los
-- motivos cambian: `suscripcion_pausada` pasa a `sin_plan_vigente` (pausada,
-- vencida o que no cubre la clase — el texto «tu suscripción está en pausa» era
-- falso en los otros dos casos) y se añade `sin_autorizacion`.
create or replace function public.plazas_fijas_sin_materializar(p_horizonte_dias integer default 42)
 returns table(plaza_id text, studio_id text, socio_id text, sesion_id text, motivo text)
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  return query
  with matches as (
    select
      pf.id         as plaza_id,
      pf.studio_id,
      pf.socio_id,
      pf.creada_en,
      s.id          as sesion_id,
      coalesce(s.cancelada, false) as sesion_cancelada,
      not exists (
        select 1 from suscripciones su
        where su.socio_id = pf.socio_id and su.studio_id = pf.studio_id and su.estado = 'ACTIVA'
          and (su.fecha_fin is null or su.fecha_fin >= current_date)
          and public.plan_cubre_tipo_clase(su.plan_id, s.tipo_clase_id)
      ) as sin_plan_vigente,
      exists (
        select 1 from tipos_clase tc
        where tc.id = s.tipo_clase_id and coalesce(tc.requiere_autorizacion, false)
          and not exists (
            select 1 from socio_tipos_clase_autorizados a
            where a.studio_id = pf.studio_id and a.socio_id = pf.socio_id and a.tipo_clase_id = tc.id
          )
      ) as sin_autorizacion,
      row_number() over (partition by pf.socio_id, s.id order by pf.creada_en, pf.id) as rn_dup
    from plazas_fijas pf
    join sesiones s
      on s.studio_id = pf.studio_id
     and s.sala_id = pf.sala_id
     and s.inicio >= now()
     and s.inicio <  now() + make_interval(days => p_horizonte_dias)
     and extract(dow from s.inicio at time zone 'Europe/Madrid') = pf.dia_semana
     and (s.inicio at time zone 'Europe/Madrid')::time = pf.hora_inicio
     and (pf.tipo_clase_id is null or s.tipo_clase_id = pf.tipo_clase_id)
     and (s.inicio at time zone 'Europe/Madrid')::date >= pf.vigencia_desde
     and (pf.vigencia_hasta is null or (s.inicio at time zone 'Europe/Madrid')::date <= pf.vigencia_hasta)
    where pf.estado = 'ACTIVA'
      and not exists (
        select 1 from reservas r
        where r.sesion_id = s.id and r.socio_id = pf.socio_id
          and r.estado in ('CONFIRMADA','LISTA_ESPERA','ASISTIDA','PENDIENTE_APROBACION')
      )
      and not exists (
        select 1 from reservas r5
        where r5.sesion_id = s.id and r5.socio_id = pf.socio_id
          and r5.estado = 'CANCELADA' and r5.id like 'res-pf-%'
          and r5.cancelada_motivo is distinct from 'plaza_fija_retirada'
      )
  ),
  dedupadas as (
    select * from matches where rn_dup = 1
  ),
  sin_hueco as (
    select
      d.plaza_id, d.studio_id, d.socio_id, d.sesion_id,
      greatest(0, aforo_efectivo(d.sesion_id) - (
        select count(*) from reservas r2
        where r2.sesion_id = d.sesion_id and r2.estado in ('CONFIRMADA','ASISTIDA')
      )) as huecos,
      row_number() over (partition by d.sesion_id order by d.creada_en, d.plaza_id) as rn
    from dedupadas d
    where not d.sesion_cancelada and not d.sin_plan_vigente and not d.sin_autorizacion
  )
  select d.plaza_id, d.studio_id, d.socio_id, d.sesion_id, 'sesion_cancelada'::text as motivo
  from dedupadas d where d.sesion_cancelada
  union all
  select d.plaza_id, d.studio_id, d.socio_id, d.sesion_id, 'sin_plan_vigente'::text as motivo
  from dedupadas d where not d.sesion_cancelada and d.sin_plan_vigente
  union all
  select d.plaza_id, d.studio_id, d.socio_id, d.sesion_id, 'sin_autorizacion'::text as motivo
  from dedupadas d where not d.sesion_cancelada and not d.sin_plan_vigente and d.sin_autorizacion
  union all
  select h.plaza_id, h.studio_id, h.socio_id, h.sesion_id, 'sin_aforo'::text as motivo
  from sin_hueco h where h.rn > h.huecos;
end;
$function$;

-- Solo el cron (service_role). `create or replace` con la misma firma ya
-- conserva la ACL, pero se deja escrito: el `pg_default_acl` de este proyecto da
-- EXECUTE directo a anon/authenticated en toda función nueva, y revocar PUBLIC
-- no se lo quita.
revoke all on function public.materializar_plazas_fijas(integer) from public, anon, authenticated;
grant execute on function public.materializar_plazas_fijas(integer) to service_role;
revoke all on function public.plazas_fijas_sin_materializar(integer) from public, anon, authenticated;
grant execute on function public.plazas_fijas_sin_materializar(integer) to service_role;
