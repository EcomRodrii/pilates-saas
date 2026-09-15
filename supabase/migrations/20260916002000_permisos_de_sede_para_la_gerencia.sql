-- Permisos de sede para la gerencia.
--
-- La gerencia (MANAGER) pasa a llevar la operación de su sede en Configuración:
-- horario del estudio, cierres del centro, salas y sus máquinas (spots y
-- averías), tipos de clase y horario de citas. El dinero, el contrato y la
-- cuenta siguen siendo solo de la propietaria. Esta migración es la parte de
-- base de datos; la pantalla llega aparte y, hasta entonces, /configuracion
-- sigue cerrada a la gerencia en la interfaz.
--
-- De paso, las escrituras de estas tablas quedan acotadas por rol:
--
--   puede_gestionar_sede()      PROPIETARIO, MANAGER
--     studio_horario, cierres_estudio, salas, spots, bloqueos_maquina,
--     citas_disponibilidad, tipos_clase (alta y edición)
--   puede_configurar_negocio()  PROPIETARIO
--     tipos_clase (borrado, sin cambios), citas_servicios (servicios y precios)
--   puede_mover_dinero()        PROPIETARIO, RECEPCION
--     plan_tipos_clase — lo mismo que ya exige planes_tarifa, que se guarda con él
--
-- La lectura no cambia: todo el personal del estudio.
--
-- Recepción deja de declarar o quitar cierres del centro (decisión de producto):
-- la ruta /api/cierres se alinea en el mismo cambio.
--
-- Quién escribe estas tablas con sesión de usuario hoy: solo las pestañas de
-- Configuración (propietaria). La app del estudio, el importador de horario, el
-- asistente de alta y el catálogo de cadena escriben con service_role, al que
-- la RLS no aplica.
--
-- En tipos_clase, además, las tres reglas que acaban en dinero —importe de
-- penalización, ventana de cancelación y exigir plan— solo las cambia la
-- propietaria: la gerencia edita el resto del tipo, y si toca una de esas tres
-- la escritura falla con 42501 en vez de ignorarse en silencio.

-- ── 1. puede_gestionar_sede() ────────────────────────────────────────────────
-- Espejo de `puedeGestionarSede` (lib/permisos-reglas.ts). Mismo molde que
-- puede_gestionar_calendario(): SECURITY DEFINER sobre current_rol(), que ya
-- resuelve el rol de la sede activa.
create or replace function public.puede_gestionar_sede() returns boolean
  language sql stable security definer
  set search_path = public
  as $$
    select public.current_rol() in ('PROPIETARIO', 'MANAGER');
  $$;

comment on function public.puede_gestionar_sede() is
  'Roles que llevan la operación de la sede en Configuración (horario, cierres, salas, averías, tipos de clase, horario de citas). Espejo de puedeGestionarSede en lib/permisos-reglas.ts.';

-- Helper de RLS: authenticated lo necesita para evaluar las políticas. El
-- default ACL de este proyecto concede EXECUTE directo a anon/authenticated, así
-- que se revoca de los tres y se concede explícito.
revoke all on function public.puede_gestionar_sede() from public, anon, authenticated;
grant execute on function public.puede_gestionar_sede() to authenticated, service_role;

-- ── 2. studio_horario ────────────────────────────────────────────────────────
drop policy if exists studio_horario_escritura on public.studio_horario;
drop policy if exists studio_horario_insert on public.studio_horario;
drop policy if exists studio_horario_update on public.studio_horario;
drop policy if exists studio_horario_delete on public.studio_horario;
create policy studio_horario_insert on public.studio_horario
  for insert to authenticated
  with check (studio_id = public.current_studio_id() and public.puede_gestionar_sede());
create policy studio_horario_update on public.studio_horario
  for update to authenticated
  using (studio_id = public.current_studio_id() and public.puede_gestionar_sede())
  with check (studio_id = public.current_studio_id() and public.puede_gestionar_sede());
create policy studio_horario_delete on public.studio_horario
  for delete to authenticated
  using (studio_id = public.current_studio_id() and public.puede_gestionar_sede());

