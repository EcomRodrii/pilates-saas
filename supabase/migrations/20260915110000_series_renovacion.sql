-- Series de clases: renovarlas antes de que caduquen (PR-A).
--
-- Una clase que se repite son N sesiones sueltas que comparten `serie_id`,
-- generadas de una vez (2–52 semanas, o hasta una fecha). Al llegar la última
-- no pasa nada visible: el calendario se queda vacío en ese hueco y nadie avisa
-- antes. Las plazas fijas NO se pierden (se anclan por hueco, no por serie),
-- pero sin clase no hay reserva.
--
-- Renovar = ALARGAR LA MISMA SERIE (mismo `serie_id`), no crear otra: así
-- «editar o cancelar esta y las siguientes» sigue alcanzando lo renovado y las
-- plazas fijas del hueco continúan solas, con su antigüedad.
--
--  · `series`: una fila por serie (duración del período que puso el estudio,
--    «no renovar»; `renovacion_automatica` la usará el PR-B).
--  · `series_periodos`: el HISTÓRICO. Nunca se toca un período anterior.
--    PK (serie_id, periodo) = la garantía de que un período no se crea dos veces.
--  · Trigger por sentencia: da de alta las series nuevas, las cree quien las
--    cree (formulario, recurrentes, duplicar, onboarding, importador).
--  · `renovar_serie`: todo en una transacción, con la fila de la serie
--    bloqueada. Modo simular para «Revisar antes de renovar».
--  · `series_por_renovar`: las que terminan pronto (bandeja y avisos).
--
-- Escritura solo por servidor (service_role); el panel solo lee su estudio.

create table if not exists public.series (
  id text primary key,
  studio_id text not null references public.studios(id) on delete cascade,
  semanas_periodo integer not null check (semanas_periodo between 1 and 104),
  renovacion_automatica boolean not null default false,
  no_renovar boolean not null default false,
  creada_en timestamptz not null default now()
);
create index if not exists idx_series_studio on public.series (studio_id);

create table if not exists public.series_periodos (
  serie_id text not null references public.series(id) on delete cascade,
  periodo integer not null check (periodo >= 1),
  studio_id text not null references public.studios(id) on delete cascade,
  desde date not null,
  hasta date not null,
  origen text not null check (origen in ('creacion', 'manual', 'automatica')),
  creado_por uuid,
  sesiones_creadas integer not null default 0,
  omitidas jsonb not null default '[]'::jsonb,
  creado_en timestamptz not null default now(),
  primary key (serie_id, periodo),
  constraint series_periodos_rango check (hasta >= desde)
);
create index if not exists idx_series_periodos_studio on public.series_periodos (studio_id);

comment on table public.series is
  'Una fila por sesiones.serie_id. Renovar alarga la misma serie; el histórico vive en series_periodos.';
comment on table public.series_periodos is
  'Histórico de períodos de una serie. PK (serie_id, periodo): un período no se crea dos veces.';

alter table public.series enable row level security;
alter table public.series_periodos enable row level security;

drop policy if exists series_lectura on public.series;
create policy series_lectura on public.series
  for select to authenticated using (studio_id = public.current_studio_id() and public.puede_gestionar_calendario());
drop policy if exists series_periodos_lectura on public.series_periodos;
create policy series_periodos_lectura on public.series_periodos
  for select to authenticated using (studio_id = public.current_studio_id() and public.puede_gestionar_calendario());

revoke all on table public.series from anon;
revoke all on table public.series_periodos from anon;
revoke all on table public.series from authenticated;
revoke all on table public.series_periodos from authenticated;
grant select on table public.series to authenticated;
grant select on table public.series_periodos to authenticated;
grant all on table public.series to service_role;
grant all on table public.series_periodos to service_role;

-- ── Las series que ya existen: período 1 con lo que hay ─────────────────────
insert into public.series (id, studio_id, semanas_periodo, creada_en)
select s.serie_id, min(s.studio_id),
       least(104, greatest(1, ((max((s.inicio at time zone 'Europe/Madrid')::date)
                                - min((s.inicio at time zone 'Europe/Madrid')::date)) / 7) + 1)),
       coalesce(min(s.creado_en), now())
from public.sesiones s
where s.serie_id is not null
group by s.serie_id
on conflict (id) do nothing;

insert into public.series_periodos (serie_id, periodo, studio_id, desde, hasta, origen, sesiones_creadas, creado_en)
select s.serie_id, 1, min(s.studio_id),
       min((s.inicio at time zone 'Europe/Madrid')::date), max((s.inicio at time zone 'Europe/Madrid')::date),
       'creacion', count(*), coalesce(min(s.creado_en), now())
from public.sesiones s
where s.serie_id is not null
group by s.serie_id
on conflict (serie_id, periodo) do nothing;

-- ── Alta de series nuevas ───────────────────────────────────────────────────
-- Por sentencia (una serie de 52 clases entra en UN insert). Las sesiones que
-- añade `renovar_serie` a una serie que ya existe no hacen nada aquí.
create or replace function public.registrar_series_nuevas()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  insert into public.series (id, studio_id, semanas_periodo)
  select n.serie_id, min(n.studio_id),
         least(104, greatest(1, ((max((n.inicio at time zone 'Europe/Madrid')::date)
                                  - min((n.inicio at time zone 'Europe/Madrid')::date)) / 7) + 1))
  from nuevas n
  where n.serie_id is not null
  group by n.serie_id
  on conflict (id) do nothing;

  insert into public.series_periodos (serie_id, periodo, studio_id, desde, hasta, origen, sesiones_creadas)
  select n.serie_id, 1, min(n.studio_id),
         min((n.inicio at time zone 'Europe/Madrid')::date), max((n.inicio at time zone 'Europe/Madrid')::date),
         'creacion', count(*)
  from nuevas n
  where n.serie_id is not null
    and not exists (select 1 from public.series_periodos p where p.serie_id = n.serie_id)
  group by n.serie_id
  on conflict (serie_id, periodo) do nothing;

  return null;
