-- Renovar una serie no crea clases en los días de cierre del centro.
--
-- `renovar_serie` (20260915122409) alargaba la serie semana a semana sin mirar
-- `cierres_estudio`. Reservar (`reservar_plaza`) y el motor de plazas fijas ya
-- se saltan esos días (`fecha_en_cierre`, 20260905153105 y 20260907152834),
-- pero la clase aparecía igual en el calendario y en la app de las alumnas un
-- día que el estudio ya dijo que no abre — y la renovación automática la
-- volvía a crear sola cada vez.
--
-- Ahora esa fecha se omite con el motivo 'cierre', igual que 'ya_existe' y
-- 'sala_ocupada': la simulación lo enseña antes de renovar y el período lo
-- guarda en `series_periodos.omitidas`.
--
-- Mismo cuerpo que 20260915122409 salvo el bloque marcado. Misma firma →
-- conserva los grants; aun así se re-declaran igual y se verifican con
-- has_function_privilege tras aplicar.

create or replace function public.renovar_serie(
  p_studio_id text,
  p_serie_id text,
  p_periodo_visto integer,
  p_semanas integer,
  p_actor uuid default null,
  p_origen text default 'manual',
  p_simular boolean default false
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_tz constant text := 'Europe/Madrid';
  v_serie public.series%rowtype;
  v_periodo integer;
  v_semanas integer;
  v_ultima_fecha date;
  v_dia record;
  v_plantilla public.sesiones%rowtype;
  v_instructora text;
  v_titular text;
  v_ref_id text;
  v_hora time;
  v_duracion interval;
  v_fecha date;
  v_inicio timestamptz;
  v_constraint text;
  v_creadas integer := 0;
  v_omitidas jsonb := '[]'::jsonb;
  v_sin_instructora jsonb := '[]'::jsonb;
  v_instructora_inactiva boolean := false;
  v_plazas integer := 0;
  v_plazas_ids text[] := '{}';
  v_ids_dia text[];
  v_n integer;
  v_desde date;
  v_hasta date;
  v_res jsonb;
  v_dias_semana integer;
  i integer;
begin
  if p_origen not in ('manual', 'automatica') then
    raise exception 'ORIGEN_INVALIDO';
  end if;

  select * into v_serie from public.series where id = p_serie_id and studio_id = p_studio_id for update;
  if not found then
    raise exception 'SERIE_NO_ENCONTRADA';
  end if;

  -- La renovación automática se vuelve a comprobar con la fila ya bloqueada:
  -- si alguien la quita o marca «no renovar» mientras corre el barrido, no se
  -- renueva (y no se deshace esa decisión poniendo `no_renovar` a false).
  if p_origen = 'automatica' and (not v_serie.renovacion_automatica or v_serie.no_renovar) then
    raise exception 'SIN_RENOVACION_AUTOMATICA';
  end if;

  v_semanas := coalesce(p_semanas, v_serie.semanas_periodo);
  if v_semanas < 1 or v_semanas > 104 then
    raise exception 'SEMANAS_INVALIDAS';
  end if;

  select coalesce(max(p.periodo), 0) into v_periodo from public.series_periodos p where p.serie_id = p_serie_id;

  if p_periodo_visto is not null and v_periodo > p_periodo_visto then
    select jsonb_build_object(
             'estado', 'ya_renovada', 'periodo', p.periodo, 'desde', p.desde, 'hasta', p.hasta,
             'creadas', p.sesiones_creadas, 'omitidas', p.omitidas, 'semanas', v_semanas,
             'renovacion_automatica', v_serie.renovacion_automatica)
      into v_res
      from public.series_periodos p where p.serie_id = p_serie_id and p.periodo = v_periodo;
    return v_res;
  end if;

  select max((s.inicio at time zone v_tz)::date) into v_ultima_fecha
    from public.sesiones s where s.serie_id = p_serie_id and s.studio_id = p_studio_id;
  if v_ultima_fecha is null then
    raise exception 'SERIE_SIN_CLASES';
  end if;

  select count(distinct extract(dow from s.inicio at time zone v_tz)) into v_dias_semana
    from public.sesiones s
   where s.serie_id = p_serie_id and s.studio_id = p_studio_id
     and (s.inicio at time zone v_tz)::date > v_ultima_fecha - 7;
  if v_semanas * v_dias_semana > 400 then
    raise exception 'DEMASIADAS_CLASES';
  end if;

  begin
    for v_dia in
      select extract(dow from s.inicio at time zone v_tz)::int as dow,
             max((s.inicio at time zone v_tz)::date) as ultima
        from public.sesiones s
       where s.serie_id = p_serie_id and s.studio_id = p_studio_id
         and (s.inicio at time zone v_tz)::date > v_ultima_fecha - 7
       group by 1
       order by 2
    loop
      select s.* into v_plantilla
        from public.sesiones s
       where s.serie_id = p_serie_id and s.studio_id = p_studio_id
         and coalesce(s.cancelada, false) = false
         and extract(dow from s.inicio at time zone v_tz)::int = v_dia.dow
       order by s.inicio desc
       limit 1;
      if not found then
        continue;
      end if;

      select s.id, s.instructor_id into v_ref_id, v_instructora
        from public.sesiones s
       where s.serie_id = p_serie_id and s.studio_id = p_studio_id
         and coalesce(s.cancelada, false) = false and s.instructor_id is not null
         and extract(dow from s.inicio at time zone v_tz)::int = v_dia.dow
       order by s.inicio desc
       limit 1;
      if v_ref_id is not null then
        select su.instructor_original_id into v_titular
          from public.sustituciones su
         where su.sesion_id = v_ref_id and su.estado = 'confirmada'
         order by su.resuelto_en desc nulls last
         limit 1;
        if v_titular is not null then
          v_instructora := v_titular;
        end if;
      end if;
      v_titular := null;
      v_ref_id := null;
      if v_instructora is not null and not exists (
        select 1 from public.instructores ins
         where ins.id = v_instructora and ins.studio_id = p_studio_id and coalesce(ins.activo, true)
      ) then
        v_instructora := null;
        v_instructora_inactiva := true;
      end if;

      v_hora := (v_plantilla.inicio at time zone v_tz)::time;
      v_duracion := v_plantilla.fin - v_plantilla.inicio;

      select count(*), coalesce(array_agg(pf.id), '{}') into v_n, v_ids_dia
        from public.plazas_fijas pf
       where pf.studio_id = p_studio_id and pf.estado = 'ACTIVA'
         and pf.sala_id = v_plantilla.sala_id and pf.dia_semana = v_dia.dow and pf.hora_inicio = v_hora
         and (pf.tipo_clase_id is null or pf.tipo_clase_id = v_plantilla.tipo_clase_id)
         and (pf.vigencia_hasta is null or pf.vigencia_hasta > v_dia.ultima);
      v_plazas := v_plazas + v_n;
      v_plazas_ids := v_plazas_ids || v_ids_dia;

      for i in 1..v_semanas loop
        v_fecha := v_dia.ultima + 7 * i;
        v_inicio := (v_fecha + v_hora) at time zone v_tz;
        v_desde := least(coalesce(v_desde, v_fecha), v_fecha);
        v_hasta := greatest(coalesce(v_hasta, v_fecha), v_fecha);

        -- NUEVO: día de cierre del centro. No se crea la clase; reservar y las
        -- plazas fijas ya se saltaban ese día, el calendario no.
        if public.fecha_en_cierre(p_studio_id, v_fecha) then
          v_omitidas := v_omitidas || jsonb_build_object('fecha', v_fecha, 'motivo', 'cierre');
          continue;
        end if;

        if exists (
          select 1 from public.sesiones s2
           where s2.studio_id = p_studio_id and s2.inicio = v_inicio
             and s2.sala_id is not distinct from v_plantilla.sala_id
             and coalesce(s2.cancelada, false) = false
        ) then
          v_omitidas := v_omitidas || jsonb_build_object('fecha', v_fecha, 'motivo', 'ya_existe');
          continue;
        end if;

        begin
          insert into public.sesiones (id, studio_id, tipo_clase_id, sala_id, instructor_id, inicio, fin,
                                       aforo_maximo, cancelada, notas, precio_puntual, serie_id)
          values ('ses-' || gen_random_uuid()::text, p_studio_id, v_plantilla.tipo_clase_id, v_plantilla.sala_id,
                  v_instructora, v_inicio, v_inicio + v_duracion, v_plantilla.aforo_maximo, false,
                  v_plantilla.notas, v_plantilla.precio_puntual, p_serie_id);
          v_creadas := v_creadas + 1;
        exception when exclusion_violation then
          get stacked diagnostics v_constraint = constraint_name;
          if v_constraint = 'sesiones_instructor_sin_solape' then
            begin
              insert into public.sesiones (id, studio_id, tipo_clase_id, sala_id, instructor_id, inicio, fin,
                                           aforo_maximo, cancelada, notas, precio_puntual, serie_id)
              values ('ses-' || gen_random_uuid()::text, p_studio_id, v_plantilla.tipo_clase_id, v_plantilla.sala_id,
                      null, v_inicio, v_inicio + v_duracion, v_plantilla.aforo_maximo, false,
                      v_plantilla.notas, v_plantilla.precio_puntual, p_serie_id);
              v_creadas := v_creadas + 1;
              v_sin_instructora := v_sin_instructora || to_jsonb(v_fecha);
            exception when exclusion_violation then
              v_omitidas := v_omitidas || jsonb_build_object('fecha', v_fecha, 'motivo', 'sala_ocupada');
            end;
          else
            v_omitidas := v_omitidas || jsonb_build_object('fecha', v_fecha, 'motivo', 'sala_ocupada');
          end if;
        end;
      end loop;
    end loop;

    if v_desde is null then
      raise exception 'SERIE_SIN_CLASES';
    end if;

    v_res := jsonb_build_object(
      'estado', case when p_simular then 'simulacion' when v_creadas = 0 then 'sin_cambios' else 'renovada' end,
      'periodo_actual', v_periodo, 'periodo', v_periodo + 1, 'semanas', v_semanas,
      'desde', v_desde, 'hasta', v_hasta, 'creadas', v_creadas, 'omitidas', v_omitidas,
      'sin_instructora', v_sin_instructora, 'instructora_inactiva', v_instructora_inactiva,
      'plazas_fijas', v_plazas, 'plazas_fijas_ids', to_jsonb(v_plazas_ids),
      'renovacion_automatica', v_serie.renovacion_automatica);

    if p_simular then
      raise exception using errcode = 'TSIMU', message = 'SIMULACION';
    end if;
  exception when sqlstate 'TSIMU' then
    return v_res;
  end;

  if v_creadas > 0 then
    insert into public.series_periodos (serie_id, periodo, studio_id, desde, hasta, origen, creado_por, sesiones_creadas, omitidas)
    values (p_serie_id, v_periodo + 1, p_studio_id, v_desde, v_hasta, p_origen, p_actor, v_creadas, v_omitidas);
    update public.series set semanas_periodo = v_semanas, no_renovar = false where id = p_serie_id;
  end if;

  return v_res;
end;
$function$;

revoke all on function public.renovar_serie(text, text, integer, integer, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.renovar_serie(text, text, integer, integer, uuid, text, boolean) to service_role;
