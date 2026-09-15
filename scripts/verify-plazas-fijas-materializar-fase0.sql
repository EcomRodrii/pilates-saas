-- Drill de la materialización de plazas fijas (migr 20260915001236).
-- TODO dentro de una transacción que termina en ROLLBACK: no deja nada. Los ids
-- del fixture llevan el prefijo `zzdrill-` para no chocar con datos reales.
--
-- Cómo correrlo (Supabase local, desde la raíz del repo):
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f scripts/verify-plazas-fijas-materializar-fase0.sql
-- Un assert fallido corta con el mensaje del escenario; sin error = todo OK.
--
-- ⚠️ `materializar_plazas_fijas` materializa TODOS los estudios dentro de la
-- transacción (se deshace al final): los asserts cuentan por socia del fixture,
-- nunca el total que devuelve.
--
-- Escenarios: a) plan vigente → reserva sus 3 clases · b) plan ACTIVA con
-- fecha_fin pasada → nada, motivo sin_plan_vigente · c) plan que no cubre el
-- tipo → nada, sin_plan_vigente · d) clase con autorización y socia sin
-- autorizar → la pasada NO revienta, motivo sin_autorizacion; la autorizada sí
-- reserva · e) reserva PENDIENTE_APROBACION en una de sus clases → la pasada no
-- choca con uq_reserva_activa_socio_sesion · f) cancelación puntual respetada,
-- retirada por pausa NO · g) CHECK de cancelada_motivo · h) grants.
\set ON_ERROR_STOP on
begin;

-- Histórico de la Fase 0. Desde 20260915061357 la función es
-- `(integer, text)`: se quita dentro de la transacción para que la versión de
-- un argumento que crea el `\i` no deje dos sobrecargas y la llamada con 42 no
-- sea ambigua. Lo vigente se prueba en verify-plazas-fijas-una-plaza-y-cuota.sql.
drop function if exists public.materializar_plazas_fijas(integer, text);

\i supabase/migrations/20260915001236_plazas_fijas_plan_vigente_autorizacion_y_retirada.sql

-- ── Fixture ──────────────────────────────────────────────────────────────────
insert into studios (id, nombre) values ('zzdrill-st', 'Estudio PF');
insert into salas (id, studio_id, nombre, capacidad)
  values ('zzdrill-sala-a', 'zzdrill-st', 'Sala A', 6), ('zzdrill-sala-b', 'zzdrill-st', 'Sala B', 6);
insert into tipos_clase (id, studio_id, nombre, requiere_autorizacion)
  values ('zzdrill-tc-a', 'zzdrill-st', 'Reformer', false), ('zzdrill-tc-b', 'zzdrill-st', 'Mat', false),
         ('zzdrill-tc-c', 'zzdrill-st', 'Avanzado', true);
insert into instructores (id, studio_id, nombre) values ('zzdrill-ins-1', 'zzdrill-st', 'Ana');
insert into socios (id, studio_id, nombre, apellidos, email)
select 'zzdrill-soc-' || i, 'zzdrill-st', 'Socia', i::text, 'zzdrill-' || i || '@example.com'
from generate_series(1, 7) as i;

insert into planes_tarifa (id, studio_id, nombre, precio, tipo, activo)
  values ('zzdrill-plan-libre', 'zzdrill-st', 'Mensual', 60, 'MENSUAL', true),
         ('zzdrill-plan-mat', 'zzdrill-st', 'Mensual Mat', 40, 'MENSUAL', true);
insert into plan_tipos_clase (plan_id, tipo_clase_id, studio_id) values ('zzdrill-plan-mat', 'zzdrill-tc-b', 'zzdrill-st');

