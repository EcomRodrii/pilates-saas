-- Drill de `editar_serie_desde` moviendo plazas fijas (migr 20260904153000).
-- TODO dentro de una transacción que termina en ROLLBACK: no deja nada. Los ids
-- del fixture llevan el prefijo `zzdrill-` para no chocar con datos reales
-- (en producción existe `spot-1`, `soc-1`…).
--
-- Cómo correrlo (Supabase local, desde la raíz del repo):
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f scripts/verify-plazas-fijas-editar-serie.sql
-- Un assert fallido corta con el mensaje del escenario; sin error = todo OK.
-- Al final imprime los grants de la función.
--
-- Escenarios: a) hora 10→11 en sitio + materialización en el slot nuevo ·
-- b) cambio de sala suelta el sitio · c) choque de sitio en el slot nuevo →
-- sin sitio, sin error · d) solo instructora: nada se toca · e) tipo acotado
-- sigue al tipo nuevo · f) editar «desde» la 4ª clase: se parte en dos tramos
-- con la misma antigüedad y materializa en ambos · g) solape → rollback de
-- todo · i) clase SUELTA no mueve nada · j) otra serie sigue en el slot viejo:
-- no se toca · k) serie lunes+miércoles: cada plaza conserva su día · h) grants.
--
-- Corrido el 2026-09-05 contra PRODUCCIÓN (execute_sql con BEGIN … ROLLBACK,
-- misma práctica que el resto del repo) con la migración inlined en vez del
-- `\i`: los 11 escenarios pasaron y no quedó nada (0 filas `zzdrill-`, la
-- función sin el bloque de plazas). El DB local no aceptaba conexiones ese día.
\set ON_ERROR_STOP on
begin;

\i supabase/migrations/20260904153000_editar_serie_desde_mueve_plazas_fijas.sql


-- ── Fixture ──────────────────────────────────────────────────────────────────
insert into studios (id, nombre) values ('zzdrill-st', 'Estudio PF');
insert into salas (id, studio_id, nombre, capacidad) values ('zzdrill-sala-a', 'zzdrill-st', 'Sala A', 6), ('zzdrill-sala-b', 'zzdrill-st', 'Sala B', 6);
insert into spots (id, sala_id, studio_id, numero, nombre, fila, columna, tipo, activo)
  values ('zzdrill-spot-1', 'zzdrill-sala-a', 'zzdrill-st', 1, 'Reformer 1', 1, 1, 'REFORMER', true),
         ('zzdrill-spot-2', 'zzdrill-sala-a', 'zzdrill-st', 2, 'Reformer 2', 1, 2, 'REFORMER', true);
insert into tipos_clase (id, studio_id, nombre) values ('zzdrill-tc-a', 'zzdrill-st', 'Reformer'), ('zzdrill-tc-b', 'zzdrill-st', 'Mat');
insert into instructores (id, studio_id, nombre) values ('zzdrill-ins-1', 'zzdrill-st', 'Ana'), ('zzdrill-ins-2', 'zzdrill-st', 'Bea');
insert into socios (id, studio_id, nombre, apellidos, email)
  values ('zzdrill-soc-1', 'zzdrill-st', 'María', 'Uno', 'm1@x.es'), ('zzdrill-soc-2', 'zzdrill-st', 'Marta', 'Dos', 'm2@x.es'), ('zzdrill-soc-3', 'zzdrill-st', 'Mónica', 'Tres', 'm3@x.es');
insert into suscripciones (id, studio_id, socio_id, estado, fecha_inicio) values ('zzdrill-sus-1', 'zzdrill-st', 'zzdrill-soc-1', 'ACTIVA', current_date - 30);

-- 8 martes a las 10:00 Madrid, empezando el martes de la semana que viene (nunca hoy).
create temp table fx as
  select (( (now() at time zone 'Europe/Madrid')::date + ((2 - extract(dow from (now() at time zone 'Europe/Madrid'))::int + 7) % 7) + 7)) as martes1;
insert into sesiones (id, studio_id, tipo_clase_id, sala_id, instructor_id, inicio, fin, aforo_maximo, cancelada, serie_id)
select 'zzdrill-ses-' || i, 'zzdrill-st', 'zzdrill-tc-a', 'zzdrill-sala-a', 'zzdrill-ins-1',
       ((fx.martes1 + (i - 1) * 7) + time '10:00') at time zone 'Europe/Madrid',
       ((fx.martes1 + (i - 1) * 7) + time '10:50') at time zone 'Europe/Madrid',
       6, false, 'zzdrill-serie-1'
