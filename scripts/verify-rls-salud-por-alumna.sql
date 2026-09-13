-- ═══════════════════════════════════════════════════════════════════════════
-- Verificación — salud por alumna asignada + consentimiento demostrable
-- Migraciones 20260913214116 / 20260913214142 / 20260913214150.
-- ═══════════════════════════════════════════════════════════════════════════
-- Ejecutar DESPUÉS de aplicarlas. TODO va dentro de `begin read only … rollback`:
-- no escribe nada. Solo devuelve booleanos, recuentos e ids internos (sin
-- nombres, emails ni texto de salud).
--
-- Cada bloque dice el resultado DESEADO. Si un usuario tiene varias sedes, su
-- `sesion_activa` decide el estudio; el bloque 0 elige a propósito cuentas cuyo
-- estudio resuelto es el de la clase.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Grants de funciones. Deseado:
--    instructora_atiende_socia     anon=f authenticated=t service_role=t
--    semaforo_salud_estudio        anon=f authenticated=t service_role=t
--    consentimiento_salud_cambiar  anon=f authenticated=f service_role=t
select f as funcion,
       has_function_privilege('anon', f, 'EXECUTE')          as anon,
       has_function_privilege('authenticated', f, 'EXECUTE') as authenticated,
       has_function_privilege('service_role', f, 'EXECUTE')  as service_role
from (values
  ('public.instructora_atiende_socia(text)'),
  ('public.semaforo_salud_estudio(text)'),
  ('public.consentimiento_salud_cambiar(text, text, text, text, text, text, uuid, text)')
) v(f);

-- 2) Columnas de consentimiento sin escritura para authenticated, y el resto
--    intacto. Deseado: las cinco consentimiento_salud_* con insert=f update=f;
--    nombre/campos_extra con insert=t update=t.
select c as columna,
       has_column_privilege('authenticated', 'public.socios', c, 'INSERT') as insert,
       has_column_privilege('authenticated', 'public.socios', c, 'UPDATE') as update,
       has_column_privilege('authenticated', 'public.socios', c, 'SELECT') as select
from (values
  ('consentimiento_salud_fecha'), ('consentimiento_salud_registrado_por'),
  ('consentimiento_salud_revocado_en'), ('consentimiento_salud_texto'),
  ('consentimiento_salud_registrado_por_uid'),
  ('nombre'), ('campos_extra'), ('consentimiento_marketing_en')
) v(c);

-- 2b) Ninguna columna de socios que antes fuera escribible se ha quedado fuera.
--     Deseado: 0 filas (salvo las cinco de consentimiento, excluidas aquí).
select column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'socios'
  and column_name not like 'consentimiento_salud_%'
  and not has_column_privilege('authenticated', 'public.socios', column_name, 'UPDATE');

-- 3) Políticas. Deseado: 17 filas de salud, todas con instructora_atiende_socia;
--    campos_personalizados con 4 políticas (select abierta, resto PROPIETARIO).
select tablename, policyname, cmd,
       coalesce(qual, '') || coalesce(with_check, '') like '%instructora_atiende_socia%' as por_alumna,
       coalesce(qual, '') || coalesce(with_check, '') like '%tiene_consentimiento_salud%' as con_consentimiento
from pg_policies
where schemaname = 'public'
  and tablename in ('condiciones_salud', 'respuestas_sesion', 'respuestas_cuestionario_salud',
                    'valoraciones_iniciales_salud', 'notas_progreso', 'campos_personalizados',
                    'consentimientos_salud_eventos')
order by tablename, policyname;

-- 4) Impersonación. Deseado, sobre la MISMA socia (con datos de salud y
--    consentimiento vigente si existe alguna así):
--    · propietaria                         → ve N filas (N = total de esa socia)
--    · instructora con reserva en ±30 días → ve N filas, atiende = true
--    · instructora del estudio sin relación→ ve 0 filas, atiende = false
--    · recepción                           → ve 0 filas
--    · insert de campos_personalizados como instructora → error 42501
begin read only;

-- 4.0 Elegir cuentas (solo ids internos).
select
  set_config('verif.socio', x.socio_id, true),
  set_config('verif.studio', x.studio_id, true),
  set_config('verif.uid_con', x.uid_con::text, true),
  set_config('verif.uid_sin', coalesce((
    select i2.auth_user_id::text from public.instructores i2
    where i2.studio_id = x.studio_id and i2.rol = 'INSTRUCTOR' and i2.auth_user_id is not null
      and coalesce(i2.activo, true) and i2.auth_user_id <> x.uid_con
      and not exists (
        select 1 from public.reservas r join public.sesiones s on s.id = r.sesion_id
        where r.socio_id = x.socio_id and s.instructor_id = i2.id and r.estado <> 'CANCELADA'
          and s.inicio between now() - interval '30 days' and now() + interval '30 days')
      and not exists (
        select 1 from public.citas c where c.socio_id = x.socio_id and c.instructor_id = i2.id
          and c.estado <> 'CANCELADA' and c.inicio between now() - interval '30 days' and now() + interval '30 days')
    limit 1), ''), true),
  set_config('verif.uid_prop', coalesce((select st.owner_auth_user_id::text from public.studios st where st.id = x.studio_id), ''), true),
  set_config('verif.uid_recep', coalesce((
    select i3.auth_user_id::text from public.instructores i3
    where i3.studio_id = x.studio_id and i3.rol = 'RECEPCION' and i3.auth_user_id is not null and coalesce(i3.activo, true)
    limit 1), ''), true)
