-- Plaza fija: pausa con fechas (vacaciones, una lesión…).
--
-- Antes solo había PAUSADA, sin fecha de vuelta: alguien tenía que acordarse de
-- reanudarla, y mientras tanto la exclusión GiST de sitios (solo mira ACTIVA)
-- dejaba que otra clienta se quedara su sitio y al volver chocaba. Ahora la
-- plaza sigue ACTIVA, con su sitio, y entre `pausa_desde` y `pausa_hasta` (fecha
-- LOCAL del estudio, los dos días incluidos) el motor no le reserva la clase.
-- Al acabar vuelve sola.
--
--  · `materializar_plazas_fijas` se salta esas fechas.
--  · `plazas_fijas_sin_materializar` tampoco las ve: no hay nada que avisar.
--  · `editar_serie_desde`, al partir una plaza en dos tramos, copia la pausa al
--    tramo nuevo (el que sigue en sitio la conserva sola).
--
-- Mismas firmas: `create or replace` conserva los grants, pero se vuelven a
-- dejar por escrito. Espejo en TS: lib/plazas-fijas-pausa.ts.

alter table public.plazas_fijas
  add column if not exists pausa_desde date,
  add column if not exists pausa_hasta date;

alter table public.plazas_fijas drop constraint if exists plazas_fijas_pausa_rango;
alter table public.plazas_fijas add constraint plazas_fijas_pausa_rango check (
  (pausa_desde is null) = (pausa_hasta is null)
  and (pausa_hasta is null or pausa_hasta >= pausa_desde)
);

comment on column public.plazas_fijas.pausa_desde is
  'Pausa con fechas (incluida): la plaza sigue ACTIVA y con su sitio, pero esas fechas no se materializan.';
comment on column public.plazas_fijas.pausa_hasta is
  'Último día de la pausa (incluido). Va siempre junto a pausa_desde.';

-- ── Motor ───────────────────────────────────────────────────────────────────
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

-- ── Avisos a la socia ───────────────────────────────────────────────────────
-- ⚠️ `returns table` expone plaza_id/studio_id/socio_id/sesion_id/motivo como
-- variables: toda columna con esos nombres va calificada con su alias.
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
     -- En pausa no se le iba a reservar nada: no hay nada de lo que avisarla.
     and not (pf.pausa_desde is not null
              and (s.inicio at time zone 'Europe/Madrid')::date between pf.pausa_desde and pf.pausa_hasta)
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

revoke all on function public.plazas_fijas_sin_materializar(integer) from public, anon, authenticated;
grant execute on function public.plazas_fijas_sin_materializar(integer) to service_role;

-- ── Mover la serie con sus plazas fijas ─────────────────────────────────────
-- Cuerpo vigente sin cambios salvo los dos INSERT del tramo nuevo, que ahora
-- copian `pausa_desde`/`pausa_hasta`: sin eso, editar el horario de la serie a
-- mitad de unas vacaciones le reservaba la clase nueva a quien estaba en pausa.
create or replace function public.editar_serie_desde(p_studio_id text, p_sesion_origen_id text, p_tipo_clase_id text, p_sala_id text, p_instructor_id text, p_aforo_maximo integer, p_notas text, p_hora_inicio text, p_hora_fin text)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_tz     constant text := 'Europe/Madrid';
  v_serie  text;
  v_inicio timestamptz;
  v_count  integer;
  -- plazas fijas
  v_fecha_desde date;
  v_slot        record;
  v_pf          record;
  v_ajenas_desde_cambio boolean;
  v_ajenas_antes_cambio boolean;
  v_nuevo_tipo  text;
  v_nuevo_spot  text;