-- ── 3. cierres_estudio ───────────────────────────────────────────────────────
drop policy if exists cierres_escritura on public.cierres_estudio;
drop policy if exists cierres_insert on public.cierres_estudio;
drop policy if exists cierres_update on public.cierres_estudio;
drop policy if exists cierres_delete on public.cierres_estudio;
create policy cierres_insert on public.cierres_estudio
  for insert to authenticated
  with check (studio_id = public.current_studio_id() and public.puede_gestionar_sede());
create policy cierres_update on public.cierres_estudio
  for update to authenticated
  using (studio_id = public.current_studio_id() and public.puede_gestionar_sede())
  with check (studio_id = public.current_studio_id() and public.puede_gestionar_sede());
create policy cierres_delete on public.cierres_estudio
  for delete to authenticated
  using (studio_id = public.current_studio_id() and public.puede_gestionar_sede());

-- ── 4. salas ─────────────────────────────────────────────────────────────────
drop policy if exists admin_salas on public.salas;
drop policy if exists salas_lectura on public.salas;
drop policy if exists salas_insert on public.salas;
drop policy if exists salas_update on public.salas;
drop policy if exists salas_delete on public.salas;
create policy salas_lectura on public.salas
  for select to authenticated
  using (studio_id = public.current_studio_id());
create policy salas_insert on public.salas
  for insert to authenticated
  with check (studio_id = public.current_studio_id() and public.puede_gestionar_sede());
create policy salas_update on public.salas
  for update to authenticated
  using (studio_id = public.current_studio_id() and public.puede_gestionar_sede())
  with check (studio_id = public.current_studio_id() and public.puede_gestionar_sede());
create policy salas_delete on public.salas
  for delete to authenticated
  using (studio_id = public.current_studio_id() and public.puede_gestionar_sede());

-- ── 5. spots ─────────────────────────────────────────────────────────────────
drop policy if exists admin_spots on public.spots;
drop policy if exists spots_lectura on public.spots;
drop policy if exists spots_insert on public.spots;
drop policy if exists spots_update on public.spots;
drop policy if exists spots_delete on public.spots;
create policy spots_lectura on public.spots
  for select to authenticated
  using (studio_id = public.current_studio_id());
create policy spots_insert on public.spots
  for insert to authenticated
  with check (studio_id = public.current_studio_id() and public.puede_gestionar_sede());
create policy spots_update on public.spots
  for update to authenticated
  using (studio_id = public.current_studio_id() and public.puede_gestionar_sede())
  with check (studio_id = public.current_studio_id() and public.puede_gestionar_sede());
create policy spots_delete on public.spots
  for delete to authenticated
  using (studio_id = public.current_studio_id() and public.puede_gestionar_sede());

-- ── 6. bloqueos_maquina (averías) ────────────────────────────────────────────
-- Solo cambia quién escribe. aforo_efectivo() y reservar_plaza siguen leyendo
-- igual (la lectura no cambia, y reservar_plaza corre como definer).
drop policy if exists admin_bloqueos_maquina on public.bloqueos_maquina;
drop policy if exists bloqueos_maquina_lectura on public.bloqueos_maquina;
drop policy if exists bloqueos_maquina_insert on public.bloqueos_maquina;
drop policy if exists bloqueos_maquina_update on public.bloqueos_maquina;
drop policy if exists bloqueos_maquina_delete on public.bloqueos_maquina;
create policy bloqueos_maquina_lectura on public.bloqueos_maquina
  for select to authenticated
  using (studio_id = public.current_studio_id());
create policy bloqueos_maquina_insert on public.bloqueos_maquina
  for insert to authenticated
  with check (studio_id = public.current_studio_id() and public.puede_gestionar_sede());
create policy bloqueos_maquina_update on public.bloqueos_maquina
  for update to authenticated
  using (studio_id = public.current_studio_id() and public.puede_gestionar_sede())
  with check (studio_id = public.current_studio_id() and public.puede_gestionar_sede());
create policy bloqueos_maquina_delete on public.bloqueos_maquina
  for delete to authenticated
  using (studio_id = public.current_studio_id() and public.puede_gestionar_sede());

-- ── 7. citas_disponibilidad (horario de citas) ───────────────────────────────
drop policy if exists admin_citas_disponibilidad on public.citas_disponibilidad;
drop policy if exists citas_disponibilidad_lectura on public.citas_disponibilidad;
drop policy if exists citas_disponibilidad_insert on public.citas_disponibilidad;
drop policy if exists citas_disponibilidad_update on public.citas_disponibilidad;
drop policy if exists citas_disponibilidad_delete on public.citas_disponibilidad;
create policy citas_disponibilidad_lectura on public.citas_disponibilidad
  for select to authenticated
  using (studio_id = public.current_studio_id());