from (
  select r.socio_id, s.studio_id, i.auth_user_id as uid_con
  from public.reservas r
  join public.sesiones s on s.id = r.sesion_id
  join public.instructores i on i.id = s.instructor_id
  join public.socios so on so.id = r.socio_id
  where r.estado <> 'CANCELADA' and coalesce(s.cancelada, false) = false
    and s.inicio between now() - interval '30 days' and now() + interval '30 days'
    and i.rol = 'INSTRUCTOR' and i.auth_user_id is not null and coalesce(i.activo, true)
  order by (so.consentimiento_salud_fecha is not null and so.consentimiento_salud_revocado_en is null) desc,
           exists (select 1 from public.condiciones_salud cs where cs.socio_id = r.socio_id) desc
  limit 1
) x;

-- Referencia como postgres (sin RLS): cuántas filas de salud tiene esa socia.
select 'referencia' as quien,
       (select count(*) from public.condiciones_salud where socio_id = current_setting('verif.socio')) as condiciones,
       (select count(*) from public.notas_progreso where socio_id = current_setting('verif.socio')) as notas,
       (select count(*) from public.respuestas_sesion where socio_id = current_setting('verif.socio')) as respuestas,
       (select consentimiento_salud_fecha is not null and consentimiento_salud_revocado_en is null
          from public.socios where id = current_setting('verif.socio')) as consentimiento_vigente,
       current_setting('verif.uid_sin') <> '' as hay_instructora_sin_relacion,
       current_setting('verif.uid_recep') <> '' as hay_recepcion;

-- 4.1 Instructora CON reserva.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('verif.uid_con'), 'role', 'authenticated')::text, true);
select 'instructora_con_reserva' as quien,
       public.current_studio_id() = current_setting('verif.studio') as estudio_ok,
       public.instructora_atiende_socia(current_setting('verif.socio')) as atiende,
       (select count(*) from public.condiciones_salud where socio_id = current_setting('verif.socio')) as condiciones,
       (select count(*) from public.notas_progreso where socio_id = current_setting('verif.socio')) as notas,
       (select count(*) from public.respuestas_sesion where socio_id = current_setting('verif.socio')) as respuestas,
       (select count(*) from public.semaforo_salud_estudio(current_setting('verif.studio'))) as semaforo_filas;
reset role;

-- 4.2 Instructora SIN relación con la socia (si existe).
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', nullif(current_setting('verif.uid_sin'), ''), 'role', 'authenticated')::text, true);
select 'instructora_sin_relacion' as quien,
       public.instructora_atiende_socia(current_setting('verif.socio')) as atiende,        -- false
       (select count(*) from public.condiciones_salud where socio_id = current_setting('verif.socio')) as condiciones, -- 0
       (select count(*) from public.notas_progreso where socio_id = current_setting('verif.socio')) as notas,         -- 0
       (select count(*) from public.respuestas_sesion where socio_id = current_setting('verif.socio')) as respuestas;  -- 0
reset role;

-- 4.3 Propietaria.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', nullif(current_setting('verif.uid_prop'), ''), 'role', 'authenticated')::text, true);
select 'propietaria' as quien,
       (select count(*) from public.condiciones_salud where socio_id = current_setting('verif.socio')) as condiciones,
       (select count(*) from public.notas_progreso where socio_id = current_setting('verif.socio')) as notas,
       (select count(*) from public.respuestas_sesion where socio_id = current_setting('verif.socio')) as respuestas,
       (select count(*) from public.consentimientos_salud_eventos where socio_id = current_setting('verif.socio')) as eventos_consentimiento;
reset role;

-- 4.4 Recepción (si existe). Deseado: 0 en todo, semáforo sí devuelve filas.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', nullif(current_setting('verif.uid_recep'), ''), 'role', 'authenticated')::text, true);
select 'recepcion' as quien,
       (select count(*) from public.condiciones_salud where socio_id = current_setting('verif.socio')) as condiciones,
       (select count(*) from public.notas_progreso where socio_id = current_setting('verif.socio')) as notas,
       (select count(*) from public.consentimientos_salud_eventos) as eventos_consentimiento;
reset role;

rollback;

-- 5) anon no ejecuta la función nueva. Deseado: ERROR 42501 permission denied.
begin read only;
set local role anon;
select public.instructora_atiende_socia('x');
rollback;

-- 6) authenticated no puede escribir el consentimiento aunque la RLS de fila le
--    deje tocar la socia. En transacción de SOLO LECTURA el UPDATE fallaría
--    igualmente por 25006, así que esto se comprueba con el bloque 2
--    (has_column_privilege), no escribiendo.

-- 7) Historial reconstruido. Deseado: un OTORGADO HISTORICO por cada socia con
--    consentimiento_salud_fecha, y un REVOCADO HISTORICO por cada una revocada.
select
  (select count(*) from public.socios where consentimiento_salud_fecha is not null) as socias_con_fecha,
  (select count(*) from public.consentimientos_salud_eventos where tipo = 'OTORGADO' and origen = 'HISTORICO') as otorgados_historicos,
  (select count(*) from public.socios where consentimiento_salud_fecha is not null and consentimiento_salud_revocado_en is not null) as socias_revocadas,
  (select count(*) from public.consentimientos_salud_eventos where tipo = 'REVOCADO' and origen = 'HISTORICO') as revocados_historicos;
