-- Drill de la renovación de series (migr 20260915110000). TODO dentro de una
-- transacción que termina en ROLLBACK: no deja nada. Fixture con prefijo `zzdrill-`.
--
-- Cómo correrlo (Supabase local, desde la raíz del repo):
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f scripts/verify-series-renovacion.sql
-- Un assert fallido corta con el mensaje del escenario; sin error = todo OK.
--
-- Escenarios: backfill · a) el trigger da de alta la serie nueva · b) simular no
-- deja nada y cuenta bien (sala ocupada, ya existe, sin instructora, plazas
-- fijas) · c) renovar copia la plantilla con la instructora titular · d) repetir
-- con el período viejo = 'ya_renovada', sin duplicar · e) período 3 · f) nada que
-- crear = 'sin_cambios' sin período · g) errores · h) `series_por_renovar` · i) permisos.
\set ON_ERROR_STOP on
begin;

\i supabase/migrations/20260915110000_series_renovacion.sql

create temp table fx as
  select ((now() at time zone 'Europe/Madrid')::date + ((2 - extract(dow from (now() at time zone 'Europe/Madrid'))::int + 7) % 7) + 7) as martes1,
         (now() at time zone 'Europe/Madrid')::date as hoy,
         (select count(*) from public.series) as series_antes,
         (select count(distinct s.serie_id) from public.sesiones s where s.serie_id is not null) as distintas_antes,
         (select count(*) from public.series_periodos) as periodos_antes;

insert into studios (id, nombre) values ('zzdrill-st', 'Estudio SR');
insert into salas (id, studio_id, nombre, capacidad) values
  ('zzdrill-sala-a', 'zzdrill-st', 'Sala A', 6), ('zzdrill-sala-b', 'zzdrill-st', 'Sala B', 6);
insert into tipos_clase (id, studio_id, nombre) values ('zzdrill-tc-a', 'zzdrill-st', 'Reformer');
insert into instructores (id, studio_id, nombre) values
  ('zzdrill-ins-1', 'zzdrill-st', 'Ana'), ('zzdrill-ins-2', 'zzdrill-st', 'Bea');
insert into socios (id, studio_id, nombre, apellidos) values ('zzdrill-soc-1', 'zzdrill-st', 'Socia', 'Uno');
insert into plazas_fijas (id, studio_id, socio_id, dia_semana, hora_inicio, sala_id, vigencia_desde, estado, creada_en)
values ('zzdrill-pf-1', 'zzdrill-st', 'zzdrill-soc-1', 2, time '10:00', 'zzdrill-sala-a', current_date - 7, 'ACTIVA', now());

-- Serie de 4 martes a las 10:00 en UN insert; la 4ª la dio una sustituta.
insert into sesiones (id, studio_id, tipo_clase_id, sala_id, instructor_id, inicio, fin, aforo_maximo, cancelada, serie_id)
select 'zzdrill-ses-' || i, 'zzdrill-st', 'zzdrill-tc-a', 'zzdrill-sala-a',
       case when i = 4 then 'zzdrill-ins-2' else 'zzdrill-ins-1' end,
       ((fx.martes1 + (i - 1) * 7) + time '10:00') at time zone 'Europe/Madrid',
       ((fx.martes1 + (i - 1) * 7) + time '10:50') at time zone 'Europe/Madrid', 6, false, 'zzdrill-serie'
from fx, generate_series(1, 4) as i;
insert into sustituciones (id, studio_id, sesion_id, instructor_original_id, estado)
values ('zzdrill-sust', 'zzdrill-st', 'zzdrill-ses-4', 'zzdrill-ins-1', 'confirmada');

-- Semana 6: la sala ocupada (10:30); semana 7: ya hay una clase igual; semana 8: Ana ocupada en la sala B.
insert into sesiones (id, studio_id, tipo_clase_id, sala_id, instructor_id, inicio, fin, aforo_maximo, cancelada)
select 'zzdrill-bloq-sala', 'zzdrill-st', 'zzdrill-tc-a', 'zzdrill-sala-a', null,
       ((fx.martes1 + 35) + time '10:30') at time zone 'Europe/Madrid', ((fx.martes1 + 35) + time '11:20') at time zone 'Europe/Madrid', 6, false from fx
union all
select 'zzdrill-bloq-igual', 'zzdrill-st', 'zzdrill-tc-a', 'zzdrill-sala-a', null,
       ((fx.martes1 + 42) + time '10:00') at time zone 'Europe/Madrid', ((fx.martes1 + 42) + time '10:50') at time zone 'Europe/Madrid', 6, false from fx