from fx, generate_series(1, 8) as i;

insert into plazas_fijas (id, studio_id, socio_id, dia_semana, hora_inicio, sala_id, tipo_clase_id, spot_id, vigencia_desde, vigencia_hasta, estado, creada_en) values
  ('zzdrill-pf-1', 'zzdrill-st', 'zzdrill-soc-1', 2, '10:00', 'zzdrill-sala-a', null,   'zzdrill-spot-1', current_date - 60, null, 'ACTIVA',  now() - interval '60 days'),
  ('zzdrill-pf-2', 'zzdrill-st', 'zzdrill-soc-2', 2, '10:00', 'zzdrill-sala-a', 'zzdrill-tc-a', null,     current_date - 30, null, 'ACTIVA',  now() - interval '30 days'),
  ('zzdrill-pf-3', 'zzdrill-st', 'zzdrill-soc-3', 2, '10:00', 'zzdrill-sala-a', null,   null,     current_date - 10, null, 'PAUSADA', now() - interval '10 days'),
  ('zzdrill-pf-4', 'zzdrill-st', 'zzdrill-soc-3', 2, '10:00', 'zzdrill-sala-a', null,   null,     current_date - 90, null, 'BAJA',    now() - interval '90 days'),
  ('zzdrill-pf-6', 'zzdrill-st', 'zzdrill-soc-3', 2, '10:00', 'zzdrill-sala-a', null,   null,     current_date - 90, current_date - 1, 'ACTIVA', now() - interval '90 days'),
  -- Otro slot (martes 12:00) con el sitio 1 ya cogido: choque para el escenario c.
  ('zzdrill-pf-5', 'zzdrill-st', 'zzdrill-soc-2', 2, '12:00', 'zzdrill-sala-a', null,   'zzdrill-spot-1', current_date - 5,  null, 'ACTIVA',  now() - interval '5 days');

create temp table antes as select id, dia_semana, hora_inicio, sala_id, tipo_clase_id, spot_id, vigencia_desde, vigencia_hasta, estado, creada_en from plazas_fijas where studio_id = 'zzdrill-st';

-- ── a. Hora 10:00 → 11:00 desde la primera clase: en sitio ────────────────────
savepoint a;
do $$
declare n int; r record;
begin
  select public.editar_serie_desde('zzdrill-st', 'zzdrill-ses-1', 'zzdrill-tc-a', 'zzdrill-sala-a', 'zzdrill-ins-1', 6, null, '11:00', '11:50') into n;
  assert n = 8, 'a: sesiones tocadas ' || n;
  select * into r from plazas_fijas where id = 'zzdrill-pf-1';
  assert r.hora_inicio = time '11:00' and r.sala_id = 'zzdrill-sala-a' and r.spot_id = 'zzdrill-spot-1' and r.vigencia_hasta is null, 'a: pf-1 ' || r::text;
  select * into r from plazas_fijas where id = 'zzdrill-pf-2';
  assert r.hora_inicio = time '11:00' and r.tipo_clase_id = 'zzdrill-tc-a', 'a: pf-2 ' || r::text;
  select * into r from plazas_fijas where id = 'zzdrill-pf-3';
  assert r.hora_inicio = time '11:00' and r.estado = 'PAUSADA', 'a: pf-3 (PAUSADA sigue) ' || r::text;
  select * into r from plazas_fijas where id = 'zzdrill-pf-4';
  assert r.hora_inicio = time '10:00', 'a: pf-4 (BAJA no se toca) ' || r::text;
  select * into r from plazas_fijas where id = 'zzdrill-pf-6';
  assert r.hora_inicio = time '10:00', 'a: pf-6 (vigencia terminada no se toca) ' || r::text;
  assert (select count(*) from plazas_fijas where studio_id = 'zzdrill-st') = 6, 'a: no se crean filas nuevas';
  -- La materialización posterior encuentra el slot nuevo y crea las reservas de soc-1.
  select public.materializar_plazas_fijas(42) into n;
  assert n >= 5, 'a: materializadas ' || n;
  assert (select count(*) from reservas r2 join sesiones s on s.id = r2.sesion_id where r2.socio_id = 'zzdrill-soc-1' and r2.id like 'res-pf-%' and (s.inicio at time zone 'Europe/Madrid')::time = time '11:00') >= 5, 'a: reservas en el slot nuevo';
