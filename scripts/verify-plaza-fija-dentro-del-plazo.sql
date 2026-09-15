-- Drill: el motor de plazas fijas no reserva sola una clase que empieza dentro
-- del plazo de cancelación (migr 20260915170000). TODO dentro de una
-- transacción que termina en ROLLBACK: no deja nada. Fixture con prefijo
-- `zzdrill-`.
--
-- Cómo correrlo (Supabase local, desde la raíz del repo):
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f scripts/verify-plaza-fija-dentro-del-plazo.sql
-- Un assert fallido corta con el mensaje del escenario; sin error = todo OK.
--
-- Escenarios: a) dentro de la ventana del TIPO no se reserva y la semana
-- siguiente sí · b) tipo sin ventana → manda la del estudio · c) control
-- positivo: sin ninguna ventana se reserva ya, como antes · grants.
\set ON_ERROR_STOP on
begin;

\i supabase/migrations/20260915170000_plaza_fija_no_reserva_dentro_del_plazo.sql

insert into studios (id, nombre) values ('zzdrill-st', 'Estudio PF plazo');
insert into salas (id, studio_id, nombre, capacidad) values
  ('zzdrill-sala-a', 'zzdrill-st', 'Sala A', 6),
  ('zzdrill-sala-b', 'zzdrill-st', 'Sala B', 6);
insert into tipos_clase (id, studio_id, nombre, ventana_cancelacion_horas) values
  ('zzdrill-tc-a', 'zzdrill-st', 'Reformer', 12),
  ('zzdrill-tc-b', 'zzdrill-st', 'Mat', null);
insert into instructores (id, studio_id, nombre) values
  ('zzdrill-ins-1', 'zzdrill-st', 'Ana'),
  ('zzdrill-ins-2', 'zzdrill-st', 'Eva');
insert into socios (id, studio_id, nombre, apellidos, email)
values ('zzdrill-soc-1', 'zzdrill-st', 'Socia', '1', 'zzdrill-1@example.com');
insert into planes_tarifa (id, studio_id, nombre, precio, tipo, sesiones, activo)
values ('zzdrill-plan-cuota', 'zzdrill-st', 'Mensual', 60, 'MENSUAL', null, true);
insert into suscripciones (id, studio_id, socio_id, plan_id, estado, fecha_inicio, fecha_fin, sesiones_restantes)
values ('zzdrill-sus-1', 'zzdrill-st', 'zzdrill-soc-1', 'zzdrill-plan-cuota', 'ACTIVA', current_date - 30, null, null);

do $$
declare
  v_pronto timestamptz := date_trunc('minute', now() + interval '2 hours');
  v_local timestamp := date_trunc('minute', now() + interval '2 hours') at time zone 'Europe/Madrid';
  n int; creadas int;
begin
  -- Reformer (ventana 12 h): una clase dentro de 2 h y la misma la semana que viene.
  insert into sesiones (id, studio_id, tipo_clase_id, sala_id, instructor_id, inicio, fin, aforo_maximo, cancelada) values
    ('zzdrill-ses-pronto', 'zzdrill-st', 'zzdrill-tc-a', 'zzdrill-sala-a', 'zzdrill-ins-1', v_pronto, v_pronto + interval '50 minutes', 6, false),
    ('zzdrill-ses-semana', 'zzdrill-st', 'zzdrill-tc-a', 'zzdrill-sala-a', 'zzdrill-ins-1', v_pronto + interval '7 days', v_pronto + interval '7 days 50 minutes', 6, false),
    -- Mat (sin ventana propia), a la misma hora en otra sala y con otra instructora.
    ('zzdrill-ses-b', 'zzdrill-st', 'zzdrill-tc-b', 'zzdrill-sala-b', 'zzdrill-ins-2', v_pronto, v_pronto + interval '50 minutes', 6, false);
  insert into plazas_fijas (id, studio_id, socio_id, dia_semana, hora_inicio, sala_id, tipo_clase_id, vigencia_desde, estado, creada_en) values
    ('zzdrill-pf-a', 'zzdrill-st', 'zzdrill-soc-1', extract(dow from v_local)::int, v_local::time, 'zzdrill-sala-a', 'zzdrill-tc-a', current_date - 7, 'ACTIVA', now()),
    ('zzdrill-pf-b', 'zzdrill-st', 'zzdrill-soc-1', extract(dow from v_local)::int, v_local::time, 'zzdrill-sala-b', 'zzdrill-tc-b', current_date - 7, 'ACTIVA', now());

  -- a) 2 h < 12 h del tipo: esa no; la de la semana que viene, sí.
  select public.materializar_plazas_fijas(42, 'zzdrill-pf-a') into creadas;
  assert creadas = 1, 'a: creadas = ' || creadas;
  select count(*) into n from reservas where socio_id = 'zzdrill-soc-1' and sesion_id = 'zzdrill-ses-pronto';
  assert n = 0, 'a: reservó una clase que empieza dentro del plazo del tipo';
  select count(*) into n from reservas where socio_id = 'zzdrill-soc-1' and sesion_id = 'zzdrill-ses-semana';
  assert n = 1, 'a: no reservó la de la semana que viene';

  -- b) tipo sin ventana → manda la del estudio (3 h): tampoco.
  update studios set cancelacion_ventana_horas = 3 where id = 'zzdrill-st';
  select public.materializar_plazas_fijas(42, 'zzdrill-pf-b') into creadas;
  assert creadas = 0, 'b: con la ventana del estudio creó ' || creadas;

  -- c) control positivo: sin ninguna ventana se reserva ya, como antes.
  update studios set cancelacion_ventana_horas = null where id = 'zzdrill-st';
  select public.materializar_plazas_fijas(42, 'zzdrill-pf-b') into creadas;
  assert creadas = 1, 'c: sin ninguna ventana no reservó (creadas = ' || creadas || ')';

  -- grants
  assert not has_function_privilege('anon', 'public.materializar_plazas_fijas(integer, text)', 'EXECUTE'), 'grants: anon';
  assert not has_function_privilege('authenticated', 'public.materializar_plazas_fijas(integer, text)', 'EXECUTE'), 'grants: authenticated';
  assert has_function_privilege('service_role', 'public.materializar_plazas_fijas(integer, text)', 'EXECUTE'), 'grants: service_role';
end $$;

rollback;
