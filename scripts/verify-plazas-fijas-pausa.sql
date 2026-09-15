-- Drill de la pausa con fechas de plaza fija (migr 20260915090000). TODO dentro
-- de una transacción que termina en ROLLBACK: no deja nada. Fixture con prefijo
-- `zzdrill-`.
--
-- Cómo correrlo (Supabase local, desde la raíz del repo):
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f scripts/verify-plazas-fijas-pausa.sql
-- Un assert fallido corta con el mensaje del escenario; sin error = todo OK.
--
-- Escenarios: a) el CHECK no deja pausas a medias ni al revés · b) el motor se
-- salta las fechas en pausa · c) en pausa no se avisa de nada · d) al quitarla
-- se reserva ya lo que vuelve y el aviso reaparece · e) mover la serie a mitad
-- de una pausa parte la plaza y el tramo nuevo conserva la pausa · grants.
\set ON_ERROR_STOP on
begin;

\i supabase/migrations/20260915090000_plazas_fijas_pausa_con_fechas.sql

insert into studios (id, nombre) values ('zzdrill-st', 'Estudio PF');
insert into salas (id, studio_id, nombre, capacidad) values ('zzdrill-sala-a', 'zzdrill-st', 'Sala A', 6);
insert into tipos_clase (id, studio_id, nombre) values ('zzdrill-tc-a', 'zzdrill-st', 'Reformer');
insert into instructores (id, studio_id, nombre) values ('zzdrill-ins-1', 'zzdrill-st', 'Ana');
insert into socios (id, studio_id, nombre, apellidos, email)
values ('zzdrill-soc-1', 'zzdrill-st', 'Socia', '1', 'zzdrill-1@example.com');
insert into planes_tarifa (id, studio_id, nombre, precio, tipo, sesiones, activo)
values ('zzdrill-plan-cuota', 'zzdrill-st', 'Mensual', 60, 'MENSUAL', null, true);
insert into suscripciones (id, studio_id, socio_id, plan_id, estado, fecha_inicio, fecha_fin, sesiones_restantes)
values ('zzdrill-sus-1', 'zzdrill-st', 'zzdrill-soc-1', 'zzdrill-plan-cuota', 'ACTIVA', current_date - 30, null, null);
create temp table fx as
  select ((now() at time zone 'Europe/Madrid')::date + ((2 - extract(dow from (now() at time zone 'Europe/Madrid'))::int + 7) % 7) + 7) as martes1;
-- Cuatro martes seguidos a las 10:00, de la misma serie.
insert into sesiones (id, studio_id, tipo_clase_id, sala_id, instructor_id, inicio, fin, aforo_maximo, cancelada, serie_id)
select 'zzdrill-ses-' || i, 'zzdrill-st', 'zzdrill-tc-a', 'zzdrill-sala-a', 'zzdrill-ins-1',
       ((fx.martes1 + (i - 1) * 7) + time '10:00') at time zone 'Europe/Madrid',
       ((fx.martes1 + (i - 1) * 7) + time '10:50') at time zone 'Europe/Madrid', 6, false, 'zzdrill-serie'
from fx, generate_series(1, 4) as i;
update sesiones set cancelada = true where id = 'zzdrill-ses-2';
-- En pausa las semanas 2 y 3.
insert into plazas_fijas (id, studio_id, socio_id, dia_semana, hora_inicio, sala_id, vigencia_desde, estado, creada_en, pausa_desde, pausa_hasta)
select 'zzdrill-pf-1', 'zzdrill-st', 'zzdrill-soc-1', 2, time '10:00', 'zzdrill-sala-a', current_date - 7, 'ACTIVA', now(), fx.martes1 + 7, fx.martes1 + 14
from fx;

