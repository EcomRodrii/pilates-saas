-- «Repetir este mes» (P1.7, 12-oct-2026): `renovar_serie` aprende a llegar
-- hasta un día concreto y a crear solo las fechas que la propietaria marcó.
--
-- Por qué ampliar la función y no escribir otra: «qué clases crea una serie»
-- tiene UN dueño (tentare-os: un dueño por hecho de negocio). La plantilla, la
-- instructora titular, saltarse los cierres, lo que ya existe y la sala ocupada
-- viven aquí; una segunda función tendría que copiarlas, y la próxima regla de
-- omisión (como fue 'cierre' el 15-sep) habría que escribirla dos veces.
--
-- Dos parámetros nuevos, los dos con valor por defecto null:
--   p_hasta  → cada día de la semana de la serie, desde su última clase + 7
--              hasta este día (en vez de p_semanas iguales para todos).
--   p_fechas → de esas, solo estas. Las demás se omiten como 'excluida'.
-- Y en los DOS modos, una fecha desmarcada al repetir ('excluida' en el último
-- período) cuenta como la última de su día de la semana: si no, la renovación
-- siguiente perdía ese día de la semana y volvía a crear la fecha desmarcada.
-- Como 'excluida' solo existe desde aquí, con los datos de antes no cambia nada.
-- En ese modo, además: una fecha pasada se omite como 'pasada'; una pedida que
-- la serie no tiene, como 'fuera_de_serie'; no se toca la fila de `series`
-- (ni su tramo ni su «no renovar»), y el resultado trae `fechas` y
-- `creadas_ids`. Con los dos a null, el cuerpo hace y devuelve EXACTAMENTE lo
-- de 20260915172901: lo fija supabase/tests/renovar-serie-hasta.test.ts.
--
-- Las alumnas con clase fija siguen en sus clases sin hacer nada aquí: el
-- trigger `trg_materializar_plazas_fijas_sesiones_nuevas` las reserva en
-- cualquier sesión nueva (y la ruta vuelve a pasar el motor, como al renovar).
--
-- ⚠️ Escrita el 12-oct-2026 y SIN APLICAR (encargo del fundador). Mientras no
-- esté aplicada, «Repetir este mes» no se ofrece: la ruta lo comprueba con una
-- sonda. Al aplicarla, renombrar el fichero a la versión aplicada y cruzar por
-- NOMBRE (.claude/tentare-os.md).

-- Guarda: el cuerpo que se reemplaza es el de 20260915172901, el mismo que
-- había en producción el 12-oct-2026 (md5 comprobado en solo lectura). Si
-- alguien lo ha cambiado desde entonces, no se pisa a ciegas.
do $$
declare v_md5 text;
begin
  select md5(p.prosrc) into v_md5 from pg_proc p
   where p.oid = 'public.renovar_serie(text, text, integer, integer, uuid, text, boolean)'::regprocedure;
  if v_md5 is distinct from '92c72ae5cd6b4e69bcdca64e484d3f89' then
    raise exception 'renovar_serie ha cambiado desde 20260915172901 (md5 %): revisar antes de aplicar', v_md5;
  end if;
end $$;

-- Con las dos firmas vivas, PostgREST no sabría a cuál llamar (PGRST203). Los
-- dos llamadores (app/api/series/renovar y lib/series/avisos-cron) usan
-- argumentos con nombre y siguen resolviendo a la nueva.
drop function public.renovar_serie(text, text, integer, integer, uuid, text, boolean);