create policy citas_disponibilidad_insert on public.citas_disponibilidad
  for insert to authenticated
  with check (studio_id = public.current_studio_id() and public.puede_gestionar_sede());
create policy citas_disponibilidad_update on public.citas_disponibilidad
  for update to authenticated
  using (studio_id = public.current_studio_id() and public.puede_gestionar_sede())
  with check (studio_id = public.current_studio_id() and public.puede_gestionar_sede());
create policy citas_disponibilidad_delete on public.citas_disponibilidad
  for delete to authenticated
  using (studio_id = public.current_studio_id() and public.puede_gestionar_sede());

-- ── 8. tipos_clase ───────────────────────────────────────────────────────────
-- Alta y edición: propietaria y gerencia. Borrado: solo la propietaria
-- (tipos_clase_delete con puede_configurar_negocio(), 20260914001133, no se toca).
drop policy if exists tipos_clase_insert on public.tipos_clase;
drop policy if exists tipos_clase_update on public.tipos_clase;
create policy tipos_clase_insert on public.tipos_clase
  for insert to authenticated
  with check (studio_id = public.current_studio_id() and public.puede_gestionar_sede());
create policy tipos_clase_update on public.tipos_clase
  for update to authenticated
  using (studio_id = public.current_studio_id() and public.puede_gestionar_sede())
  with check (studio_id = public.current_studio_id() and public.puede_gestionar_sede());

-- ── 9. citas_servicios (servicios y precios) ─────────────────────────────────
drop policy if exists admin_citas_servicios on public.citas_servicios;
drop policy if exists citas_servicios_lectura on public.citas_servicios;
drop policy if exists citas_servicios_insert on public.citas_servicios;
drop policy if exists citas_servicios_update on public.citas_servicios;
drop policy if exists citas_servicios_delete on public.citas_servicios;
create policy citas_servicios_lectura on public.citas_servicios
  for select to authenticated
  using (studio_id = public.current_studio_id());
create policy citas_servicios_insert on public.citas_servicios
  for insert to authenticated
  with check (studio_id = public.current_studio_id() and public.puede_configurar_negocio());
create policy citas_servicios_update on public.citas_servicios
  for update to authenticated
  using (studio_id = public.current_studio_id() and public.puede_configurar_negocio())
  with check (studio_id = public.current_studio_id() and public.puede_configurar_negocio());
create policy citas_servicios_delete on public.citas_servicios
  for delete to authenticated
  using (studio_id = public.current_studio_id() and public.puede_configurar_negocio());

-- ── 10. plan_tipos_clase ─────────────────────────────────────────────────────
drop policy if exists admin_plan_tipos_clase on public.plan_tipos_clase;
drop policy if exists plan_tipos_clase_lectura on public.plan_tipos_clase;
drop policy if exists plan_tipos_clase_insert on public.plan_tipos_clase;
drop policy if exists plan_tipos_clase_update on public.plan_tipos_clase;
drop policy if exists plan_tipos_clase_delete on public.plan_tipos_clase;
create policy plan_tipos_clase_lectura on public.plan_tipos_clase
  for select to authenticated
  using (studio_id = public.current_studio_id());
create policy plan_tipos_clase_insert on public.plan_tipos_clase
  for insert to authenticated
  with check (studio_id = public.current_studio_id() and public.puede_mover_dinero());
create policy plan_tipos_clase_update on public.plan_tipos_clase
  for update to authenticated
  using (studio_id = public.current_studio_id() and public.puede_mover_dinero())
  with check (studio_id = public.current_studio_id() and public.puede_mover_dinero());
create policy plan_tipos_clase_delete on public.plan_tipos_clase
  for delete to authenticated
  using (studio_id = public.current_studio_id() and public.puede_mover_dinero());