end;
$function$;

revoke all on function public.registrar_series_nuevas() from public, anon, authenticated;

drop trigger if exists trg_registrar_series_nuevas on public.sesiones;
create trigger trg_registrar_series_nuevas
  after insert on public.sesiones
  referencing new table as nuevas
  for each statement execute function public.registrar_series_nuevas();

-- ── Renovar ─────────────────────────────────────────────────────────────────
-- Genera, por cada día de la semana que tiene la serie en su última semana,
-- `p_semanas` clases más a partir de su última fecha (en hora de Madrid, bien a
-- través del cambio de hora). Plantilla = la última clase NO cancelada de ese
-- día: refleja cualquier «editar esta y las siguientes». Instructora = la
-- titular (si la última fue una sustitución, la original; si está de baja,
-- ninguna).
--
-- Idempotencia: la fila de la serie queda bloqueada hasta el final, y quien
-- pulsa manda el período que vio (`p_periodo_visto`). Si ya existe uno
-- posterior, devuelve 'ya_renovada' con ese período y no crea nada. La PK de
-- `series_periodos` y la exclusión de solape de sala son las redes de debajo.
--
-- Por fecha: si ya hay una clase igual (otra serie, a mano) se omite
-- ('ya_existe'); si la sala está ocupada se omite ('sala_ocupada'); si solo
-- choca la instructora se crea sin instructora. Las omitidas quedan anotadas.
-- Con `p_simular` hace lo mismo y lo deshace (subtransacción) para enseñarlo.
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

  v_semanas := coalesce(p_semanas, v_serie.semanas_periodo);
  if v_semanas < 1 or v_semanas > 104 then
    raise exception 'SEMANAS_INVALIDAS';
  end if;

  select coalesce(max(p.periodo), 0) into v_periodo from public.series_periodos p where p.serie_id = p_serie_id;

  if p_periodo_visto is not null and v_periodo > p_periodo_visto then
    select jsonb_build_object(
             'estado', 'ya_renovada', 'periodo', p.periodo, 'desde', p.desde, 'hasta', p.hasta,
             'creadas', p.sesiones_creadas, 'omitidas', p.omitidas, 'semanas', v_semanas)
      into v_res
      from public.series_periodos p where p.serie_id = p_serie_id and p.periodo = v_periodo;
    return v_res;
  end if;

  select max((s.inicio at time zone v_tz)::date) into v_ultima_fecha
    from public.sesiones s where s.serie_id = p_serie_id and s.studio_id = p_studio_id;
  if v_ultima_fecha is null then
    raise exception 'SERIE_SIN_CLASES';
  end if;

  -- Tope de clases por renovación: una serie de varios días a la semana por 104
  -- semanas son cientos de inserts en una sola llamada.
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
      -- Ese día solo tiene clases canceladas: se dejó de dar a propósito.
      if not found then
        continue;
      end if;

      -- Instructora: la de la última clase de ese día que tenía una (si la
      -- última se quedó sin nadie por un choque, ese hueco no se hereda), y si
      -- esa clase fue una sustitución confirmada, la titular.
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
      'plazas_fijas', v_plazas, 'plazas_fijas_ids', to_jsonb(v_plazas_ids));

    if p_simular then
      raise exception using errcode = 'TSIMU', message = 'SIMULACION';
    end if;
  exception when sqlstate 'TSIMU' then
    -- Lo creado en la simulación se deshace con este bloque; el resultado queda.
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

-- ── Las que terminan pronto ─────────────────────────────────────────────────
-- Última clase viva entre hace 14 días y dentro de `p_dias`. Fuera:
--  · «no renovar»;
--  · la cola cancelada a propósito (2 o más canceladas después de la última
--    viva: «cancelar serie» solo se ofrece con más de una por delante);
--  · la que ya continúa en otra serie o a mano (clase viva en la misma sala,
--    día y hora en las dos semanas siguientes).
-- ⚠️ `returns table` expone sus columnas como variables: todo va calificado.
create or replace function public.series_por_renovar(p_studio_id text, p_dias integer default 30)
 returns table(
   serie_id text, ultima_fecha date, dia_semana integer, hora time, sala_id text, tipo_clase_id text,
   instructor_id text, aforo integer, periodo integer, semanas_periodo integer, plazas_fijas integer,
   terminada boolean
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
    select se.id as sid, se.semanas_periodo as sem,
           max((s.inicio at time zone 'Europe/Madrid')::date) filter (where not coalesce(s.cancelada, false)) as viva
      from public.series se
      join public.sesiones s on s.serie_id = se.id and s.studio_id = se.studio_id
     where se.studio_id = p_studio_id and not se.no_renovar
     group by se.id, se.semanas_periodo
  ),
  candidatas as (
    select u.sid, u.sem, u.viva
      from ultimas u
     where u.viva is not null
       and u.viva between v_hoy - 14 and v_hoy + p_dias
       and (select count(*) from public.sesiones c
             where c.serie_id = u.sid and c.studio_id = p_studio_id and coalesce(c.cancelada, false)
               and (c.inicio at time zone 'Europe/Madrid')::date > u.viva) < 2
  ),
  con_plantilla as (
    select c.sid, c.sem, c.viva, pl.id as pl_id, pl.inicio as pl_inicio, pl.sala_id as pl_sala,
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
         cp.viva < v_hoy
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