do $$
declare n int; creadas int; f date;
begin
  select martes1 into f from fx;

  -- a) pausas imposibles
  begin
    update plazas_fijas set pausa_hasta = null where id = 'zzdrill-pf-1';
    raise exception 'a: aceptó una pausa sin «hasta»';
  exception when check_violation then null;
  end;
  begin
    update plazas_fijas set pausa_hasta = pausa_desde - 1 where id = 'zzdrill-pf-1';
    raise exception 'a: aceptó una pausa al revés';
  exception when check_violation then null;
  end;

  -- b) semanas 1 y 4 sí; la 3 (en pausa) no
  select public.materializar_plazas_fijas(42, 'zzdrill-pf-1') into creadas;
  assert creadas = 2, 'b: creadas = ' || creadas;
  select count(*) into n from reservas where socio_id = 'zzdrill-soc-1' and sesion_id = 'zzdrill-ses-3';
  assert n = 0, 'b: reservó una clase en pausa';

  -- c) la clase cancelada cae en la pausa: nada que avisar
  select count(*) into n from public.plazas_fijas_sin_materializar(42) r where r.socio_id = 'zzdrill-soc-1';
  assert n = 0, 'c: avisos en pausa = ' || n;

  -- d) sin pausa: la semana 3 se reserva ya y la cancelada sí se avisa
  update plazas_fijas set pausa_desde = null, pausa_hasta = null where id = 'zzdrill-pf-1';
  select public.materializar_plazas_fijas(42, 'zzdrill-pf-1') into creadas;
  assert creadas = 1, 'd: al quitar la pausa creó ' || creadas;
  select count(*) into n from public.plazas_fijas_sin_materializar(42) r
   where r.socio_id = 'zzdrill-soc-1' and r.motivo = 'sesion_cancelada';
  assert n = 1, 'd: aviso de clase cancelada sin pausa = ' || n;

  -- e) mover la serie desde la semana 3 con una pausa en marcha
  update plazas_fijas set pausa_desde = f + 14, pausa_hasta = f + 21 where id = 'zzdrill-pf-1';
  perform public.editar_serie_desde('zzdrill-st', 'zzdrill-ses-3', 'zzdrill-tc-a', 'zzdrill-sala-a', 'zzdrill-ins-1', 6, null, '11:00', '11:50');
  select count(*) into n from plazas_fijas
   where socio_id = 'zzdrill-soc-1' and hora_inicio = time '11:00' and pausa_desde = f + 14 and pausa_hasta = f + 21;
  assert n = 1, 'e: tramo nuevo con la pausa = ' || n;
  select count(*) into n from plazas_fijas where id = 'zzdrill-pf-1' and vigencia_hasta = f + 13;
  assert n = 1, 'e: el tramo viejo no terminó la víspera';

  -- grants
  assert not has_function_privilege('anon', 'public.materializar_plazas_fijas(integer, text)', 'EXECUTE'), 'grants: anon materializar';
  assert not has_function_privilege('authenticated', 'public.materializar_plazas_fijas(integer, text)', 'EXECUTE'), 'grants: authenticated materializar';
  assert has_function_privilege('service_role', 'public.materializar_plazas_fijas(integer, text)', 'EXECUTE'), 'grants: service_role materializar';
  assert not has_function_privilege('anon', 'public.plazas_fijas_sin_materializar(integer)', 'EXECUTE'), 'grants: anon sin_materializar';
  assert not has_function_privilege('authenticated', 'public.plazas_fijas_sin_materializar(integer)', 'EXECUTE'), 'grants: authenticated sin_materializar';
  assert has_function_privilege('service_role', 'public.plazas_fijas_sin_materializar(integer)', 'EXECUTE'), 'grants: service_role sin_materializar';
  assert not has_function_privilege('anon', 'public.editar_serie_desde(text, text, text, text, text, integer, text, text, text)', 'EXECUTE'), 'grants: anon editar_serie_desde';
  assert has_function_privilege('authenticated', 'public.editar_serie_desde(text, text, text, text, text, integer, text, text, text)', 'EXECUTE'), 'grants: authenticated editar_serie_desde';
end $$;

rollback;
