-- Drill de avisos y renovación automática de series (migr 20260915120000). TODO
-- dentro de una transacción que termina en ROLLBACK: no deja nada (tampoco el
-- job de pg_cron). Fixture con prefijo `zzdrill-`.
--
-- Cómo correrlo (Supabase local, desde la raíz del repo, con la migración de
-- renovación ya aplicada):
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f scripts/verify-series-avisos.sql
-- Un assert fallido corta con el mensaje del escenario; sin error = todo OK.
--
-- Escenarios: a) el CHECK de tramo · b) `series_por_renovar` devuelve la
-- automática y el último aviso · c) `renovar_serie` dice si se renueva sola ·
-- d) renovar con origen 'automatica' la saca de la lista · e) job diario · permisos.
\set ON_ERROR_STOP on
begin;

\i supabase/migrations/20260915120000_series_avisos_y_renovacion_automatica.sql

create temp table fx as select (now() at time zone 'Europe/Madrid')::date as hoy;

insert into studios (id, nombre) values ('zzdrill-st', 'Estudio SA');
insert into salas (id, studio_id, nombre, capacidad) values ('zzdrill-sala', 'zzdrill-st', 'Sala', 6);
insert into tipos_clase (id, studio_id, nombre) values ('zzdrill-tc', 'zzdrill-st', 'Reformer');
-- Serie de 2 clases que termina en 10 días.
insert into sesiones (id, studio_id, tipo_clase_id, sala_id, instructor_id, inicio, fin, aforo_maximo, cancelada, serie_id)
select 'zzdrill-s-' || k, 'zzdrill-st', 'zzdrill-tc', 'zzdrill-sala', null,
       ((fx.hoy + k) + time '12:30') at time zone 'Europe/Madrid', ((fx.hoy + k) + time '13:20') at time zone 'Europe/Madrid', 6, false, 'zzdrill-serie'
from fx, (values (3), (10)) as v(k);

do $$
declare r jsonb; n int; x record;
begin
  -- a) tramo inventado
  begin
    update series set aviso_tramo = 'otro', aviso_fin = current_date where id = 'zzdrill-serie';
    raise exception 'a: aceptó un tramo inventado';
  exception when check_violation then null;
  end;

  -- a2) sin la automática activada, el barrido no puede renovarla
  begin
    perform renovar_serie('zzdrill-st', 'zzdrill-serie', null, 4, null, 'automatica', false);
    raise exception 'a2: renovó sin automática';
  exception when others then
    assert sqlerrm = 'SIN_RENOVACION_AUTOMATICA', 'a2: ' || sqlerrm;
  end;

  -- b) columnas nuevas en la lista
  select * into x from series_por_renovar('zzdrill-st', 30) t where t.serie_id = 'zzdrill-serie';
  assert x.serie_id is not null, 'b: no sale la serie';
  assert x.renovacion_automatica = false and x.aviso_tramo is null and x.aviso_fin is null, 'b: columnas nuevas mal';
  update series set renovacion_automatica = true, aviso_tramo = 'aviso14', aviso_fin = x.ultima_fecha where id = 'zzdrill-serie';
  select * into x from series_por_renovar('zzdrill-st', 30) t where t.serie_id = 'zzdrill-serie';
  assert x.renovacion_automatica and x.aviso_tramo = 'aviso14', 'b: no refleja la automática ni el aviso';

  -- c) la simulación dice si se renueva sola
  r := renovar_serie('zzdrill-st', 'zzdrill-serie', null, null, null, 'manual', true);
  assert r->>'estado' = 'simulacion' and (r->>'renovacion_automatica')::boolean, 'c: ' || r::text;

  -- d) renovada sola: período 'automatica' y fuera de la lista
  r := renovar_serie('zzdrill-st', 'zzdrill-serie', 1, 4, null, 'automatica', false);
  assert r->>'estado' = 'renovada' and (r->>'creadas')::int = 4, 'd: ' || r::text;
  select count(*) into n from series_periodos where serie_id = 'zzdrill-serie' and periodo = 2 and origen = 'automatica';
  assert n = 1, 'd: período no registrado';
  select count(*) into n from series_por_renovar('zzdrill-st', 30) t where t.serie_id = 'zzdrill-serie';
  assert n = 0, 'd: sigue por renovar';

  -- e) job diario y permisos
  select count(*) into n from cron.job where jobname = 'series-renovacion' and schedule = '0 7 * * *';
  assert n = 1, 'e: cron no programado';
  assert not has_function_privilege('authenticated', 'public.series_por_renovar(text, integer)', 'EXECUTE'), 'e: authenticated por renovar';
  assert not has_function_privilege('anon', 'public.series_por_renovar(text, integer)', 'EXECUTE'), 'e: anon por renovar';
  assert has_function_privilege('service_role', 'public.series_por_renovar(text, integer)', 'EXECUTE'), 'e: service_role por renovar';
end $$;

rollback;