insert into suscripciones (id, studio_id, socio_id, plan_id, estado, fecha_inicio, fecha_fin) values
  ('zzdrill-sus-1', 'zzdrill-st', 'zzdrill-soc-1', 'zzdrill-plan-libre', 'ACTIVA', current_date - 30, null),
  ('zzdrill-sus-2', 'zzdrill-st', 'zzdrill-soc-2', 'zzdrill-plan-libre', 'ACTIVA', current_date - 30, current_date - 1),
  ('zzdrill-sus-3', 'zzdrill-st', 'zzdrill-soc-3', 'zzdrill-plan-mat',   'ACTIVA', current_date - 30, null),
  ('zzdrill-sus-4', 'zzdrill-st', 'zzdrill-soc-4', 'zzdrill-plan-libre', 'ACTIVA', current_date - 30, null),
  ('zzdrill-sus-5', 'zzdrill-st', 'zzdrill-soc-5', 'zzdrill-plan-libre', 'ACTIVA', current_date - 30, null),
  ('zzdrill-sus-6', 'zzdrill-st', 'zzdrill-soc-6', 'zzdrill-plan-libre', 'ACTIVA', current_date - 30, null),
  ('zzdrill-sus-7', 'zzdrill-st', 'zzdrill-soc-7', 'zzdrill-plan-libre', 'ACTIVA', current_date - 30, null);
insert into socio_tipos_clase_autorizados (studio_id, socio_id, tipo_clase_id) values ('zzdrill-st', 'zzdrill-soc-5', 'zzdrill-tc-c');

-- 3 martes a las 10:00 Madrid (sala A, Reformer) y 3 a las 12:00 (sala B, con
-- autorización), empezando el martes de la semana que viene (nunca hoy).
create temp table fx as
  select ((now() at time zone 'Europe/Madrid')::date + ((2 - extract(dow from (now() at time zone 'Europe/Madrid'))::int + 7) % 7) + 7) as martes1;
insert into sesiones (id, studio_id, tipo_clase_id, sala_id, instructor_id, inicio, fin, aforo_maximo, cancelada)
select 'zzdrill-ses-a' || i, 'zzdrill-st', 'zzdrill-tc-a', 'zzdrill-sala-a', 'zzdrill-ins-1',
       ((fx.martes1 + (i - 1) * 7) + time '10:00') at time zone 'Europe/Madrid',
       ((fx.martes1 + (i - 1) * 7) + time '10:50') at time zone 'Europe/Madrid', 6, false
from fx, generate_series(1, 3) as i
union all
select 'zzdrill-ses-c' || i, 'zzdrill-st', 'zzdrill-tc-c', 'zzdrill-sala-b', 'zzdrill-ins-1',
       ((fx.martes1 + (i - 1) * 7) + time '12:00') at time zone 'Europe/Madrid',
       ((fx.martes1 + (i - 1) * 7) + time '12:50') at time zone 'Europe/Madrid', 6, false
from fx, generate_series(1, 3) as i;

insert into plazas_fijas (id, studio_id, socio_id, dia_semana, hora_inicio, sala_id, vigencia_desde, estado, creada_en)
select 'zzdrill-pf-' || s, 'zzdrill-st', 'zzdrill-soc-' || s, 2,
       case when s in (4, 5) then time '12:00' else time '10:00' end,
       case when s in (4, 5) then 'zzdrill-sala-b' else 'zzdrill-sala-a' end,
       current_date - 7, 'ACTIVA', now() - make_interval(days => 10 - s)
from generate_series(1, 7) as s;

-- e) soc-6 tiene la 1ª clase pendiente de aprobar.
insert into reservas (id, studio_id, sesion_id, socio_id, estado, creado_en)
  values ('zzdrill-r-pend', 'zzdrill-st', 'zzdrill-ses-a1', 'zzdrill-soc-6', 'PENDIENTE_APROBACION', now());
-- f) soc-7: la 1ª soltada al pausar la plaza, la 2ª cancelada por ella.
insert into reservas (id, studio_id, sesion_id, socio_id, estado, creado_en, cancelada_motivo) values
  ('res-pf-zzdrill-retirada', 'zzdrill-st', 'zzdrill-ses-a1', 'zzdrill-soc-7', 'CANCELADA', now(), 'plaza_fija_retirada'),
  ('res-pf-zzdrill-puntual',  'zzdrill-st', 'zzdrill-ses-a2', 'zzdrill-soc-7', 'CANCELADA', now(), null);