union all
select 'zzdrill-bloq-ins', 'zzdrill-st', 'zzdrill-tc-a', 'zzdrill-sala-b', 'zzdrill-ins-1',
       ((fx.martes1 + 49) + time '10:00') at time zone 'Europe/Madrid', ((fx.martes1 + 49) + time '10:50') at time zone 'Europe/Madrid', 6, false from fx;

-- Series cortas en la sala B para `series_por_renovar`: la 2 sale; la 3 «no
-- renovar»; la 4 con la cola cancelada; la 5 continúa con una clase suelta.
insert into sesiones (id, studio_id, tipo_clase_id, sala_id, instructor_id, inicio, fin, aforo_maximo, cancelada, serie_id)
select 'zzdrill-s' || x.serie || '-' || x.k, 'zzdrill-st', 'zzdrill-tc-a', 'zzdrill-sala-b', null,
       ((fx.hoy + x.k) + x.hora) at time zone 'Europe/Madrid', ((fx.hoy + x.k) + x.hora + interval '50 minutes') at time zone 'Europe/Madrid',
       6, x.cancelada, 'zzdrill-serie' || x.serie
from fx, (values
  (2, 3, time '18:00', false), (2, 10, time '18:00', false),
  (3, 3, time '19:00', false), (3, 10, time '19:00', false),
  (4, 3, time '20:00', false), (4, 10, time '20:00', false), (4, 17, time '20:00', true), (4, 24, time '20:00', true),
  (5, 3, time '17:00', false), (5, 10, time '17:00', false)
) as x(serie, k, hora, cancelada);
update series set no_renovar = true where id = 'zzdrill-serie3';
insert into sesiones (id, studio_id, tipo_clase_id, sala_id, instructor_id, inicio, fin, aforo_maximo, cancelada)
select 'zzdrill-s5-sigue', 'zzdrill-st', 'zzdrill-tc-a', 'zzdrill-sala-b', null,
       ((fx.hoy + 17) + time '17:00') at time zone 'Europe/Madrid', ((fx.hoy + 17) + time '17:50') at time zone 'Europe/Madrid', 6, false from fx;