-- ── 11. tipos_clase: las reglas de dinero, solo la propietaria ───────────────
-- Mismo molde que studios_cuenta_cobro_solo_servidor (20260913131051): INVOKER,
-- search_path vacío, y el servidor se reconoce con es_llamada_servicio(), nunca
-- con un auth.uid() nulo. Un NULL en estas columnas es «hereda del estudio», así
-- que en un alta solo cuenta que traiga un valor.
create or replace function public.tipos_clase_dinero_solo_propietaria()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if public.es_llamada_servicio() or public.puede_configurar_negocio() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.penalizacion_importe_eur  is not null
    or new.ventana_cancelacion_horas is not null
    or new.reserva_exigir_plan       is not null then
      raise exception 'tipos_clase_dinero_solo_propietaria: la penalización, la ventana de cancelación y exigir plan los fija la propietaria'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.penalizacion_importe_eur  is distinct from old.penalizacion_importe_eur
  or new.ventana_cancelacion_horas is distinct from old.ventana_cancelacion_horas
  or new.reserva_exigir_plan       is distinct from old.reserva_exigir_plan then
    raise exception 'tipos_clase_dinero_solo_propietaria: la penalización, la ventana de cancelación y exigir plan los cambia la propietaria'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.tipos_clase_dinero_solo_propietaria() is
  'Quien no es la propietaria no fija ni cambia penalizacion_importe_eur, ventana_cancelacion_horas ni reserva_exigir_plan de un tipo de clase (42501). Service-role sin cambios.';

revoke all on function public.tipos_clase_dinero_solo_propietaria() from public, anon, authenticated;
grant execute on function public.tipos_clase_dinero_solo_propietaria() to service_role;

drop trigger if exists trg_tipos_clase_dinero_solo_propietaria on public.tipos_clase;
create trigger trg_tipos_clase_dinero_solo_propietaria
  before insert or update on public.tipos_clase
  for each row execute function public.tipos_clase_dinero_solo_propietaria();

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN tras aplicar (lectura; la prueba del trigger, dentro de
-- BEGIN … ROLLBACK y nunca con datos reales en el texto):
--
-- select r,
--        has_function_privilege(r, 'public.puede_gestionar_sede()', 'EXECUTE') as sede,
--        has_function_privilege(r, 'public.tipos_clase_dinero_solo_propietaria()', 'EXECUTE') as trigger_fn
--   from unnest(array['anon', 'authenticated', 'service_role']) as r;
--   → anon: false/false · authenticated: true/false · service_role: true/true
--
-- select tablename, policyname, cmd, qual, with_check
--   from pg_policies
--  where schemaname = 'public'
--    and tablename in ('studio_horario', 'cierres_estudio', 'salas', 'spots', 'bloqueos_maquina',
--                      'citas_disponibilidad', 'tipos_clase', 'citas_servicios', 'plan_tipos_clase')
--  order by tablename, policyname;
--   → ninguna admin_* ni *_escritura FOR ALL; por tabla, <tabla>_lectura (SELECT, solo
--     studio_id) + insert/update/delete con su función: puede_gestionar_sede() en las
--     siete primeras (tipos_clase_delete sigue con puede_configurar_negocio()),
--     puede_configurar_negocio() en citas_servicios y puede_mover_dinero() en
--     plan_tipos_clase.
--
-- select tgname, pg_get_triggerdef(oid) from pg_trigger
--  where tgrelid = 'public.tipos_clase'::regclass and not tgisinternal;
--   → trg_tipos_clase_dinero_solo_propietaria
--
-- Prueba del trigger y de las políticas con una ficha MANAGER de un estudio de
-- pruebas (sustituir <auth_user_id> por la de esa ficha; no pegarla aquí):
--
-- begin;
--   select set_config('request.jwt.claims',
--     json_build_object('sub', '<auth_user_id>', 'role', 'authenticated')::text, true);
--   set local role authenticated;
--   select public.current_rol(), public.puede_gestionar_sede();          -- MANAGER, true
--   update public.tipos_clase set nombre = nombre
--    where studio_id = public.current_studio_id() returning id;          -- filas: sí
--   update public.tipos_clase set penalizacion_importe_eur = 1
--    where studio_id = public.current_studio_id();                        -- ERROR 42501
--   update public.citas_servicios set nombre = nombre
--    where studio_id = public.current_studio_id() returning id;          -- 0 filas
-- rollback;
--
-- Con una ficha RECEPCION: `update public.salas set nombre = nombre … returning id`
-- devuelve 0 filas, y `select public.puede_gestionar_sede()` da false.
-- ─────────────────────────────────────────────────────────────────────────────