end $$;
rollback to savepoint a;

-- ── b. Cambio de sala A → B: la plaza sigue, el sitio (de la sala A) no viaja ──
savepoint b;
do $$
declare r record;
begin
  perform public.editar_serie_desde('zzdrill-st', 'zzdrill-ses-1', 'zzdrill-tc-a', 'zzdrill-sala-b', 'zzdrill-ins-1', 6, null, '10:00', '10:50');
  select * into r from plazas_fijas where id = 'zzdrill-pf-1';
  assert r.sala_id = 'zzdrill-sala-b' and r.hora_inicio = time '10:00' and r.spot_id is null, 'b: pf-1 ' || r::text;
  select * into r from plazas_fijas where id = 'zzdrill-pf-2';
  assert r.sala_id = 'zzdrill-sala-b', 'b: pf-2 ' || r::text;
end $$;
rollback to savepoint b;

-- ── c. Hora → 12:00, donde otra socia ya tiene el sitio 1: se suelta el sitio, no falla ──
savepoint c;
do $$
declare r record;
begin
  perform public.editar_serie_desde('zzdrill-st', 'zzdrill-ses-1', 'zzdrill-tc-a', 'zzdrill-sala-a', 'zzdrill-ins-1', 6, null, '12:00', '12:50');
  select * into r from plazas_fijas where id = 'zzdrill-pf-1';
  assert r.hora_inicio = time '12:00' and r.spot_id is null, 'c: pf-1 ' || r::text;
  select * into r from plazas_fijas where id = 'zzdrill-pf-5';
  assert r.spot_id = 'zzdrill-spot-1' and r.hora_inicio = time '12:00', 'c: pf-5 intacta ' || r::text;
end $$;
rollback to savepoint c;

-- ── d. Solo cambia la instructora: ninguna plaza se toca ──────────────────────
savepoint d;
do $$
begin
  perform public.editar_serie_desde('zzdrill-st', 'zzdrill-ses-1', 'zzdrill-tc-a', 'zzdrill-sala-a', 'zzdrill-ins-2', 6, null, '10:00', '10:50');
  assert not exists (
    select 1 from plazas_fijas p join antes a on a.id = p.id
    where p.studio_id = 'zzdrill-st' and (p.hora_inicio, p.sala_id, p.spot_id, p.vigencia_hasta, p.estado) is distinct from (a.hora_inicio, a.sala_id, a.spot_id, a.vigencia_hasta, a.estado)
       or p.tipo_clase_id is distinct from a.tipo_clase_id
  ), 'd: alguna plaza cambió';
  assert (select count(*) from plazas_fijas where studio_id = 'zzdrill-st') = 6, 'd: filas';
end $$;
rollback to savepoint d;

-- ── e. Cambia el tipo de clase: la acotada sigue al tipo nuevo, la libre sigue libre ──
savepoint e;
do $$
declare r record;
begin
  perform public.editar_serie_desde('zzdrill-st', 'zzdrill-ses-1', 'zzdrill-tc-b', 'zzdrill-sala-a', 'zzdrill-ins-1', 6, null, '10:00', '10:50');
  select * into r from plazas_fijas where id = 'zzdrill-pf-2';
  assert r.tipo_clase_id = 'zzdrill-tc-b' and r.hora_inicio = time '10:00', 'e: pf-2 ' || r::text;
  select * into r from plazas_fijas where id = 'zzdrill-pf-1';
  assert r.tipo_clase_id is null and r.spot_id = 'zzdrill-spot-1', 'e: pf-1 ' || r::text;
end $$;
rollback to savepoint e;