do $$
declare r jsonb; n int; f date; x record;
begin
  select * into x from fx;
  f := x.martes1;

  assert x.series_antes = x.distintas_antes, 'backfill: series ' || x.series_antes || ' vs distintas ' || x.distintas_antes;
  assert x.periodos_antes = x.distintas_antes, 'backfill: periodos ' || x.periodos_antes;

  -- a) el trigger da de alta la serie nueva con su período 1
  select count(*) into n from series where id = 'zzdrill-serie' and semanas_periodo = 4;
  assert n = 1, 'a: serie no registrada';
  select count(*) into n from series_periodos
   where serie_id = 'zzdrill-serie' and periodo = 1 and desde = f and hasta = f + 21 and sesiones_creadas = 4 and origen = 'creacion';
  assert n = 1, 'a: período 1 mal';
  select count(*) into n from series where studio_id = 'zzdrill-st';
  assert n = 5, 'a: series del estudio = ' || n;

  -- b) simular: 2 creadas (sem 5, y sem 8 sin instructora), 2 omitidas, 1 plaza fija; y no deja nada
  r := renovar_serie('zzdrill-st', 'zzdrill-serie', null, 4, null, 'manual', true);
  assert r->>'estado' = 'simulacion', 'b: estado ' || (r->>'estado');
  assert (r->>'creadas')::int = 2, 'b: creadas ' || (r->>'creadas');
  assert jsonb_array_length(r->'omitidas') = 2, 'b: omitidas ' || (r->'omitidas')::text;
  assert r->'omitidas' @> jsonb_build_array(jsonb_build_object('fecha', f + 35, 'motivo', 'sala_ocupada')), 'b: sala_ocupada';
  assert r->'omitidas' @> jsonb_build_array(jsonb_build_object('fecha', f + 42, 'motivo', 'ya_existe')), 'b: ya_existe';
  assert r->'sin_instructora' = jsonb_build_array(f + 49), 'b: sin_instructora ' || (r->'sin_instructora')::text;
  assert (r->>'plazas_fijas')::int = 1, 'b: plazas ' || (r->>'plazas_fijas');
  assert (r->>'periodo_actual')::int = 1 and (r->>'desde')::date = f + 28 and (r->>'hasta')::date = f + 49, 'b: fechas ' || r::text;
  select count(*) into n from sesiones where serie_id = 'zzdrill-serie';
  assert n = 4, 'b: la simulación dejó sesiones: ' || n;
  select count(*) into n from series_periodos where serie_id = 'zzdrill-serie';
  assert n = 1, 'b: la simulación dejó período';

  -- c) renovar de verdad
  r := renovar_serie('zzdrill-st', 'zzdrill-serie', 1, 4, null, 'manual', false);
  assert r->>'estado' = 'renovada', 'c: estado ' || r::text;
  select count(*) into n from sesiones where serie_id = 'zzdrill-serie';
  assert n = 6, 'c: sesiones ' || n;
  select count(*) into n from sesiones
   where serie_id = 'zzdrill-serie' and (inicio at time zone 'Europe/Madrid')::date = f + 28
     and instructor_id = 'zzdrill-ins-1' and sala_id = 'zzdrill-sala-a' and tipo_clase_id = 'zzdrill-tc-a' and aforo_maximo = 6
     and (inicio at time zone 'Europe/Madrid')::time = time '10:00' and fin - inicio = interval '50 minutes';
  assert n = 1, 'c: la semana 5 no copia la plantilla o no usa a la titular';
  select count(*) into n from sesiones
   where serie_id = 'zzdrill-serie' and (inicio at time zone 'Europe/Madrid')::date = f + 49 and instructor_id is null;
  assert n = 1, 'c: la semana 8 debía ir sin instructora';
  select count(*) into n from series_periodos
   where serie_id = 'zzdrill-serie' and periodo = 2 and origen = 'manual' and sesiones_creadas = 2 and jsonb_array_length(omitidas) = 2;
  assert n = 1, 'c: período 2 mal';

  -- d) idempotente: quien vio el período 1 recibe «ya renovada» y no se crea nada
  r := renovar_serie('zzdrill-st', 'zzdrill-serie', 1, 4, null, 'manual', false);
  assert r->>'estado' = 'ya_renovada' and (r->>'periodo')::int = 2, 'd: ' || r::text;
  select count(*) into n from sesiones where serie_id = 'zzdrill-serie';
  assert n = 6, 'd: duplicó sesiones ' || n;

  -- e) período 3: la instructora sale de la última clase que tenía una (no del hueco sin nadie)
  r := renovar_serie('zzdrill-st', 'zzdrill-serie', 2, 2, null, 'manual', false);
  assert r->>'estado' = 'renovada' and (r->>'creadas')::int = 2, 'e: ' || r::text;
  select count(*) into n from sesiones
   where serie_id = 'zzdrill-serie' and (inicio at time zone 'Europe/Madrid')::date in (f + 56, f + 63) and instructor_id = 'zzdrill-ins-1';
  assert n = 2, 'e: instructora del período 3 = ' || n;
  select count(*) into n from series where studio_id = 'zzdrill-st';
  assert n = 5, 'e: renovar creó series nuevas: ' || n;

  -- f) sin nada que crear: 'sin_cambios' y ningún período
  r := renovar_serie('zzdrill-st', 'zzdrill-serie5', 1, 1, null, 'manual', false);
  assert r->>'estado' = 'sin_cambios', 'f: ' || r::text;
  select count(*) into n from series_periodos where serie_id = 'zzdrill-serie5';
  assert n = 1, 'f: creó período sin clases';

  -- g) errores traducibles
  begin
    perform renovar_serie('zzdrill-st', 'no-existe', null, 4, null, 'manual', true);
    raise exception 'g: no falló';
  exception when others then
    assert sqlerrm = 'SERIE_NO_ENCONTRADA', 'g: ' || sqlerrm;
  end;
  begin
    perform renovar_serie('zzdrill-st', 'zzdrill-serie', null, 200, null, 'manual', true);
    raise exception 'g2: no falló';
  exception when others then
    assert sqlerrm = 'SEMANAS_INVALIDAS', 'g2: ' || sqlerrm;
  end;

  -- h) por renovar: solo la serie 2
  select count(*) into n from series_por_renovar('zzdrill-st', 30);
  assert n = 1, 'h: por renovar = ' || n;
  select count(*) into n from series_por_renovar('zzdrill-st', 30) t
   where t.serie_id = 'zzdrill-serie2' and t.ultima_fecha = x.hoy + 10 and t.hora = time '18:00' and not t.terminada and t.periodo = 1;
  assert n = 1, 'h: la serie 2 no sale bien';

  -- i) permisos
  assert not has_function_privilege('anon', 'public.renovar_serie(text, text, integer, integer, uuid, text, boolean)', 'EXECUTE'), 'i: anon renovar';
  assert not has_function_privilege('authenticated', 'public.renovar_serie(text, text, integer, integer, uuid, text, boolean)', 'EXECUTE'), 'i: authenticated renovar';
  assert has_function_privilege('service_role', 'public.renovar_serie(text, text, integer, integer, uuid, text, boolean)', 'EXECUTE'), 'i: service_role renovar';
  assert not has_function_privilege('authenticated', 'public.series_por_renovar(text, integer)', 'EXECUTE'), 'i: authenticated por renovar';
  assert not has_function_privilege('anon', 'public.series_por_renovar(text, integer)', 'EXECUTE'), 'i: anon por renovar';
  assert not has_table_privilege('authenticated', 'public.series', 'INSERT'), 'i: authenticated INSERT series';
  assert not has_table_privilege('authenticated', 'public.series_periodos', 'UPDATE'), 'i: authenticated UPDATE periodos';
  assert has_table_privilege('authenticated', 'public.series', 'SELECT'), 'i: authenticated SELECT series';
  assert not has_table_privilege('anon', 'public.series', 'SELECT'), 'i: anon SELECT series';
  assert not has_table_privilege('authenticated', 'public.series', 'DELETE'), 'i: authenticated DELETE series';
