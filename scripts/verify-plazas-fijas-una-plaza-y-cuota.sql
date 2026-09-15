-- Drill de `materializar_plazas_fijas(p_horizonte_dias, p_plaza_id)` y la regla
-- «plaza fija solo con cuota» (migr 20260915004253). TODO dentro de una
-- transacción que termina en ROLLBACK: no deja nada. Fixture con prefijo
-- `zzdrill-`.
--
-- Cómo correrlo (Supabase local, desde la raíz del repo):
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f scripts/verify-plazas-fijas-una-plaza-y-cuota.sql
-- Un assert fallido corta con el mensaje del escenario; sin error = todo OK.
--
-- ⚠️ La pasada sin `p_plaza_id` materializa TODOS los estudios dentro de la
-- transacción (se deshace): los asserts cuentan por clienta del fixture.
--
-- Escenarios: firma vieja borrada y grants · a) acotada a una plaza no toca las
-- demás · b) idempotente · c) con bono no reserva y avisa sin_plan_vigente; con
-- cuota sí reserva.
\set ON_ERROR_STOP on
begin;

\i supabase/migrations/20260915004253_plazas_fijas_materializa_una_plaza_y_solo_cuota.sql

insert into studios (id, nombre) values ('zzdrill-st', 'Estudio PF');
insert into salas (id, studio_id, nombre, capacidad) values ('zzdrill-sala-a', 'zzdrill-st', 'Sala A', 6);
insert into tipos_clase (id, studio_id, nombre) values ('zzdrill-tc-a', 'zzdrill-st', 'Reformer');
insert into instructores (id, studio_id, nombre) values ('zzdrill-ins-1', 'zzdrill-st', 'Ana');
insert into socios (id, studio_id, nombre, apellidos, email)
select 'zzdrill-soc-' || i, 'zzdrill-st', 'Socia', i::text, 'zzdrill-' || i || '@example.com' from generate_series(1, 3) as i;
insert into planes_tarifa (id, studio_id, nombre, precio, tipo, sesiones, activo) values
  ('zzdrill-plan-cuota', 'zzdrill-st', 'Mensual', 60, 'MENSUAL', null, true),
  ('zzdrill-plan-bono', 'zzdrill-st', 'Bono 10', 90, 'BONO', 10, true);
insert into suscripciones (id, studio_id, socio_id, plan_id, estado, fecha_inicio, fecha_fin, sesiones_restantes) values
  ('zzdrill-sus-1', 'zzdrill-st', 'zzdrill-soc-1', 'zzdrill-plan-cuota', 'ACTIVA', current_date - 30, null, null),
  ('zzdrill-sus-2', 'zzdrill-st', 'zzdrill-soc-2', 'zzdrill-plan-bono', 'ACTIVA', current_date - 30, current_date + 60, 8),
  ('zzdrill-sus-3', 'zzdrill-st', 'zzdrill-soc-3', 'zzdrill-plan-cuota', 'ACTIVA', current_date - 30, null, null);
create temp table fx as
  select ((now() at time zone 'Europe/Madrid')::date + ((2 - extract(dow from (now() at time zone 'Europe/Madrid'))::int + 7) % 7) + 7) as martes1;
insert into sesiones (id, studio_id, tipo_clase_id, sala_id, instructor_id, inicio, fin, aforo_maximo, cancelada)
select 'zzdrill-ses-' || i, 'zzdrill-st', 'zzdrill-tc-a', 'zzdrill-sala-a', 'zzdrill-ins-1',
       ((fx.martes1 + (i - 1) * 7) + time '10:00') at time zone 'Europe/Madrid',
       ((fx.martes1 + (i - 1) * 7) + time '10:50') at time zone 'Europe/Madrid', 6, false
from fx, generate_series(1, 3) as i;
insert into plazas_fijas (id, studio_id, socio_id, dia_semana, hora_inicio, sala_id, vigencia_desde, estado, creada_en)
select 'zzdrill-pf-' || s, 'zzdrill-st', 'zzdrill-soc-' || s, 2, time '10:00', 'zzdrill-sala-a', current_date - 7, 'ACTIVA', now()
from generate_series(1, 3) as s;

do $$
declare n int; creadas int;
begin
  assert to_regprocedure('public.materializar_plazas_fijas(integer)') is null, 'firma vieja sigue existiendo';
  assert not has_function_privilege('anon', 'public.materializar_plazas_fijas(integer, text)', 'EXECUTE'), 'grants: anon';
  assert not has_function_privilege('authenticated', 'public.materializar_plazas_fijas(integer, text)', 'EXECUTE'), 'grants: authenticated';
  assert has_function_privilege('service_role', 'public.materializar_plazas_fijas(integer, text)', 'EXECUTE'), 'grants: service_role';

  select public.materializar_plazas_fijas(42, 'zzdrill-pf-1') into creadas;
  assert creadas = 3, 'a: creadas para pf-1 = ' || creadas;
  select count(*) into n from reservas where socio_id = 'zzdrill-soc-3';
  assert n = 0, 'a: tocó otra plaza, soc-3 tiene ' || n;

  select public.materializar_plazas_fijas(42, 'zzdrill-pf-1') into creadas;
  assert creadas = 0, 'b: segunda pasada creó ' || creadas;

  perform public.materializar_plazas_fijas(42);
  select count(*) into n from reservas where socio_id = 'zzdrill-soc-2';
  assert n = 0, 'c: con bono reservó ' || n;
  select count(*) into n from reservas where socio_id = 'zzdrill-soc-3' and id like 'res-pf-%';
  assert n = 3, 'c: con cuota reservó ' || n;
  select count(*) into n from public.plazas_fijas_sin_materializar(42) where socio_id = 'zzdrill-soc-2' and motivo = 'sin_plan_vigente';
  assert n = 3, 'c: avisos sin_plan_vigente para bono = ' || n;

  -- d) cuota con baja programada que vence antes de la 2ª clase: solo la 1ª
  update suscripciones set baja_al_vencer = true,
         fecha_fin = (select (inicio at time zone 'Europe/Madrid')::date from sesiones where id = 'zzdrill-ses-1')
   where id = 'zzdrill-sus-1';
  delete from reservas where socio_id = 'zzdrill-soc-1';
  perform public.materializar_plazas_fijas(42, 'zzdrill-pf-1');
  select count(*) into n from reservas where socio_id = 'zzdrill-soc-1';
  assert n = 1, 'd: con baja programada reservó ' || n || ' (esperaba solo la clase antes del fin)';

  -- e) la escritura de plazas_fijas ya no está abierta al navegador
  assert not has_table_privilege('authenticated', 'public.plazas_fijas', 'INSERT'), 'e: authenticated INSERT';
  assert not has_table_privilege('authenticated', 'public.plazas_fijas', 'UPDATE'), 'e: authenticated UPDATE';
  assert not has_table_privilege('authenticated', 'public.plazas_fijas', 'DELETE'), 'e: authenticated DELETE';
  assert has_table_privilege('authenticated', 'public.plazas_fijas', 'SELECT'), 'e: authenticated sigue leyendo';
  select count(*) into n from pg_policies where schemaname = 'public' and tablename = 'plazas_fijas' and cmd <> 'SELECT';
  assert n = 0, 'e: quedan políticas de escritura: ' || n;
end $$;

rollback;