-- ── f. Editar "desde" la 4ª clase (quedan 3 en el slot viejo): se parte ───────
savepoint f;
do $$
declare r record; nueva record; f4 date;
begin
  select (inicio at time zone 'Europe/Madrid')::date into f4 from sesiones where id = 'zzdrill-ses-4';
  perform public.editar_serie_desde('zzdrill-st', 'zzdrill-ses-4', 'zzdrill-tc-a', 'zzdrill-sala-a', 'zzdrill-ins-1', 6, null, '11:00', '11:50');
  select * into r from plazas_fijas where id = 'zzdrill-pf-1';
  assert r.hora_inicio = time '10:00' and r.vigencia_hasta = f4 - 1, 'f: tramo viejo ' || r::text;
  select * into nueva from plazas_fijas where studio_id = 'zzdrill-st' and socio_id = 'zzdrill-soc-1' and id <> 'zzdrill-pf-1';
  assert nueva.hora_inicio = time '11:00' and nueva.sala_id = 'zzdrill-sala-a' and nueva.spot_id = 'zzdrill-spot-1'
     and nueva.vigencia_desde = f4 and nueva.vigencia_hasta is null and nueva.estado = 'ACTIVA'
     and nueva.creada_en = r.creada_en, 'f: tramo nuevo ' || nueva::text;
  -- La PAUSADA también se parte conservando el estado.
  assert (select count(*) from plazas_fijas where studio_id = 'zzdrill-st' and socio_id = 'zzdrill-soc-3' and estado = 'PAUSADA') = 2, 'f: pausada partida';
  -- Sesiones: 1-3 siguen a las 10:00, 4-8 a las 11:00.
  assert (select count(*) from sesiones where serie_id = 'zzdrill-serie-1' and (inicio at time zone 'Europe/Madrid')::time = time '10:00') = 3, 'f: 3 a las 10';
  assert (select count(*) from sesiones where serie_id = 'zzdrill-serie-1' and (inicio at time zone 'Europe/Madrid')::time = time '11:00') = 5, 'f: 5 a las 11';
  -- Y la materialización coloca a soc-1 en los dos tramos: 3 a las 10 + 5 a las 11 (dentro del horizonte de 42 días).
  perform public.materializar_plazas_fijas(42);
  assert (select count(distinct (s.inicio at time zone 'Europe/Madrid')::time) from reservas r2 join sesiones s on s.id = r2.sesion_id where r2.socio_id = 'zzdrill-soc-1' and r2.id like 'res-pf-%') = 2, 'f: reservas en ambos tramos';
end $$;
rollback to savepoint f;

-- ── g. El UPDATE de sesiones falla por solape: las plazas también hacen rollback ──
savepoint g;
insert into sesiones (id, studio_id, tipo_clase_id, sala_id, instructor_id, inicio, fin, aforo_maximo, cancelada)
select 'zzdrill-ses-choque', 'zzdrill-st', 'zzdrill-tc-b', 'zzdrill-sala-a', 'zzdrill-ins-2',
       ((fx.martes1 + 7) + time '11:00') at time zone 'Europe/Madrid', ((fx.martes1 + 7) + time '11:50') at time zone 'Europe/Madrid', 6, false
from fx;
do $$
declare r record; fallo boolean := false;
begin
  begin
    perform public.editar_serie_desde('zzdrill-st', 'zzdrill-ses-1', 'zzdrill-tc-a', 'zzdrill-sala-a', 'zzdrill-ins-1', 6, null, '11:00', '11:50');
  exception when exclusion_violation then
    fallo := true;
  end;
  assert fallo, 'g: debía fallar por solape';
  select * into r from plazas_fijas where id = 'zzdrill-pf-1';
  assert r.hora_inicio = time '10:00' and r.vigencia_hasta is null, 'g: pf-1 tocada pese al rollback ' || r::text;
  assert (select count(*) from plazas_fijas where studio_id = 'zzdrill-st') = 6, 'g: filas';
end $$;
rollback to savepoint g;

-- ── i. Clase SUELTA (sin serie): la RPC la edita pero NO mueve ninguna plaza ──
savepoint i;
insert into sesiones (id, studio_id, tipo_clase_id, sala_id, instructor_id, inicio, fin, aforo_maximo, cancelada, serie_id)
select 'zzdrill-ses-suelta', 'zzdrill-st', 'zzdrill-tc-a', 'zzdrill-sala-a', 'zzdrill-ins-1',
       ((fx.martes1 + 2) + time '10:00') at time zone 'Europe/Madrid', ((fx.martes1 + 2) + time '10:50') at time zone 'Europe/Madrid', 6, false, null
from fx;
insert into plazas_fijas (id, studio_id, socio_id, dia_semana, hora_inicio, sala_id, vigencia_desde, estado, creada_en)
  values ('zzdrill-pf-7', 'zzdrill-st', 'zzdrill-soc-1', 4, '10:00', 'zzdrill-sala-a', current_date - 10, 'ACTIVA', now());
