-- Series de clases: avisos antes de que terminen y renovación automática (PR-B).
--
-- El PR-A (20260915094528) dejó la renovación a mano y la línea de la bandeja.
-- Esto añade lo que protege de verdad contra el olvido:
--
--  · Un barrido diario (pg_cron → /api/cron/series-renovacion, 7:00 UTC):
--    renueva las series con `renovacion_automatica` cuando les queda un mes y
--    avisa de las demás. Escalado para no molestar: a 30 días solo la bandeja;
--    a 14, push; a 7 y al terminar sin renovar, push + email. Un aviso por
--    estudio al día con todas las clases juntas.
--  · `series.aviso_tramo` / `aviso_fin`: el último tramo avisado de cada serie
--    y a qué fecha de fin se refería. Así cada serie avisa una vez por tramo, y
--    al renovarse (cambia la fecha de fin) empieza de cero.
--  · `series_por_renovar` devuelve también la automática y el último aviso
--    (cambia su RETURNS TABLE: se borra y se vuelve a crear, con sus grants).
--  · `renovar_serie` devuelve también si la serie se renueva sola, y con origen
--    'automatica' comprueba con la fila bloqueada que siga activada.

alter table public.series
  add column if not exists aviso_tramo text,
  add column if not exists aviso_fin date;

alter table public.series drop constraint if exists series_aviso_tramo;
alter table public.series add constraint series_aviso_tramo
  check (aviso_tramo is null or aviso_tramo in ('aviso14', 'aviso7', 'final'));

comment on column public.series.aviso_tramo is
  'Último aviso enviado de que la serie se acaba (aviso14, aviso7, final). Va con aviso_fin.';
comment on column public.series.aviso_fin is
  'Fecha de fin a la que se refería el último aviso: si la serie se renueva, cambia y los avisos empiezan de cero.';

-- ── Renovar: igual que en el PR-A, y dice si la serie se renueva sola ───────
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

-- ── Las que terminan pronto, con la automática y el último aviso ────────────
drop function if exists public.series_por_renovar(text, integer);
create function public.series_por_renovar(p_studio_id text, p_dias integer default 30)
 returns table(
   serie_id text, ultima_fecha date, dia_semana integer, hora time, sala_id text, tipo_clase_id text,
   instructor_id text, aforo integer, periodo integer, semanas_periodo integer, plazas_fijas integer,
   terminada boolean, renovacion_automatica boolean, aviso_tramo text, aviso_fin date
 )
 language plpgsql
 stable
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_hoy date := (now() at time zone 'Europe/Madrid')::date;
begin
  return query
  with ultimas as (
    select se.id as sid, se.semanas_periodo as sem, se.renovacion_automatica as auto,
           se.aviso_tramo as tramo, se.aviso_fin as afin,
           max((s.inicio at time zone 'Europe/Madrid')::date) filter (where not coalesce(s.cancelada, false)) as viva
      from public.series se
      join public.sesiones s on s.serie_id = se.id and s.studio_id = se.studio_id
     where se.studio_id = p_studio_id and not se.no_renovar
     group by se.id, se.semanas_periodo, se.renovacion_automatica, se.aviso_tramo, se.aviso_fin
  ),
  candidatas as (
    select u.sid, u.sem, u.auto, u.tramo, u.afin, u.viva
      from ultimas u
     where u.viva is not null
       and u.viva between v_hoy - 14 and v_hoy + p_dias
       and (select count(*) from public.sesiones c
             where c.serie_id = u.sid and c.studio_id = p_studio_id and coalesce(c.cancelada, false)
               and (c.inicio at time zone 'Europe/Madrid')::date > u.viva) < 2
  ),
  con_plantilla as (
    select c.sid, c.sem, c.auto, c.tramo, c.afin, c.viva, pl.inicio as pl_inicio, pl.sala_id as pl_sala,
           pl.tipo_clase_id as pl_tipo, pl.instructor_id as pl_instructora, pl.aforo_maximo as pl_aforo
      from candidatas c
      cross join lateral (
        select s.* from public.sesiones s
         where s.serie_id = c.sid and s.studio_id = p_studio_id and not coalesce(s.cancelada, false)
         order by s.inicio desc limit 1
      ) pl
  )
  select cp.sid,
         cp.viva,
         extract(dow from cp.pl_inicio at time zone 'Europe/Madrid')::integer,
         (cp.pl_inicio at time zone 'Europe/Madrid')::time,
         cp.pl_sala,
         cp.pl_tipo,
         cp.pl_instructora,
         cp.pl_aforo,
         (select coalesce(max(p.periodo), 1) from public.series_periodos p where p.serie_id = cp.sid)::integer,
         cp.sem,
         (select count(*) from public.plazas_fijas pf
           where pf.studio_id = p_studio_id and pf.estado = 'ACTIVA' and pf.sala_id = cp.pl_sala
             and pf.dia_semana = extract(dow from cp.pl_inicio at time zone 'Europe/Madrid')
             and pf.hora_inicio = (cp.pl_inicio at time zone 'Europe/Madrid')::time
             and (pf.tipo_clase_id is null or pf.tipo_clase_id = cp.pl_tipo)
             and (pf.vigencia_hasta is null or pf.vigencia_hasta > cp.viva))::integer,
         cp.viva < v_hoy,
         cp.auto,
         cp.tramo,
         cp.afin
    from con_plantilla cp
   where not exists (
     select 1 from public.sesiones o
      where o.studio_id = p_studio_id and o.sala_id = cp.pl_sala
        and not coalesce(o.cancelada, false)
        and o.serie_id is distinct from cp.sid
        and (o.inicio at time zone 'Europe/Madrid')::date > cp.viva
        and (o.inicio at time zone 'Europe/Madrid')::date <= cp.viva + 14
        and extract(dow from o.inicio at time zone 'Europe/Madrid') = extract(dow from cp.pl_inicio at time zone 'Europe/Madrid')
        and (o.inicio at time zone 'Europe/Madrid')::time = (cp.pl_inicio at time zone 'Europe/Madrid')::time
   )
   order by cp.viva, cp.sid;
end;
$function$;

revoke all on function public.series_por_renovar(text, integer) from public, anon, authenticated;
grant execute on function public.series_por_renovar(text, integer) to service_role;

-- ── Barrido diario ──────────────────────────────────────────────────────────
-- Mismo patrón que notif-trial / notif-bonos (bucket A): pg_cron + pg_net con el
-- secreto de Vault. A las 7:00 UTC (9:00 en Madrid): los avisos llegan por la
-- mañana, no de madrugada.
select cron.schedule(
  'series-renovacion',
  '0 7 * * *',
  $$
  select net.http_post(
    url := 'https://www.tentare.app/api/cron/series-renovacion',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
