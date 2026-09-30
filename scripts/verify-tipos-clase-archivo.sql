-- Drill: un tipo de clase archivado no programa clases nuevas (migr
-- 20260930215125). TODO dentro de una transacción que termina en ROLLBACK: no
-- deja nada. Fixture con prefijo `zzdrill-`.
--
-- Cómo correrlo (Supabase local, desde la raíz del repo):
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f scripts/verify-tipos-clase-archivo.sql
-- Un assert fallido corta con el mensaje del escenario; sin error = todo OK.
--
-- Escenarios: a) clase FUTURA de un tipo archivado → TIPO_ARCHIVADO · b) una
-- PASADA entra (importar historial) · c) mover una futura ya programada de un
-- tipo archivado entra · d) cambiarle a una futura el tipo por uno archivado →
-- TIPO_ARCHIVADO · e) `renovar_serie` al simular → TIPO_ARCHIVADO · f) al
-- recuperarlo vuelve a dejar · g) CHECK de `orden` · h) permisos.
\set ON_ERROR_STOP on
begin;

\i supabase/migrations/20260930215125_tipos_clase_orden_y_archivo.sql

insert into studios (id, nombre) values ('zzdrill-st', 'Estudio tipos archivados');
insert into salas (id, studio_id, nombre, capacidad) values ('zzdrill-sala-a', 'zzdrill-st', 'Sala A', 6);
insert into tipos_clase (id, studio_id, nombre) values
  ('zzdrill-tc-viejo', 'zzdrill-st', 'Mat + Circuito'),
  ('zzdrill-tc-vivo', 'zzdrill-st', 'Reformer');
insert into instructores (id, studio_id, nombre) values ('zzdrill-ins-1', 'zzdrill-st', 'Ana');

do $$
declare
  v_lunes date := (now() at time zone 'Europe/Madrid')::date + ((1 - extract(dow from (now() at time zone 'Europe/Madrid'))::int + 7) % 7) + 14;
  v_error text;
  r jsonb;
  n int;
