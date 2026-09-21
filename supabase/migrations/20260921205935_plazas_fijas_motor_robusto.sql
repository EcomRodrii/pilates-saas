-- ─────────────────────────────────────────────────────────────────────────────
-- Plazas fijas: el motor que las reserva, más robusto.
--
-- Una auditoría del sistema de plazas fijas (21-sep) y su reproducción con datos
-- sintéticos —dentro de una transacción que se deshace— dejó tres fallos reales
-- del motor `materializar_plazas_fijas`:
--
--  B1 · La plaza fija no APARTA su sitio. El motor solo rellena huecos cuando
--       corre (cada noche, 42 días por delante), y ningún estudio limita hoy la
--       antelación de reserva: una clase de dentro de tres meses se puede llenar
--       con reservas normales antes de que el motor llegue a ella, y la alumna
--       con plaza fija se queda sin su sitio, en silencio.
--  B2 · Cancelar una reserva NORMAL en el hueco de una plaza fija la regenera
--       como plaza fija a la noche siguiente: el motor solo respetaba las
--       cancelaciones de reservas `res-pf-…`, no las que ella hizo a mano.
--  B3 · El motor no mira solapes: si la alumna ya tiene otra clase (o cita) a esa
--       hora, le reserva la plaza fija igualmente y queda en dos sitios a la vez.
--       Tampoco comprobaba que el sitio numerado de la plaza siguiera activo.
--
-- Qué hace esta migración, sin cambiar ninguna firma pública:
--
--  1. El motor se escribe UNA vez, en `materializar_plazas_fijas_interno`, con dos
--     filtros nuevos (un horizonte que puede ser ilimitado y una lista de sesiones).
--     `materializar_plazas_fijas(int, text)` —la que llaman el cron y la app— pasa
--     a ser un envoltorio de una línea: mantiene su firma y, con ella, sus permisos.
--  2. B2: una cancelación respeta la regeneración sea cual sea el origen de la
--     reserva cancelada (`plaza_fija_retirada` sigue siendo la excepción: es cómo
--     el sistema suelta una plaza al pausarla o darla de baja).
--  3. B3: el motor se salta la sesión que se solapa con otra clase o cita de la
--     alumna (`socio_tiene_conflicto_horario`, la misma regla que ya usan
--     `reservar_plaza` y la promoción de la lista de espera), y no asigna un sitio
--     numerado inactivo. `plazas_fijas_sin_materializar` gana el motivo
--     `conflicto_horario`, para que se le AVISE en vez de que falle en silencio.
--  4. B1: al CREAR sesiones, sus plazas fijas se reservan en ese mismo instante
--     (`trg_materializar_plazas_fijas_sesiones_nuevas`, con el mismo patrón que
--     `trg_registrar_series_nuevas`): la plaza ocupa un sitio real desde que existe
--     la clase, no desde que entra en el horizonte de la noche. Crear una clase
--     NUNCA falla por esto: cualquier error queda en un aviso y el barrido de la
--     noche lo recoge.
--
-- Sin cambios de tablas ni de RLS. Grants: las cuatro funciones quedan cerradas a
-- `service_role` por escrito (ver el gotcha de `pg_default_acl`). En las dos que ya
-- existían es lo mismo que tenían —`CREATE OR REPLACE` con la misma firma conserva
-- los permisos—, dicho explícitamente para que la migración no dependa de eso.
-- ─────────────────────────────────────────────────────────────────────────────

-- ═══ 1 · El motor, una sola vez ══════════════════════════════════════════════