do $$
declare r record; n int;
begin
  select public.editar_serie_desde('zzdrill-st', 'zzdrill-ses-suelta', 'zzdrill-tc-a', 'zzdrill-sala-a', 'zzdrill-ins-1', 6, null, '11:00', '11:50') into n;
  assert n = 1, 'i: sesiones tocadas ' || n;
  select * into r from plazas_fijas where id = 'zzdrill-pf-7';
  assert r.hora_inicio = time '10:00', 'i: pf-7 se movió con una clase suelta ' || r::text;
end $$;
rollback to savepoint i;

-- ── j. Otra serie sigue ocupando el slot viejo desde la fecha del cambio: no se toca ──
savepoint j;
insert into sesiones (id, studio_id, tipo_clase_id, sala_id, instructor_id, inicio, fin, aforo_maximo, cancelada, serie_id)
select 'zzdrill-ses2-' || i, 'zzdrill-st', 'zzdrill-tc-a', 'zzdrill-sala-a', 'zzdrill-ins-2',
       ((fx.martes1 + (7 + i) * 7) + time '10:00') at time zone 'Europe/Madrid',
       ((fx.martes1 + (7 + i) * 7) + time '10:50') at time zone 'Europe/Madrid',
       6, false, 'zzdrill-serie-2'
from fx, generate_series(1, 4) as i;
do $$
declare r record;
begin
  perform public.editar_serie_desde('zzdrill-st', 'zzdrill-ses-1', 'zzdrill-tc-a', 'zzdrill-sala-a', 'zzdrill-ins-1', 6, null, '11:00', '11:50');
  select * into r from plazas_fijas where id = 'zzdrill-pf-1';
  assert r.hora_inicio = time '10:00' and r.vigencia_hasta is null, 'j: pf-1 debía quedarse (el slot sigue con clase) ' || r::text;
  assert (select count(*) from plazas_fijas where studio_id = 'zzdrill-st') = 6, 'j: filas';
end $$;
rollback to savepoint j;

-- ── k. Serie con dos días (lunes + miércoles): cada plaza conserva su día ─────
savepoint k;
insert into sesiones (id, studio_id, tipo_clase_id, sala_id, instructor_id, inicio, fin, aforo_maximo, cancelada, serie_id)
select 'zzdrill-ses3-' || d || '-' || i, 'zzdrill-st', 'zzdrill-tc-b', 'zzdrill-sala-b', 'zzdrill-ins-2',
       ((fx.martes1 - 1 + d + (i - 1) * 7) + time '18:00') at time zone 'Europe/Madrid',
       ((fx.martes1 - 1 + d + (i - 1) * 7) + time '18:50') at time zone 'Europe/Madrid',
       6, false, 'zzdrill-serie-3'
from fx, (values (0), (2)) as dd(d), generate_series(1, 4) as i;  -- lunes (martes1-1) y miércoles (+2)
insert into plazas_fijas (id, studio_id, socio_id, dia_semana, hora_inicio, sala_id, vigencia_desde, estado, creada_en) values
  ('zzdrill-pf-8', 'zzdrill-st', 'zzdrill-soc-1', 1, '18:00', 'zzdrill-sala-b', current_date - 10, 'ACTIVA', now()),
  ('zzdrill-pf-9', 'zzdrill-st', 'zzdrill-soc-2', 3, '18:00', 'zzdrill-sala-b', current_date - 10, 'ACTIVA', now());
do $$
declare r8 record; r9 record; n int;
begin
  select public.editar_serie_desde('zzdrill-st', 'zzdrill-ses3-0-1', 'zzdrill-tc-b', 'zzdrill-sala-b', 'zzdrill-ins-2', 6, null, '19:00', '19:50') into n;
  assert n = 8, 'k: sesiones tocadas ' || n;
  select * into r8 from plazas_fijas where id = 'zzdrill-pf-8';
  select * into r9 from plazas_fijas where id = 'zzdrill-pf-9';
  assert r8.hora_inicio = time '19:00' and r8.dia_semana = 1, 'k: pf-8 ' || r8::text;
  assert r9.hora_inicio = time '19:00' and r9.dia_semana = 3, 'k: pf-9 ' || r9::text;
end $$;
rollback to savepoint k;

-- ── h. Grants ────────────────────────────────────────────────────────────────
select rol, has_function_privilege(rol, 'public.editar_serie_desde(text, text, text, text, text, integer, text, text, text)', 'EXECUTE') as execute
from (values ('anon'), ('authenticated'), ('service_role')) as t(rol);


rollback;