begin
  -- Una serie de dos lunes, creada mientras el tipo estaba activo.
  insert into sesiones (id, studio_id, tipo_clase_id, sala_id, instructor_id, inicio, fin, aforo_maximo, cancelada, serie_id) values
    ('zzdrill-ses-1', 'zzdrill-st', 'zzdrill-tc-viejo', 'zzdrill-sala-a', 'zzdrill-ins-1',
     (v_lunes + time '10:00') at time zone 'Europe/Madrid', (v_lunes + time '10:50') at time zone 'Europe/Madrid', 6, false, 'zzdrill-serie'),
    ('zzdrill-ses-2', 'zzdrill-st', 'zzdrill-tc-viejo', 'zzdrill-sala-a', 'zzdrill-ins-1',
     (v_lunes + 7 + time '10:00') at time zone 'Europe/Madrid', (v_lunes + 7 + time '10:50') at time zone 'Europe/Madrid', 6, false, 'zzdrill-serie');
  -- Una suelta de OTRO tipo, para el escenario d.
  insert into sesiones (id, studio_id, tipo_clase_id, sala_id, instructor_id, inicio, fin, aforo_maximo, cancelada) values
    ('zzdrill-ses-otra', 'zzdrill-st', 'zzdrill-tc-vivo', 'zzdrill-sala-a', 'zzdrill-ins-1',
     (v_lunes + 1 + time '10:00') at time zone 'Europe/Madrid', (v_lunes + 1 + time '10:50') at time zone 'Europe/Madrid', 6, false);

  update tipos_clase set archivado_en = now() where id = 'zzdrill-tc-viejo';

  -- a) clase futura nueva de un tipo archivado
  v_error := null;
  begin
    insert into sesiones (id, studio_id, tipo_clase_id, sala_id, instructor_id, inicio, fin, aforo_maximo, cancelada) values
      ('zzdrill-ses-nueva', 'zzdrill-st', 'zzdrill-tc-viejo', 'zzdrill-sala-a', 'zzdrill-ins-1',
       (v_lunes + 2 + time '10:00') at time zone 'Europe/Madrid', (v_lunes + 2 + time '10:50') at time zone 'Europe/Madrid', 6, false);
  exception when others then v_error := sqlerrm;
  end;
  assert v_error = 'TIPO_ARCHIVADO', 'a: la clase futura entró (' || coalesce(v_error, 'sin error') || ')';

  -- b) una pasada entra: importar historial de un tipo que ya no se da
  insert into sesiones (id, studio_id, tipo_clase_id, sala_id, instructor_id, inicio, fin, aforo_maximo, cancelada) values
    ('zzdrill-ses-pasada', 'zzdrill-st', 'zzdrill-tc-viejo', 'zzdrill-sala-a', 'zzdrill-ins-1',
     now() - interval '30 days', now() - interval '30 days' + interval '50 minutes', 6, false);

  -- c) mover una ya programada (sin cambiar el tipo) entra, también si se
  -- reescribe tipo_clase_id con el mismo valor (el panel manda la fila entera)
  update sesiones set inicio = inicio + interval '1 hour', fin = fin + interval '1 hour', tipo_clase_id = 'zzdrill-tc-viejo'
   where id = 'zzdrill-ses-1';

  -- d) cambiarle a una futura el tipo por uno archivado
  v_error := null;
  begin
    update sesiones set tipo_clase_id = 'zzdrill-tc-viejo' where id = 'zzdrill-ses-otra';
  exception when others then v_error := sqlerrm;
  end;
  assert v_error = 'TIPO_ARCHIVADO', 'd: el cambio de tipo entró (' || coalesce(v_error, 'sin error') || ')';

  -- e) la serie no se renueva, ni al simular
  v_error := null;
  begin
    r := public.renovar_serie('zzdrill-st', 'zzdrill-serie', null, 2, null, 'manual', true);
  exception when others then v_error := sqlerrm;
  end;
  assert v_error = 'TIPO_ARCHIVADO', 'e: renovar_serie simuló sin error (' || coalesce(v_error, r::text) || ')';

  -- f) al recuperarlo, vuelve a dejar programar (y renovar)
  update tipos_clase set archivado_en = null where id = 'zzdrill-tc-viejo';
  insert into sesiones (id, studio_id, tipo_clase_id, sala_id, instructor_id, inicio, fin, aforo_maximo, cancelada) values
    ('zzdrill-ses-nueva', 'zzdrill-st', 'zzdrill-tc-viejo', 'zzdrill-sala-a', 'zzdrill-ins-1',
     (v_lunes + 2 + time '10:00') at time zone 'Europe/Madrid', (v_lunes + 2 + time '10:50') at time zone 'Europe/Madrid', 6, false);
  r := public.renovar_serie('zzdrill-st', 'zzdrill-serie', null, 2, null, 'manual', true);
  assert r->>'estado' = 'simulacion', 'f: la simulación tras recuperar = ' || r::text;

  -- g) orden: 0..10000 o NULL
  update tipos_clase set orden = 0 where id = 'zzdrill-tc-vivo';
  update tipos_clase set orden = null where id = 'zzdrill-tc-vivo';
  v_error := null;
  begin
    update tipos_clase set orden = -1 where id = 'zzdrill-tc-vivo';
  exception when check_violation then v_error := 'check';
  end;
  assert v_error = 'check', 'g: orden -1 entró';

  -- h) permisos: solo el trigger la usa
  assert not has_function_privilege('anon', 'public.sesiones_no_programa_tipo_archivado()', 'EXECUTE'), 'h: anon';
  assert not has_function_privilege('authenticated', 'public.sesiones_no_programa_tipo_archivado()', 'EXECUTE'), 'h: authenticated';
  assert has_function_privilege('service_role', 'public.sesiones_no_programa_tipo_archivado()', 'EXECUTE'), 'h: service_role';
  assert has_column_privilege('authenticated', 'public.tipos_clase', 'archivado_en', 'UPDATE'), 'h: archivado_en';
  assert has_column_privilege('authenticated', 'public.tipos_clase', 'orden', 'UPDATE'), 'h: orden';

  select count(*) into n from sesiones where studio_id = 'zzdrill-st';
  assert n = 5, 'fin: esperaba 5 clases, hay ' || n;
end $$;

rollback;
