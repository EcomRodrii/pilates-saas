-- Plaza fija: si la alumna se queda sin cuota, se sueltan las clases que el
-- motor ya le había reservado.
--
-- `materializar_plazas_fijas` solo reserva con una cuota vigente que cubra la
-- clase, pero lo ya reservado (hasta 6 semanas) seguía CONFIRMADO al cancelar la
-- cuota, cambiarla por un bono, pausarla o dejarla vencer: ocupaba un sitio y, si
-- no iba, el barrido de faltas podía abrirle una penalización. Visto probando en
-- producción el flujo de una propietaria (15-sep-2026).
--
-- 1) `cuota_cubre_plaza_fija`: LA regla de «tiene cuota para esta clase ese día»,
--    que hasta hoy vivía escrita dentro del motor. La usan el motor y el barrido,
--    así no pueden discrepar. Con una diferencia explícita, `p_exigir_vigente`:
--    una cuota ACTIVA cuyo periodo ya acabó y cuya renovación aún no se ha
--    cobrado (recibo en reintentos o por cobrar en mostrador) no RESERVA clases
--    nuevas (motor, `true`), pero tampoco pierde las que ya tenía (barrido,
--    `false`): soltarle seis semanas por un cobro que llega tarde sería peor que
--    el problema. Si el cobro falla del todo, la cuota acaba CANCELADA y entonces
--    sí se sueltan.
-- 2) `reservas_plaza_fija_sin_cuota`: las reservas del motor (`res-pf-`) aún
--    activas, de clases futuras fuera del plazo de cancelación, que ya no tienen
--    cuota. Solo las lista: las cancela el servidor con
--    `ejecutarCancelacionReserva` (lista de espera, avisos, sin penalización), el
--    mismo camino que al quitar la plaza.
-- 3) `materializar_plazas_fijas`: mismo cuerpo que
--    20260915170344_plaza_fija_no_reserva_dentro_del_plazo.sql con el EXISTS de la
--    cuota cambiado por la función de (1). Misma firma → conserva los grants; aun
--    así se re-declaran y se verifican con has_function_privilege tras aplicar.

create or replace function public.cuota_cubre_plaza_fija(
  p_studio_id text, p_socio_id text, p_tipo_clase_id text, p_fecha date, p_exigir_vigente boolean default true
)
 returns boolean
 language sql
 stable
 set search_path to 'public', 'pg_temp'
as $function$
  select exists (
    select 1 from suscripciones su
    join planes_tarifa pt on pt.id = su.plan_id and pt.tipo = 'MENSUAL'
    where su.socio_id = p_socio_id and su.studio_id = p_studio_id and su.estado = 'ACTIVA'
      and (not p_exigir_vigente or su.fecha_fin is null or su.fecha_fin >= current_date)
      and (not coalesce(su.baja_al_vencer, false) or su.fecha_fin >= p_fecha)
      and public.plan_cubre_tipo_clase(su.plan_id, p_tipo_clase_id)
  );
$function$;

create or replace function public.reservas_plaza_fija_sin_cuota(p_studio_id text default null, p_socio_id text default null)
 returns table(studio_id text, reserva_id text)
 language sql
 stable
 set search_path to 'public', 'pg_temp'
as $function$
  select r.studio_id, r.id
  from reservas r
  join sesiones s on s.id = r.sesion_id
  where r.id like 'res-pf-%'
    and r.estado in ('CONFIRMADA', 'LISTA_ESPERA')
    and (p_studio_id is null or r.studio_id = p_studio_id)
    and (p_socio_id is null or r.socio_id = p_socio_id)
    and coalesce(s.cancelada, false) = false
    -- Las de dentro del plazo de cancelación se mantienen, igual que al pausar o
    -- quitar la plaza: lo que ya no se cancela sin coste no se toca solo.
    and s.inicio >= now() + coalesce(
          (select tc0.ventana_cancelacion_horas from tipos_clase tc0 where tc0.id = s.tipo_clase_id),
          (select st0.cancelacion_ventana_horas from studios st0 where st0.id = s.studio_id),
          0) * interval '1 hour'
    -- `false`: una cuota ACTIVA con la renovación por cobrar conserva lo reservado.
    and not public.cuota_cubre_plaza_fija(r.studio_id, r.socio_id, s.tipo_clase_id, (s.inicio at time zone 'Europe/Madrid')::date, false);
$function$;

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
     -- Nada que empiece dentro de la ventana de cancelación (tipo de clase y, si
     -- no la fija, la del estudio). `interval * numeric` y no
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
      -- NUEVO: la regla de la cuota, en su función (la comparte el barrido).
      and public.cuota_cubre_plaza_fija(pf.studio_id, pf.socio_id, s.tipo_clase_id, (s.inicio at time zone 'Europe/Madrid')::date)
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

-- Solo el servidor (service_role): ni anon ni authenticated. `REVOKE ... FROM
-- public` no basta en este proyecto (pg_default_acl da EXECUTE directo a los
-- roles), así que se revoca rol a rol.
revoke all on function public.cuota_cubre_plaza_fija(text, text, text, date, boolean) from public, anon, authenticated;
grant execute on function public.cuota_cubre_plaza_fija(text, text, text, date, boolean) to service_role;
revoke all on function public.reservas_plaza_fija_sin_cuota(text, text) from public, anon, authenticated;
grant execute on function public.reservas_plaza_fija_sin_cuota(text, text) to service_role;
revoke all on function public.materializar_plazas_fijas(integer, text) from public, anon, authenticated;
grant execute on function public.materializar_plazas_fijas(integer, text) to service_role;
