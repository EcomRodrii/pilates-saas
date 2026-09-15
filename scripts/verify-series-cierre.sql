-- Drill: renovar una serie no crea clases en los días de cierre del centro
-- (migr 20260915172901). TODO dentro de una transacción que termina en ROLLBACK:
-- no deja nada. Fixture con prefijo `zzdrill-`.
--
-- Cómo correrlo (Supabase local, desde la raíz del repo):
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f scripts/verify-series-cierre.sql
-- Un assert fallido corta con el mensaje del escenario; sin error = todo OK.
--
-- Escenarios: a) simular dos semanas con la primera cerrada → 1 creada y la
-- cerrada omitida con motivo 'cierre' · b) renovar de verdad crea solo la
-- abierta y guarda la omisión en el período · c) control positivo: sin cierre
-- se crean las dos · grants.
\set ON_ERROR_STOP on
begin;

\i supabase/migrations/20260915172901_series_no_crea_clases_en_dias_cerrados.sql

insert into studios (id, nombre) values ('zzdrill-st', 'Estudio series cierre');
insert into salas (id, studio_id, nombre, capacidad) values ('zzdrill-sala-a', 'zzdrill-st', 'Sala A', 6);
insert into tipos_clase (id, studio_id, nombre) values ('zzdrill-tc-a', 'zzdrill-st', 'Reformer');
insert into instructores (id, studio_id, nombre) values ('zzdrill-ins-1', 'zzdrill-st', 'Ana');

do $$
declare
  v_lunes date := (now() at time zone 'Europe/Madrid')::date + ((1 - extract(dow from (now() at time zone 'Europe/Madrid'))::int + 7) % 7) + 14;
  v_ultima date;
  r jsonb; n int;
begin
  v_ultima := v_lunes + 7;
  insert into sesiones (id, studio_id, tipo_clase_id, sala_id, instructor_id, inicio, fin, aforo_maximo, cancelada, serie_id) values
    ('zzdrill-ses-1', 'zzdrill-st', 'zzdrill-tc-a', 'zzdrill-sala-a', 'zzdrill-ins-1',
     (v_lunes + time '10:00') at time zone 'Europe/Madrid', (v_lunes + time '10:50') at time zone 'Europe/Madrid', 6, false, 'zzdrill-serie'),
    ('zzdrill-ses-2', 'zzdrill-st', 'zzdrill-tc-a', 'zzdrill-sala-a', 'zzdrill-ins-1',
     (v_ultima + time '10:00') at time zone 'Europe/Madrid', (v_ultima + time '10:50') at time zone 'Europe/Madrid', 6, false, 'zzdrill-serie');

  -- c) control positivo primero: sin cierre, la simulación crea las dos.
  r := public.renovar_serie('zzdrill-st', 'zzdrill-serie', null, 2, null, 'manual', true);
  assert (r->>'creadas')::int = 2, 'c: sin cierre creadas = ' || (r->>'creadas');

  insert into cierres_estudio (id, studio_id, desde, hasta, motivo) values ('zzdrill-cierre', 'zzdrill-st', v_ultima + 7, v_ultima + 7, 'drill');

  -- a) simulación con el primer lunes cerrado
  r := public.renovar_serie('zzdrill-st', 'zzdrill-serie', null, 2, null, 'manual', true);
  assert (r->>'creadas')::int = 1, 'a: creadas = ' || (r->>'creadas');
  assert r->'omitidas' = jsonb_build_array(jsonb_build_object('fecha', v_ultima + 7, 'motivo', 'cierre')),
    'a: omitidas = ' || (r->'omitidas')::text;
  select count(*) into n from sesiones where serie_id = 'zzdrill-serie';
  assert n = 2, 'a: la simulación creó clases (' || n || ')';

  -- b) renovar de verdad
  r := public.renovar_serie('zzdrill-st', 'zzdrill-serie', 0, 2, null, 'manual', false);
  assert r->>'estado' = 'renovada', 'b: estado = ' || (r->>'estado');
  select count(*) into n from sesiones
   where serie_id = 'zzdrill-serie' and (inicio at time zone 'Europe/Madrid')::date = v_ultima + 7;
  assert n = 0, 'b: creó la clase del día cerrado';
  select count(*) into n from sesiones
   where serie_id = 'zzdrill-serie' and (inicio at time zone 'Europe/Madrid')::date = v_ultima + 14;
  assert n = 1, 'b: no creó la del día abierto';
  select count(*) into n from series_periodos
   where serie_id = 'zzdrill-serie' and omitidas @> jsonb_build_array(jsonb_build_object('motivo', 'cierre'));
  assert n = 1, 'b: el período no guarda la omisión por cierre';

  -- grants
  assert not has_function_privilege('anon', 'public.renovar_serie(text, text, integer, integer, uuid, text, boolean)', 'EXECUTE'), 'grants: anon';
  assert not has_function_privilege('authenticated', 'public.renovar_serie(text, text, integer, integer, uuid, text, boolean)', 'EXECUTE'), 'grants: authenticated';
  assert has_function_privilege('service_role', 'public.renovar_serie(text, text, integer, integer, uuid, text, boolean)', 'EXECUTE'), 'grants: service_role';
end $$;

rollback;