create or replace function public.materializar_plazas_fijas_interno(
  p_horizonte_dias integer,
  p_plaza_id       text,
  p_sesion_ids     text[]
) returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_creadas int;
begin
  -- Las sesiones que van a tocarse, bloqueadas en orden fijo (el mismo criterio que
  -- `reservar_plaza`: nadie las cuenta a medias). `no key update` y no `update`: sigue
  -- serializando con `reservar_plaza` (que pide `for update`) y con un DELETE, pero no
  -- hace esperar a quien solo inserta una reserva (su FK pide `for key share`).
  --
  -- ⚠️ `ses` parte SIEMPRE de las sesiones (materializada = planificada aparte): con
  -- una lista de ids el planificador prefería recorrer cada plaza y visitar todas las
  -- sesiones de su sala, y el coste dejaba de depender de cuántas sesiones son nuevas.
  perform 1 from sesiones s
   where s.id in (
     with ses as materialized (
       select s2.* from sesiones s2
        where coalesce(s2.cancelada, false) = false
          and s2.inicio >= now()
          and (p_horizonte_dias is null or s2.inicio < now() + make_interval(days => p_horizonte_dias))
          and (p_sesion_ids is null or s2.id = any(p_sesion_ids))
          and s2.sala_id in (
            select pf0.sala_id from plazas_fijas pf0
            where pf0.estado = 'ACTIVA' and (p_plaza_id is null or pf0.id = p_plaza_id)
          )
     )
     select ss.id
     from plazas_fijas pf
     join ses ss
       on ss.studio_id = pf.studio_id
      and ss.sala_id = pf.sala_id
      and extract(dow from ss.inicio at time zone 'Europe/Madrid') = pf.dia_semana
      and (ss.inicio at time zone 'Europe/Madrid')::time = pf.hora_inicio
     where pf.estado = 'ACTIVA'
       and (p_plaza_id is null or pf.id = p_plaza_id)
   )
   order by s.id
   for no key update;

  with ses as materialized (
    select s0.* from sesiones s0
     where coalesce(s0.cancelada, false) = false
       and s0.inicio >= now()
       and (p_horizonte_dias is null or s0.inicio < now() + make_interval(days => p_horizonte_dias))
       and (p_sesion_ids is null or s0.id = any(p_sesion_ids))
       and s0.sala_id in (
         select pf0.sala_id from plazas_fijas pf0
         where pf0.estado = 'ACTIVA' and (p_plaza_id is null or pf0.id = p_plaza_id)
       )
  ),
  matches as (
    select
      pf.id         as plaza_id,
      pf.studio_id,
      pf.socio_id,
      pf.creada_en,
      s.id          as sesion_id,
      -- El sitio numerado de la plaza, solo si sigue libre en esa clase Y activo:
      -- un sitio dado de baja no se asigna (antes se reservaba igualmente).
      case when pf.spot_id is not null
            and exists (
              select 1 from spots sp
              where sp.id = pf.spot_id and coalesce(sp.activo, true)
            )
            and not exists (
              select 1 from reservas r3
              where r3.sesion_id = s.id and r3.spot_id = pf.spot_id
                and r3.estado in ('CONFIRMADA','ASISTIDA')
            ) then pf.spot_id else null end as spot_asignado,
      row_number() over (partition by pf.socio_id, s.id order by pf.creada_en, pf.id) as rn_dup
    from plazas_fijas pf
    join ses s
      on s.studio_id = pf.studio_id
     and s.sala_id = pf.sala_id
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
      -- La regla de la cuota, en su función (la comparte el barrido).
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
      -- B2 · Si esa semana la canceló ella —una reserva de plaza fija o una hecha a
      -- mano en su hueco—, no se le vuelve a reservar. Solo `plaza_fija_retirada`
      -- (así suelta el sistema una plaza al pausarla o darla de baja) permite
      -- volver a reservarla al reactivarla.
      and not exists (
        select 1 from reservas r5
        where r5.sesion_id = s.id and r5.socio_id = pf.socio_id
          and r5.estado = 'CANCELADA'
          and r5.cancelada_motivo is distinct from 'plaza_fija_retirada'
      )
      -- B3 · Ni una clase que se solape con otra clase o cita suya: la misma regla
      -- que ya aplican `reservar_plaza` y la promoción de la lista de espera.
      and not public.socio_tiene_conflicto_horario(pf.studio_id, pf.socio_id, s.id, s.inicio, s.fin)
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

-- Solo el servidor (cron y rutas con service_role) y el disparador de más abajo.
revoke all on function public.materializar_plazas_fijas_interno(integer, text, text[]) from public;
revoke all on function public.materializar_plazas_fijas_interno(integer, text, text[]) from anon;
revoke all on function public.materializar_plazas_fijas_interno(integer, text, text[]) from authenticated;
grant execute on function public.materializar_plazas_fijas_interno(integer, text, text[]) to service_role;

-- La de siempre, con la firma de siempre (y, con ella, sus permisos): ahora solo
-- delega. Sin `p_sesion_ids`, y con el horizonte que le pase quien llama.
create or replace function public.materializar_plazas_fijas(
  p_horizonte_dias integer default 42,
  p_plaza_id       text    default null
) returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  -- Antes, un horizonte NULL no reservaba nada (`inicio < NULL`). El motor interno lo
  -- lee como «sin límite»; aquí se conserva lo de siempre.
  if p_horizonte_dias is null then
    return 0;
  end if;
  return public.materializar_plazas_fijas_interno(p_horizonte_dias, p_plaza_id, null);
end;
$function$;

-- Mismos permisos que ya tenía (solo servidor), dichos por escrito: no cambian nada
-- —CREATE OR REPLACE con la misma firma los conserva— pero la migración no depende
-- de esa sutileza y `has_function_privilege` lo confirma tras aplicarla.
revoke all on function public.materializar_plazas_fijas(integer, text) from public;
revoke all on function public.materializar_plazas_fijas(integer, text) from anon;
revoke all on function public.materializar_plazas_fijas(integer, text) from authenticated;
grant execute on function public.materializar_plazas_fijas(integer, text) to service_role;

-- ═══ 2 · El aviso de lo que no se pudo reservar: mismas reglas, un motivo más ════

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
      -- Se solapa con otra clase o cita suya: el motor no se la reserva, y ella lo tiene que saber.
      public.socio_tiene_conflicto_horario(pf.studio_id, pf.socio_id, s.id, s.inicio, s.fin) as con_conflicto,
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
     -- En pausa no se le iba a reservar nada: no hay nada de lo que avisarla.
     and not (pf.pausa_desde is not null
              and (s.inicio at time zone 'Europe/Madrid')::date between pf.pausa_desde and pf.pausa_hasta)
    where pf.estado = 'ACTIVA'
      and not exists (
        select 1 from reservas r
        where r.sesion_id = s.id and r.socio_id = pf.socio_id
          and r.estado in ('CONFIRMADA','LISTA_ESPERA','ASISTIDA','PENDIENTE_APROBACION')
      )
      -- B2, igual que en el motor: lo que ella canceló no es un hueco de lo que avisar.
      and not exists (
        select 1 from reservas r5
        where r5.sesion_id = s.id and r5.socio_id = pf.socio_id
          and r5.estado = 'CANCELADA'
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
    where not d.sesion_cancelada and not d.sin_plan_vigente and not d.sin_autorizacion and not d.con_conflicto
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
  select d.plaza_id, d.studio_id, d.socio_id, d.sesion_id, 'conflicto_horario'::text as motivo
  from dedupadas d where not d.sesion_cancelada and not d.sin_plan_vigente and not d.sin_autorizacion and d.con_conflicto
  union all
  select h.plaza_id, h.studio_id, h.socio_id, h.sesion_id, 'sin_aforo'::text as motivo
  from sin_hueco h where h.rn > h.huecos;
end;
$function$;

revoke all on function public.plazas_fijas_sin_materializar(integer) from public;
revoke all on function public.plazas_fijas_sin_materializar(integer) from anon;
revoke all on function public.plazas_fijas_sin_materializar(integer) from authenticated;
grant execute on function public.plazas_fijas_sin_materializar(integer) to service_role;

-- ═══ 3 · B1: al crear una clase, su plaza fija se reserva en ese momento ═════════

-- Horizonte de esta pasada: 180 días (a partir de ahí lo recoge el barrido de la
-- noche cuando la clase entre en su horizonte). Mismo patrón que
-- `registrar_series_nuevas`: por sentencia y con la tabla de transición.
create or replace function public.materializar_plazas_fijas_sesiones_nuevas()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_ids text[];
begin
  -- Solo las sesiones nuevas de una sala que tenga alguna plaza fija activa: el caso
  -- común (un estudio sin plazas fijas, o una clase en otra sala) no cuesta nada, y
  -- lo que sí cuesta depende de cuántas sesiones son NUEVAS, no de la plataforma.
  select coalesce(array_agg(n.id), '{}') into v_ids
  from nuevas n
  where n.sala_id is not null and coalesce(n.cancelada, false) = false
    and exists (
      select 1 from plazas_fijas pf
      where pf.estado = 'ACTIVA' and pf.studio_id = n.studio_id and pf.sala_id = n.sala_id
    );

  if array_length(v_ids, 1) is null then
    return null;
  end if;

  begin
    perform public.materializar_plazas_fijas_interno(180, null, v_ids);
  exception when others then
    -- ⚠️ Crear una clase NO puede fallar por esto. El bloque hace de savepoint: si
    -- algo revienta, no queda nada a medias y el barrido de la noche lo recoge. (Un
    -- statement_timeout NO lo captura ningún `when others`: por eso el trabajo de
    -- arriba está acotado a las sesiones nuevas y no crece con la plataforma.)
    raise warning 'materializar_plazas_fijas_sesiones_nuevas: % (%)', sqlerrm, sqlstate;
  end;

  return null;
end;
$function$;

revoke all on function public.materializar_plazas_fijas_sesiones_nuevas() from public;
revoke all on function public.materializar_plazas_fijas_sesiones_nuevas() from anon;
revoke all on function public.materializar_plazas_fijas_sesiones_nuevas() from authenticated;
grant execute on function public.materializar_plazas_fijas_sesiones_nuevas() to service_role;

drop trigger if exists trg_materializar_plazas_fijas_sesiones_nuevas on public.sesiones;
create trigger trg_materializar_plazas_fijas_sesiones_nuevas
  after insert on public.sesiones
  referencing new table as nuevas
  for each statement
  execute function public.materializar_plazas_fijas_sesiones_nuevas();