end $$;

-- j) Aislamiento: otro estudio que reutiliza el `serie_id` de la serie 2 (con
--    2 canceladas y su propia sala) no puede esconderla ni cambiar su plantilla.
-- k) Tope: 5 días distintos × 104 semanas pasan de 400 clases.
insert into studios (id, nombre) values ('zzdrill-otro', 'Otro estudio');
insert into salas (id, studio_id, nombre, capacidad) values ('zzdrill-sala-o', 'zzdrill-otro', 'Sala O', 6);
insert into tipos_clase (id, studio_id, nombre) values ('zzdrill-tc-o', 'zzdrill-otro', 'Mat');
insert into sesiones (id, studio_id, tipo_clase_id, sala_id, instructor_id, inicio, fin, aforo_maximo, cancelada, serie_id)
select 'zzdrill-ajena-' || k, 'zzdrill-otro', 'zzdrill-tc-o', 'zzdrill-sala-o', null,
       ((fx.hoy + k) + time '09:00') at time zone 'Europe/Madrid', ((fx.hoy + k) + time '09:50') at time zone 'Europe/Madrid', 6, k > 11, 'zzdrill-serie2'
from fx, (values (11), (12), (13)) as v(k);
insert into sesiones (id, studio_id, tipo_clase_id, sala_id, instructor_id, inicio, fin, aforo_maximo, cancelada, serie_id)
select 'zzdrill-s6-' || k, 'zzdrill-st', 'zzdrill-tc-a', 'zzdrill-sala-a', null,
       ((fx.martes1 + 70 + k) + time '08:00') at time zone 'Europe/Madrid', ((fx.martes1 + 70 + k) + time '08:50') at time zone 'Europe/Madrid', 6, false, 'zzdrill-serie6'
from fx, generate_series(0, 4) as k;

do $$
declare r jsonb; n int; x record;
begin
  select * into x from fx;

  select count(*) into n from series_por_renovar('zzdrill-st', 30) t
   where t.serie_id = 'zzdrill-serie2' and t.ultima_fecha = x.hoy + 10 and t.sala_id = 'zzdrill-sala-b' and t.hora = time '18:00';
  assert n = 1, 'j: la serie 2 se esconde o toma la plantilla ajena (' || n || ')';

  begin
    perform renovar_serie('zzdrill-st', 'zzdrill-serie6', null, 104, null, 'manual', true);
    raise exception 'k: no falló';
  exception when others then
    assert sqlerrm = 'DEMASIADAS_CLASES', 'k: ' || sqlerrm;
  end;
  r := renovar_serie('zzdrill-st', 'zzdrill-serie6', null, 80, null, 'manual', true);
  assert r->>'estado' = 'simulacion' and (r->>'creadas')::int = 400, 'k: 80×5 debía simular 400, ' || (r->>'creadas');
  select count(*) into n from sesiones where serie_id = 'zzdrill-serie6';
  assert n = 5, 'k: la simulación dejó ' || n;
end $$;

rollback;
