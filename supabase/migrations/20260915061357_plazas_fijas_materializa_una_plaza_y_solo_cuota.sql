-- Plazas fijas: el motor puede reservar UNA plaza al momento, y solo con cuota.
--
-- 1. UNA PLAZA AL GUARDAR. La primera clase de una plaza fija se reservaba desde
--    el panel con `addReserva` (y desde la app con `crearReservaPublica`): una
--    reserva normal, que descuenta bono, mientras que las de cada noche las crea
--    `materializar_plazas_fijas` como `res-pf-` y no descuentan nunca. Dos
--    motores para el mismo hecho. Ahora el servidor, al crear o mover la plaza,
--    llama a este mismo motor acotado a esa plaza (`p_plaza_id`) y reserva las
--    6 semanas que el cron habría reservado esa noche.
--
-- 2. SOLO CON CUOTA (decisión del fundador, 15-sep-2026). Las reservas de una
--    plaza fija nunca descuentan sesiones: con un bono, una clienta con plaza
--    fija tenía clases gratis mientras el bono siguiera activo. La plaza fija es
--    de quien paga una cuota (plan MENSUAL, que incluye trimestral y anual vía
--    `periodicidad_meses`) que cubra la clase; con bono se reserva clase a clase.
--    Mismo criterio en el servidor al crearla (`cuotaParaPlazaFija`).
--
-- ⚠️ Firma nueva = objeto función nuevo. Se hace DROP de la de un argumento en
-- la misma migración: si convivieran las dos, PostgREST no sabría cuál elegir
-- con `{ p_horizonte_dias }` y el cron se rompería. Y como el `pg_default_acl`
-- de este proyecto da EXECUTE directo a anon/authenticated en toda función
-- nueva, los tres REVOKE van escritos. Comprobación después:
--   select r, has_function_privilege(r, 'public.materializar_plazas_fijas(integer, text)', 'EXECUTE')
--     from unnest(array['anon','authenticated','service_role']) r;
--   → anon f, authenticated f, service_role t.
--
-- Compatible con el código desplegado: el cron llama con `p_horizonte_dias` y el
-- segundo argumento tiene default.

drop function if exists public.materializar_plazas_fijas(integer);

create function public.materializar_plazas_fijas(p_horizonte_dias integer default 42, p_plaza_id text default null)
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
      and (p_plaza_id is null or pf.id = p_plaza_id)
      and not public.fecha_en_cierre(pf.studio_id, (s.inicio at time zone 'Europe/Madrid')::date)
      -- Cuota (plan MENSUAL) vigente HOY que cubra esta clase. Si la cuota tiene
      -- la baja programada (`baja_al_vencer`), además tiene que llegar a la fecha
      -- de la clase: si no, se reservarían gratis semanas en las que ya no paga.
      -- Una cuota que se renueva sola no se recorta a su fecha de cobro: la
      -- renovación la alarga y el motor de cada noche sigue.
      and exists (
        select 1 from suscripciones su
        join planes_tarifa pt on pt.id = su.plan_id and pt.tipo = 'MENSUAL'
        where su.socio_id = pf.socio_id and su.studio_id = pf.studio_id and su.estado = 'ACTIVA'
          and (su.fecha_fin is null or su.fecha_fin >= current_date)
          and (not coalesce(su.baja_al_vencer, false) or su.fecha_fin >= (s.inicio at time zone 'Europe/Madrid')::date)
          and public.plan_cubre_tipo_clase(su.plan_id, s.tipo_clase_id)
      )
      and not exists (
        select 1 from tipos_clase tc
        where tc.id = s.tipo_clase_id and coalesce(tc.requiere_autorizacion, false)
          and not exists (
            select 1 from socio_tipos_clase_autorizados a
            where a.studio_id = pf.studio_id and a.socio_id = pf.socio_id and a.tipo_clase_id = tc.id
          )
      )
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

-- Espejo para los avisos: con bono, la plaza cae en `sin_plan_vigente`.
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
        join planes_tarifa pt on pt.id = su.plan_id and pt.tipo = 'MENSUAL'
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

revoke all on function public.materializar_plazas_fijas(integer, text) from public, anon, authenticated;
grant execute on function public.materializar_plazas_fijas(integer, text) to service_role;
revoke all on function public.plazas_fijas_sin_materializar(integer) from public, anon, authenticated;
grant execute on function public.plazas_fijas_sin_materializar(integer) to service_role;

-- 3. ESCRITURA SOLO POR EL SERVIDOR. Crear, mover, pausar y quitar pasan ya por
--    `app/api/plazas-fijas` (reglas de cuota, límite y autorización). La RLS de
--    escritura seguía abierta a quien gestiona clientas: desde el navegador se
--    podía insertar una plaza sin pasar por ninguna regla. Nada legítimo la usa:
--    el importador y deshacer una migración van con service_role, y
--    `editar_serie_desde` y `anonimizar_socio` son SECURITY DEFINER. La lectura
--    (`plazas_fijas_lectura`) se queda: el panel carga las plazas con la sesión.
drop policy if exists plazas_fijas_escritura_insert on public.plazas_fijas;
drop policy if exists plazas_fijas_escritura_update on public.plazas_fijas;
drop policy if exists plazas_fijas_escritura_delete on public.plazas_fijas;
revoke insert, update, delete on table public.plazas_fijas from authenticated, anon;