create function public.renovar_serie(
  p_studio_id text,
  p_serie_id text,
  p_periodo_visto integer,
  p_semanas integer,
  p_actor uuid default null,
  p_origen text default 'manual',
  p_simular boolean default false,
  -- Repetir este mes (12-oct-2026). Los dos a null = la renovación de siempre.
  p_hasta date default null,
  p_fechas date[] default null
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
  -- Repetir este mes.
  v_modo_hasta constant boolean := p_hasta is not null;
  v_n_semanas integer;
  v_hubo_plantilla boolean := false;
  v_iteradas date[] := '{}';
  v_creadas_ids text[] := '{}';
  v_id text;
  v_f date;
  v_excluidas date[] := '{}';
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

  -- Un día que la propietaria desmarcó al repetir (omitido 'excluida' en el
  -- ÚLTIMO período) cuenta como la última clase de ese día de la semana. Sin
  -- esto, desmarcar el último viernes del rango (Navidad) borraba los viernes
  -- de la serie en la renovación siguiente —los días salen de su última
  -- semana—, y esa renovación volvía a crear justo el día desmarcado. El motivo
  -- 'excluida' solo lo escribe «Repetir»: con los períodos de antes no cambia nada.
  select coalesce(array_agg(distinct (o.v->>'fecha')::date), '{}') into v_excluidas
    from public.series_periodos p, jsonb_array_elements(p.omitidas) as o(v)
   where p.serie_id = p_serie_id and p.periodo = v_periodo and o.v->>'motivo' = 'excluida';
  v_ultima_fecha := greatest(v_ultima_fecha, (select max(d) from unnest(v_excluidas) as d));

  select count(distinct x.dow) into v_dias_semana from (
    select extract(dow from s.inicio at time zone v_tz)::int as dow
      from public.sesiones s
     where s.serie_id = p_serie_id and s.studio_id = p_studio_id
       and (s.inicio at time zone v_tz)::date > v_ultima_fecha - 7
    union all
    select extract(dow from d)::int from unnest(v_excluidas) as d where d > v_ultima_fecha - 7
  ) x;
  if not v_modo_hasta and v_semanas * v_dias_semana > 400 then
    raise exception 'DEMASIADAS_CLASES';
  end if;
  -- Repetir: hasta un día concreto, nunca hacia atrás ni a más de 400 días.
  if v_modo_hasta then
    if p_hasta < public.hoy_estudio() or p_hasta > public.hoy_estudio() + 400 then
      raise exception 'HASTA_INVALIDO';
    end if;
    if v_dias_semana * greatest(0, (p_hasta - v_ultima_fecha) / 7) > 400 then
      raise exception 'DEMASIADAS_CLASES';
    end if;
  end if;

  begin
    for v_dia in
      select x.dow, max(x.fecha) as ultima from (
        select extract(dow from s.inicio at time zone v_tz)::int as dow, (s.inicio at time zone v_tz)::date as fecha
          from public.sesiones s
         where s.serie_id = p_serie_id and s.studio_id = p_studio_id
           and (s.inicio at time zone v_tz)::date > v_ultima_fecha - 7
        union all
        select extract(dow from d)::int, d from unnest(v_excluidas) as d where d > v_ultima_fecha - 7
      ) x
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
      v_hubo_plantilla := true;

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

      -- Repetir: cada día de la semana llega hasta p_hasta (diciembre tiene
      -- 4 lunes y 5 martes); la renovación de siempre, p_semanas para todos.
      v_n_semanas := case when v_modo_hasta then greatest(0, (p_hasta - v_dia.ultima) / 7) else v_semanas end;

      for i in 1..v_n_semanas loop
        v_fecha := v_dia.ultima + 7 * i;
        v_inicio := (v_fecha + v_hora) at time zone v_tz;
        v_desde := least(coalesce(v_desde, v_fecha), v_fecha);
        v_hasta := greatest(coalesce(v_hasta, v_fecha), v_fecha);

        -- Repetir: solo las fechas marcadas, y nunca una que ya pasó.
        if v_modo_hasta then
          v_iteradas := v_iteradas || v_fecha;
          if p_fechas is not null and not (v_fecha = any(p_fechas)) then
            v_omitidas := v_omitidas || jsonb_build_object('fecha', v_fecha, 'motivo', 'excluida');
            continue;
          end if;
          if v_fecha < public.hoy_estudio() or v_inicio <= now() then
            v_omitidas := v_omitidas || jsonb_build_object('fecha', v_fecha, 'motivo', 'pasada');
            continue;
          end if;
        end if;

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
                  v_plantilla.notas, v_plantilla.precio_puntual, p_serie_id)
          returning id into v_id;
          v_creadas := v_creadas + 1;
          v_creadas_ids := v_creadas_ids || v_id;
        exception when exclusion_violation then
          get stacked diagnostics v_constraint = constraint_name;
          if v_constraint = 'sesiones_instructor_sin_solape' then
            begin
              insert into public.sesiones (id, studio_id, tipo_clase_id, sala_id, instructor_id, inicio, fin,
                                           aforo_maximo, cancelada, notas, precio_puntual, serie_id)
              values ('ses-' || gen_random_uuid()::text, p_studio_id, v_plantilla.tipo_clase_id, v_plantilla.sala_id,
                      null, v_inicio, v_inicio + v_duracion, v_plantilla.aforo_maximo, false,
                      v_plantilla.notas, v_plantilla.precio_puntual, p_serie_id)
              returning id into v_id;
              v_creadas := v_creadas + 1;
              v_creadas_ids := v_creadas_ids || v_id;
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

    if v_modo_hasta then
      -- Todas las clases canceladas: lo mismo que la renovación de siempre.
      if not v_hubo_plantilla then
        raise exception 'SERIE_SIN_CLASES';
      end if;
      -- Una fecha pedida que esta serie no tiene: se dice, no se crea.
      foreach v_f in array coalesce(p_fechas, '{}'::date[]) loop
        if not (v_f = any(v_iteradas)) then
          v_omitidas := v_omitidas || jsonb_build_object('fecha', v_f, 'motivo', 'fuera_de_serie');
        end if;
      end loop;
    elsif v_desde is null then
      raise exception 'SERIE_SIN_CLASES';
    end if;

    v_res := jsonb_build_object(
      'estado', case when p_simular then 'simulacion' when v_creadas = 0 then 'sin_cambios' else 'renovada' end,
      'periodo_actual', v_periodo, 'periodo', v_periodo + 1, 'semanas', v_semanas,
      'desde', v_desde, 'hasta', v_hasta, 'creadas', v_creadas, 'omitidas', v_omitidas,
      'sin_instructora', v_sin_instructora, 'instructora_inactiva', v_instructora_inactiva,
      'plazas_fijas', v_plazas, 'plazas_fijas_ids', to_jsonb(v_plazas_ids),
      'renovacion_automatica', v_serie.renovacion_automatica);
    -- Repetir: las fechas que la serie tiene en el rango (ConfirmarFechas las
    -- enseña) y las clases creadas (HuellaDeCreacion las señala). Solo en ese
    -- modo: la renovación de siempre devuelve exactamente lo de antes.
    if v_modo_hasta then
      v_res := v_res || jsonb_build_object(
        'fechas', (select coalesce(jsonb_agg(d order by d), '[]'::jsonb) from (select distinct unnest(v_iteradas) as d) x),
        'creadas_ids', to_jsonb(v_creadas_ids));
    end if;

    if p_simular then
      raise exception using errcode = 'TSIMU', message = 'SIMULACION';
    end if;
  exception when sqlstate 'TSIMU' then
    return v_res;
  end;

  if v_creadas > 0 then
    insert into public.series_periodos (serie_id, periodo, studio_id, desde, hasta, origen, creado_por, sesiones_creadas, omitidas)
    values (p_serie_id, v_periodo + 1, p_studio_id, v_desde, v_hasta, p_origen, p_actor, v_creadas, v_omitidas);
    -- Repetir un mes no cambia cómo se renueva la serie: ni su tramo ni su «no renovar».
    if not v_modo_hasta then
      update public.series set semanas_periodo = v_semanas, no_renovar = false where id = p_serie_id;
    end if;
  end if;

  return v_res;
end;
$function$;

-- Firma nueva = objeto nuevo con EXECUTE a PUBLIC por defecto (y pg_default_acl
-- lo da directo a anon/authenticated): los tres pasos, y comprobado.
revoke all on function public.renovar_serie(text, text, integer, integer, uuid, text, boolean, date, date[]) from public, anon, authenticated;
grant execute on function public.renovar_serie(text, text, integer, integer, uuid, text, boolean, date, date[]) to service_role;

do $$
begin
  if has_function_privilege('anon', 'public.renovar_serie(text, text, integer, integer, uuid, text, boolean, date, date[])', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.renovar_serie(text, text, integer, integer, uuid, text, boolean, date, date[])', 'EXECUTE') then
    raise exception 'renovar_serie quedó ejecutable desde el navegador';
  end if;
  if not has_function_privilege('service_role', 'public.renovar_serie(text, text, integer, integer, uuid, text, boolean, date, date[])', 'EXECUTE') then
    raise exception 'renovar_serie sin EXECUTE para service_role';
  end if;
end $$;