begin
  perform public.validar_studio_mismatch(p_studio_id);

  select serie_id, inicio into v_serie, v_inicio
    from sesiones
   where id = p_sesion_origen_id and studio_id = p_studio_id;
  if not found then
    raise exception 'SESION_NO_ENCONTRADA';
  end if;

  if p_sala_id is not null and not exists (select 1 from salas where id = p_sala_id and studio_id = p_studio_id) then
    raise exception 'SALA_NO_PERTENECE_AL_STUDIO';
  end if;

  if p_instructor_id is not null and not exists (select 1 from instructores where id = p_instructor_id and studio_id = p_studio_id) then
    raise exception 'INSTRUCTOR_NO_PERTENECE_AL_STUDIO';
  end if;

  if p_tipo_clase_id is not null and not exists (select 1 from tipos_clase where id = p_tipo_clase_id and studio_id = p_studio_id) then
    raise exception 'TIPO_CLASE_NO_PERTENECE_AL_STUDIO';
  end if;

  -- Una instructora solo puede editar SU serie y no puede reasignarla: mismo
  -- criterio que sesiones_escritura_update (20260730109000).
  if not public.es_llamada_servicio() and public.current_rol() = 'INSTRUCTOR' then
    if p_instructor_id is distinct from public.current_instructor_id() then
      raise exception 'NO_AUTORIZADO';
    end if;
    if exists (
      select 1 from sesiones s
      where s.studio_id = p_studio_id
        and s.inicio >= v_inicio
        and (
          (v_serie is not null and s.serie_id = v_serie)
          or (v_serie is null and s.id = p_sesion_origen_id)
        )
        and s.instructor_id is distinct from public.current_instructor_id()
    ) then
      raise exception 'NO_AUTORIZADO';
    end if;
  end if;

  -- ── Plazas fijas ancladas a los slots que se van a mover ──────────────────
  -- Va ANTES del update de sesiones (se necesitan sus valores de ahora, que el
  -- update pisa) y en la misma transacción (ver cabecera). Solo series, y solo
  -- con sala destino: una plaza fija se ancla a una sala (NOT NULL), sin ella
  -- no hay a dónde moverla.
  if v_serie is not null and p_sala_id is not null then
    v_fecha_desde := (v_inicio at time zone v_tz)::date;

    for v_slot in
      select distinct
        s.sala_id,
        (s.inicio at time zone v_tz)::time                       as hora_inicio,
        s.tipo_clase_id,
        extract(dow from s.inicio at time zone v_tz)::smallint   as dia_semana
      from sesiones s
      where s.studio_id = p_studio_id
        and s.inicio >= v_inicio
        and s.sala_id is not null
        and s.serie_id = v_serie
    loop
      -- Sesiones futuras del slot viejo AJENAS a este update (otra serie,
      -- sueltas, o de esta misma serie pero anteriores al origen): son las
      -- que dicen si ese slot sigue teniendo clase, y desde cuándo.
      select
        coalesce(bool_or((s2.inicio at time zone v_tz)::date >= v_fecha_desde), false),
        coalesce(bool_or((s2.inicio at time zone v_tz)::date <  v_fecha_desde), false)
      into v_ajenas_desde_cambio, v_ajenas_antes_cambio
      from sesiones s2
      where s2.studio_id = p_studio_id
        and s2.inicio >= now()
        and coalesce(s2.cancelada, false) = false
        and s2.sala_id = v_slot.sala_id
        and (s2.inicio at time zone v_tz)::time = v_slot.hora_inicio
        and extract(dow from s2.inicio at time zone v_tz) = v_slot.dia_semana
        and (s2.serie_id is distinct from v_serie or s2.inicio < v_inicio);

      -- El slot viejo sigue con clase más allá del cambio: no se toca nada.
      if v_ajenas_desde_cambio then
        continue;
      end if;

      for v_pf in
        select pf.*
        from plazas_fijas pf
        where pf.studio_id = p_studio_id
          and pf.estado in ('ACTIVA', 'PAUSADA')
          and pf.sala_id = v_slot.sala_id
          and pf.dia_semana = v_slot.dia_semana
          and pf.hora_inicio = v_slot.hora_inicio
          and (pf.tipo_clase_id is null or pf.tipo_clase_id = v_slot.tipo_clase_id)
          and (pf.vigencia_hasta is null or pf.vigencia_hasta >= v_fecha_desde)
          -- Solo si el slot cambia DE VERDAD para esta plaza (cambiar solo la
          -- instructora o el aforo no mueve nada).
          and (
            pf.sala_id <> p_sala_id
            or pf.hora_inicio <> p_hora_inicio::time
            or (pf.tipo_clase_id is not null and pf.tipo_clase_id is distinct from p_tipo_clase_id)
          )
        order by pf.creada_en, pf.id
      loop
        v_nuevo_tipo := case when v_pf.tipo_clase_id is null then null else p_tipo_clase_id end;
        v_nuevo_spot := case when v_pf.sala_id = p_sala_id then v_pf.spot_id else null end;

        if v_ajenas_antes_cambio and v_pf.vigencia_desde < v_fecha_desde then
          -- Partir: el tramo viejo termina la víspera; el nuevo hereda estado,
          -- fin de vigencia, pausa y ANTIGÜEDAD.
          update plazas_fijas set vigencia_hasta = v_fecha_desde - 1 where id = v_pf.id;
          begin
            insert into plazas_fijas (id, studio_id, socio_id, dia_semana, hora_inicio, sala_id, tipo_clase_id, spot_id, vigencia_desde, vigencia_hasta, estado, pausa_desde, pausa_hasta, creada_en)
            values ('pf-' || gen_random_uuid()::text, v_pf.studio_id, v_pf.socio_id, v_pf.dia_semana, p_hora_inicio::time, p_sala_id,
                    v_nuevo_tipo, v_nuevo_spot, v_fecha_desde, v_pf.vigencia_hasta, v_pf.estado, v_pf.pausa_desde, v_pf.pausa_hasta, v_pf.creada_en);
          exception when exclusion_violation then
            insert into plazas_fijas (id, studio_id, socio_id, dia_semana, hora_inicio, sala_id, tipo_clase_id, spot_id, vigencia_desde, vigencia_hasta, estado, pausa_desde, pausa_hasta, creada_en)
            values ('pf-' || gen_random_uuid()::text, v_pf.studio_id, v_pf.socio_id, v_pf.dia_semana, p_hora_inicio::time, p_sala_id,
                    v_nuevo_tipo, null, v_fecha_desde, v_pf.vigencia_hasta, v_pf.estado, v_pf.pausa_desde, v_pf.pausa_hasta, v_pf.creada_en);
          end;
        else
          -- En sitio: mismo id, misma antigüedad (y su pausa, que no se toca).
          begin
            update plazas_fijas
               set hora_inicio = p_hora_inicio::time, sala_id = p_sala_id, tipo_clase_id = v_nuevo_tipo, spot_id = v_nuevo_spot
             where id = v_pf.id;
          exception when exclusion_violation then
            update plazas_fijas
               set hora_inicio = p_hora_inicio::time, sala_id = p_sala_id, tipo_clase_id = v_nuevo_tipo, spot_id = null
             where id = v_pf.id;
          end;
        end if;
      end loop;
    end loop;
  end if;

  update sesiones s
     set tipo_clase_id = p_tipo_clase_id,
         sala_id       = p_sala_id,
         instructor_id = p_instructor_id,
         aforo_maximo  = p_aforo_maximo,
         notas         = p_notas,
         inicio        = (((s.inicio at time zone v_tz)::date + p_hora_inicio::time) at time zone v_tz),
         fin           = (((s.inicio at time zone v_tz)::date + p_hora_fin::time)    at time zone v_tz)
   where s.studio_id = p_studio_id
     and s.inicio >= v_inicio
     and (
       (v_serie is not null and s.serie_id = v_serie)
       or (v_serie is null and s.id = p_sesion_origen_id)
     );

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

revoke all on function public.editar_serie_desde(text, text, text, text, text, integer, text, text, text) from public, anon;
grant execute on function public.editar_serie_desde(text, text, text, text, text, integer, text, text, text) to authenticated, service_role;
