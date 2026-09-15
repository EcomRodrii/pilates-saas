-- Plaza fija: el motor no reserva sola una clase que empieza dentro del plazo
-- de cancelación.
--
-- `materializar_plazas_fijas` reservaba cualquier sesión con `inicio >= now()`.
-- Por la noche da igual (lo nuevo entra a 42 días vista), pero también se llama
-- AL MOMENTO: al crear una plaza fija y al quitar o acortar una pausa. Ahí podía
-- apuntar a la socia a una clase que empezaba en minutos sin que ella lo supiera.
-- Si no iba, el barrido de no-shows la pasaba a NO_ASISTIO y
-- `trigger_detectar_penalizacion_no_show` le abría una penalización — que además
-- da la regla por activada cuando el estudio nunca la tocó
-- (`coalesce(penalizacion_aplica_no_show, true)`).
--
-- Regla: no se reserva sola una clase que empieza dentro de la ventana de
-- cancelación (la del tipo de clase y, si no tiene, la del estudio). Es la misma
-- frontera que ya respeta la retirada al pausar, que mantiene las reservas de
-- dentro del plazo: lo que ya no se puede cancelar sin coste tampoco se reserva
-- sin preguntar. Esa clase, si la quiere, se la apunta el mostrador a mano.
--
-- Mismo cuerpo que 20260915094312_plazas_fijas_pausa_con_fechas.sql salvo el
-- filtro nuevo (marcado abajo). Misma firma → conserva los grants; aun así se
-- re-declaran igual y se verifican con has_function_privilege tras aplicar.

create or replace function public.materializar_plazas_fijas(p_horizonte_dias integer default 42, p_plaza_id text default null)
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
     -- NUEVO: nada que empiece dentro de la ventana de cancelación (tipo de
     -- clase y, si no la fija, la del estudio). `interval * numeric` y no
     -- make_interval(hours => …), que solo acepta enteros.
     and s.inicio >= now() + coalesce(
           (select tc0.ventana_cancelacion_horas from tipos_clase tc0 where tc0.id = s.tipo_clase_id),
           (select st0.cancelacion_ventana_horas from studios st0 where st0.id = s.studio_id),
           0) * interval '1 hour'
     and extract(dow from s.inicio at time zone 'Europe/Madrid') = pf.dia_semana
     and (s.inicio at time zone 'Europe/Madrid')::time = pf.hora_inicio
     and (pf.tipo_clase_id is null or s.tipo_clase_id = pf.tipo_clase_id)
     and (s.inicio at time zone 'Europe/Madrid')::date >= pf.vigencia_desde
     and (pf.vigencia_hasta is null or (s.inicio at time zone 'Europe/Madrid')::date <= pf.vigencia_hasta)
    where pf.estado = 'ACTIVA'
      and (p_plaza_id is null or pf.id = p_plaza_id)
      -- Pausa con fechas: esas semanas no se reservan y la plaza no se pierde.
      and not (pf.pausa_desde is not null
               and (s.inicio at time zone 'Europe/Madrid')::date between pf.pausa_desde and pf.pausa_hasta)
      and not public.fecha_en_cierre(pf.studio_id, (s.inicio at time zone 'Europe/Madrid')::date)
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

revoke all on function public.materializar_plazas_fijas(integer, text) from public, anon, authenticated;
grant execute on function public.materializar_plazas_fijas(integer, text) to service_role;