-- ── Pasada ───────────────────────────────────────────────────────────────────
create temp table huecos as select * from public.plazas_fijas_sin_materializar(42);
select public.materializar_plazas_fijas(42);

do $$
declare n int;
begin
  select count(*) into n from reservas where socio_id = 'zzdrill-soc-1' and id like 'res-pf-%' and estado = 'CONFIRMADA';
  assert n = 3, 'a: plan vigente reserva sus 3 clases, reservó ' || n;

  select count(*) into n from reservas where socio_id = 'zzdrill-soc-2';
  assert n = 0, 'b: plan vencido no reserva, reservó ' || n;
  select count(*) into n from huecos where socio_id = 'zzdrill-soc-2' and motivo = 'sin_plan_vigente';
  assert n = 3, 'b: 3 avisos sin_plan_vigente, hay ' || n;

  select count(*) into n from reservas where socio_id = 'zzdrill-soc-3';
  assert n = 0, 'c: plan de Mat no reserva Reformer, reservó ' || n;
  select count(*) into n from huecos where socio_id = 'zzdrill-soc-3' and motivo = 'sin_plan_vigente';
  assert n = 3, 'c: 3 avisos sin_plan_vigente, hay ' || n;

  select count(*) into n from reservas where socio_id = 'zzdrill-soc-4';
  assert n = 0, 'd: sin autorizar no reserva, reservó ' || n;
  select count(*) into n from huecos where socio_id = 'zzdrill-soc-4' and motivo = 'sin_autorizacion';
  assert n = 3, 'd: 3 avisos sin_autorizacion, hay ' || n;
  select count(*) into n from reservas where socio_id = 'zzdrill-soc-5' and id like 'res-pf-%';
  assert n = 3, 'd: la autorizada reserva sus 3, reservó ' || n;

  select count(*) into n from reservas where socio_id = 'zzdrill-soc-6' and id like 'res-pf-%';
  assert n = 2, 'e: con una pendiente de aprobar reserva las otras 2, reservó ' || n;
  select count(*) into n from huecos where socio_id = 'zzdrill-soc-6';
  assert n = 0, 'e: la pendiente no es un hueco, hay ' || n;

  select count(*) into n from reservas where socio_id = 'zzdrill-soc-7' and sesion_id = 'zzdrill-ses-a1' and estado = 'CONFIRMADA';
  assert n = 1, 'f: la soltada al pausar vuelve a reservarse, hay ' || n;
  select count(*) into n from reservas where socio_id = 'zzdrill-soc-7' and sesion_id = 'zzdrill-ses-a2' and estado = 'CONFIRMADA';
  assert n = 0, 'f: la cancelada por ella se respeta, hay ' || n;
end $$;

-- ── g. CHECK de cancelada_motivo ─────────────────────────────────────────────
do $$
begin
  begin
    update reservas set cancelada_motivo = 'inventado' where id = 'res-pf-zzdrill-puntual';
    assert false, 'g: el CHECK tenía que rechazar un motivo inventado';
  exception when check_violation then null;
  end;
end $$;

-- ── h. Grants: create or replace con la misma firma los conserva ─────────────
do $$
begin
  assert not has_function_privilege('anon', 'public.materializar_plazas_fijas(integer)', 'EXECUTE'), 'h: anon materializar';
  assert not has_function_privilege('authenticated', 'public.materializar_plazas_fijas(integer)', 'EXECUTE'), 'h: authenticated materializar';
  assert has_function_privilege('service_role', 'public.materializar_plazas_fijas(integer)', 'EXECUTE'), 'h: service_role materializar';
  assert not has_function_privilege('anon', 'public.plazas_fijas_sin_materializar(integer)', 'EXECUTE'), 'h: anon sin_materializar';
  assert not has_function_privilege('authenticated', 'public.plazas_fijas_sin_materializar(integer)', 'EXECUTE'), 'h: authenticated sin_materializar';
  assert has_function_privilege('service_role', 'public.plazas_fijas_sin_materializar(integer)', 'EXECUTE'), 'h: service_role sin_materializar';
end $$;

rollback;
