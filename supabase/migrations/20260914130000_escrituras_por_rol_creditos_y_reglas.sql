-- Escritura por rol en créditos, congelaciones y reglas de clase.
--
-- Estas ocho tablas tenían una sola política `FOR ALL` con
-- `studio_id = current_studio_id()`: bastaba con ser del equipo, fuera cual
-- fuera el rol, para insertar, cambiar o borrar. Se separa cada una en
-- LECTURA (igual que antes, todo el equipo del estudio) y ESCRITURA con el
-- mismo permiso que ya exigen la RPC o la pantalla que la usa:
--
--   credit_transactions, reward_history,
--   reto_participaciones                 → puede_gestionar_clientas()
--                                          (el de `ajustar_creditos`)
--   congelaciones                        → puede_mover_dinero()
--                                          (el de `congelar_suscripcion`)
--   tipos_clase, level_definitions       → puede_configurar_negocio()
--                                          (se editan en /configuracion, igual
--                                          que `achievement_definitions`)
--   achievement_progress,
--   challenge_progress                   → puede_gestionar_clientas(), y la
--                                          instructora solo filas SIN completar
--
-- Nada del producto escribe hoy a pelo en las tablas del libro de créditos
-- ni en `congelaciones`: lo hacen RPCs SECURITY DEFINER propiedad de
-- `postgres` (`otorgar_credito_disparador`, `canjear_recompensa`,
-- `congelar_suscripcion`…), que no pasan por estas políticas, o el
-- service-role del servidor. Por eso cerrar la escritura directa no cambia
-- ningún flujo de propietaria ni de recepción.
--
-- El progreso de logros y retos lo calcula el panel al pasar lista, y la
-- instructora pasa lista en sus clases: puede seguir guardando el avance, pero
-- no marcarlo como COMPLETADO. `otorgar_credito_disparador` concede el logro
-- solo si la fila ya está completada, así que quien no gestiona clientas no
-- puede fabricarse esa condición. Cuando ella deja un logro a punto, lo cierra
-- la siguiente evaluación de recepción o del servidor (`evaluarLogrosServidor`).

-- ── credit_transactions ────────────────────────────────────────────────────
drop policy if exists admin_credit_transactions on public.credit_transactions;
create policy credit_transactions_lectura on public.credit_transactions
  for select to authenticated
  using (studio_id = public.current_studio_id());
create policy credit_transactions_insert on public.credit_transactions
  for insert to authenticated
  with check (studio_id = public.current_studio_id() and public.puede_gestionar_clientas());
create policy credit_transactions_update on public.credit_transactions
  for update to authenticated
  using (studio_id = public.current_studio_id() and public.puede_gestionar_clientas())
  with check (studio_id = public.current_studio_id() and public.puede_gestionar_clientas());
create policy credit_transactions_delete on public.credit_transactions
  for delete to authenticated
  using (studio_id = public.current_studio_id() and public.puede_gestionar_clientas());

-- ── reward_history ─────────────────────────────────────────────────────────
drop policy if exists admin_reward_history on public.reward_history;
create policy reward_history_lectura on public.reward_history
  for select to authenticated
  using (studio_id = public.current_studio_id());
create policy reward_history_insert on public.reward_history
  for insert to authenticated
  with check (studio_id = public.current_studio_id() and public.puede_gestionar_clientas());
create policy reward_history_update on public.reward_history
  for update to authenticated
  using (studio_id = public.current_studio_id() and public.puede_gestionar_clientas())
  with check (studio_id = public.current_studio_id() and public.puede_gestionar_clientas());
create policy reward_history_delete on public.reward_history
  for delete to authenticated
  using (studio_id = public.current_studio_id() and public.puede_gestionar_clientas());

-- ── reto_participaciones ───────────────────────────────────────────────────
drop policy if exists admin_reto_participaciones on public.reto_participaciones;
create policy reto_participaciones_lectura on public.reto_participaciones
  for select to authenticated
  using (studio_id = public.current_studio_id());
create policy reto_participaciones_insert on public.reto_participaciones
  for insert to authenticated
  with check (studio_id = public.current_studio_id() and public.puede_gestionar_clientas());
create policy reto_participaciones_update on public.reto_participaciones
  for update to authenticated
  using (studio_id = public.current_studio_id() and public.puede_gestionar_clientas())
  with check (studio_id = public.current_studio_id() and public.puede_gestionar_clientas());
create policy reto_participaciones_delete on public.reto_participaciones
  for delete to authenticated
  using (studio_id = public.current_studio_id() and public.puede_gestionar_clientas());

-- ── congelaciones ──────────────────────────────────────────────────────────
drop policy if exists admin_congelaciones on public.congelaciones;
create policy congelaciones_lectura on public.congelaciones
  for select to authenticated
  using (studio_id = public.current_studio_id());
create policy congelaciones_insert on public.congelaciones
  for insert to authenticated
  with check (studio_id = public.current_studio_id() and public.puede_mover_dinero());
create policy congelaciones_update on public.congelaciones
  for update to authenticated
  using (studio_id = public.current_studio_id() and public.puede_mover_dinero())
  with check (studio_id = public.current_studio_id() and public.puede_mover_dinero());
create policy congelaciones_delete on public.congelaciones
  for delete to authenticated
  using (studio_id = public.current_studio_id() and public.puede_mover_dinero());

-- ── tipos_clase (incluye el importe de penalización y las reglas de reserva)
drop policy if exists admin_tipos_clase on public.tipos_clase;
create policy tipos_clase_lectura on public.tipos_clase
  for select to authenticated
  using (studio_id = public.current_studio_id());
create policy tipos_clase_insert on public.tipos_clase
  for insert to authenticated
  with check (studio_id = public.current_studio_id() and public.puede_configurar_negocio());
create policy tipos_clase_update on public.tipos_clase
  for update to authenticated
  using (studio_id = public.current_studio_id() and public.puede_configurar_negocio())
  with check (studio_id = public.current_studio_id() and public.puede_configurar_negocio());
create policy tipos_clase_delete on public.tipos_clase
  for delete to authenticated
  using (studio_id = public.current_studio_id() and public.puede_configurar_negocio());

-- ── level_definitions ──────────────────────────────────────────────────────
drop policy if exists admin_level_definitions on public.level_definitions;
create policy level_definitions_lectura on public.level_definitions
  for select to authenticated
  using (studio_id = public.current_studio_id());
create policy level_definitions_insert on public.level_definitions
  for insert to authenticated
  with check (studio_id = public.current_studio_id() and public.puede_configurar_negocio());
create policy level_definitions_update on public.level_definitions
  for update to authenticated
  using (studio_id = public.current_studio_id() and public.puede_configurar_negocio())
  with check (studio_id = public.current_studio_id() and public.puede_configurar_negocio());
create policy level_definitions_delete on public.level_definitions
  for delete to authenticated
  using (studio_id = public.current_studio_id() and public.puede_configurar_negocio());

-- ── achievement_progress ───────────────────────────────────────────────────
drop policy if exists admin_achievement_progress on public.achievement_progress;
create policy achievement_progress_lectura on public.achievement_progress
  for select to authenticated
  using (studio_id = public.current_studio_id());
create policy achievement_progress_insert on public.achievement_progress
  for insert to authenticated
  with check (studio_id = public.current_studio_id() and public.puede_gestionar_clientas());
create policy achievement_progress_update on public.achievement_progress
  for update to authenticated
  using (studio_id = public.current_studio_id() and public.puede_gestionar_clientas())
  with check (studio_id = public.current_studio_id() and public.puede_gestionar_clientas());
create policy achievement_progress_delete on public.achievement_progress
  for delete to authenticated
  using (studio_id = public.current_studio_id() and public.puede_gestionar_clientas());
-- La instructora: guardar avance, nunca completar (ni tocar uno ya completado).
create policy achievement_progress_insert_instructora on public.achievement_progress
  for insert to authenticated
  with check (studio_id = public.current_studio_id() and public.current_rol() = 'INSTRUCTOR'
              and not coalesce(completado, false));
create policy achievement_progress_update_instructora on public.achievement_progress
  for update to authenticated
  using (studio_id = public.current_studio_id() and public.current_rol() = 'INSTRUCTOR'
         and not coalesce(completado, false))
  with check (studio_id = public.current_studio_id() and public.current_rol() = 'INSTRUCTOR'
              and not coalesce(completado, false));

-- ── challenge_progress ─────────────────────────────────────────────────────
drop policy if exists admin_challenge_progress on public.challenge_progress;
create policy challenge_progress_lectura on public.challenge_progress
  for select to authenticated
  using (studio_id = public.current_studio_id());
create policy challenge_progress_insert on public.challenge_progress
  for insert to authenticated
  with check (studio_id = public.current_studio_id() and public.puede_gestionar_clientas());
create policy challenge_progress_update on public.challenge_progress
  for update to authenticated
  using (studio_id = public.current_studio_id() and public.puede_gestionar_clientas())
  with check (studio_id = public.current_studio_id() and public.puede_gestionar_clientas());
create policy challenge_progress_delete on public.challenge_progress
  for delete to authenticated
  using (studio_id = public.current_studio_id() and public.puede_gestionar_clientas());
create policy challenge_progress_insert_instructora on public.challenge_progress
  for insert to authenticated
  with check (studio_id = public.current_studio_id() and public.current_rol() = 'INSTRUCTOR'
              and not coalesce(completado, false));
create policy challenge_progress_update_instructora on public.challenge_progress
  for update to authenticated
  using (studio_id = public.current_studio_id() and public.current_rol() = 'INSTRUCTOR'
         and not coalesce(completado, false))
  with check (studio_id = public.current_studio_id() and public.current_rol() = 'INSTRUCTOR'
              and not coalesce(completado, false));

-- ── otorgar_credito_disparador: rol de quien concede ──────────────────────
-- Misma firma: CREATE OR REPLACE conserva los grants actuales (authenticated
-- + service_role, sin anon). Con `auth.uid()` NULL (service-role del
-- servidor: portal, crons) no cambia nada, igual que el resto de guardias de
-- esta función.
--
-- Quien gestiona clientas (PROPIETARIO/MANAGER/RECEPCION) sigue igual. La
-- instructora solo concede lo que sale de pasar lista y cuya condición la BD
-- comprueba entera: la asistencia a SU clase, la semana con una asistencia
-- en SU clase, el objetivo mensual y la primera reserva (verificados), y
-- logros/retos (exigen progreso completado, que ella ya no puede escribir).
-- Referido y renovación de plan son trabajo de mostrador: NO_AUTORIZADO.
create or replace function public.otorgar_credito_disparador(
  p_studio_id text, p_socio_id text, p_trigger text, p_ref_id text, p_config_id text default null::text
)
 returns table(saldo integer, otorgado boolean, accion_id text, creditos integer, descripcion text)
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_creditos int;
  v_desc text;
  v_regla_id text;
  v_saldo int;
  v_id text;
  v_sufijo text;
  v_lunes date;
  v_objetivo int;
  v_hechas int;
  v_solo_clases_propias boolean := false;
begin
  perform public.validar_studio_mismatch(p_studio_id);
  perform public.validar_socio_del_studio(p_socio_id, p_studio_id);
  if p_ref_id is null or length(trim(p_ref_id)) = 0 then
    raise exception 'REF_ID_REQUERIDO';
  end if;

  if auth.uid() is not null and not public.puede_gestionar_clientas() then
    if public.current_rol() is distinct from 'INSTRUCTOR'
       or p_trigger not in ('ASISTENCIA_CLASE', 'SEMANA_COMPLETA', 'OBJETIVO_MENSUAL', 'PRIMERA_RESERVA', 'LOGRO', 'RETO') then
      raise exception 'NO_AUTORIZADO';
    end if;
    v_solo_clases_propias := true;
  end if;

  if p_trigger = 'ASISTENCIA_CLASE' then
    if not exists (
      select 1 from reservas
      where id = p_ref_id and socio_id = p_socio_id and studio_id = p_studio_id and estado = 'ASISTIDA'
    ) then
      raise exception 'CONDICION_NO_CUMPLIDA';
    end if;
    if v_solo_clases_propias and not exists (
      select 1 from reservas r join sesiones s on s.id = r.sesion_id
      where r.id = p_ref_id and r.studio_id = p_studio_id
        and s.instructor_id = public.current_instructor_id()
    ) then
      raise exception 'NO_AUTORIZADO';
    end if;
    select r.creditos, r.nombre, r.id into v_creditos, v_desc, v_regla_id from reward_rules r
      where r.studio_id = p_studio_id and r.trigger = 'ASISTENCIA_CLASE' and r.activa limit 1;

  elsif p_trigger = 'REFERIDO_AMIGO' then
    if not exists (
      select 1 from socios s
      where s.id = p_ref_id and s.studio_id = p_studio_id and s.referido_por = p_socio_id
        and exists (select 1 from reservas r where r.socio_id = s.id and r.studio_id = p_studio_id and r.estado = 'ASISTIDA')
    ) then
      raise exception 'CONDICION_NO_CUMPLIDA';
    end if;
    select r.creditos, r.nombre, r.id into v_creditos, v_desc, v_regla_id from reward_rules r
      where r.studio_id = p_studio_id and r.trigger = 'REFERIDO_AMIGO' and r.activa limit 1;

  elsif p_trigger = 'RENOVACION_PLAN' then
    if not exists (
      select 1 from recibos rc
      where rc.id = p_ref_id and rc.socio_id = p_socio_id and rc.studio_id = p_studio_id
        and (coalesce(rc.es_renovacion, false) or rc.concepto like 'Renovación%')
    ) then
      raise exception 'CONDICION_NO_CUMPLIDA';
    end if;
    select r.creditos, r.nombre, r.id into v_creditos, v_desc, v_regla_id from reward_rules r
      where r.studio_id = p_studio_id and r.trigger = 'RENOVACION_PLAN' and r.activa limit 1;

  elsif p_trigger = 'PRIMERA_RESERVA' then
    if p_ref_id is distinct from p_socio_id then
      raise exception 'REF_ID_NO_DERIVADO';
    end if;
    if not exists (select 1 from reservas r where r.socio_id = p_socio_id and r.studio_id = p_studio_id) then
      raise exception 'CONDICION_NO_CUMPLIDA';
    end if;
    select r.creditos, r.nombre, r.id into v_creditos, v_desc, v_regla_id from reward_rules r
      where r.studio_id = p_studio_id and r.trigger = 'PRIMERA_RESERVA' and r.activa limit 1;

  elsif p_trigger = 'SEMANA_COMPLETA' then
    if left(p_ref_id, length(p_socio_id) + 1) is distinct from p_socio_id || ':' then
      raise exception 'REF_ID_NO_DERIVADO';
    end if;
    v_sufijo := substr(p_ref_id, length(p_socio_id) + 2);
    begin
      v_lunes := v_sufijo::date;
    exception when others then
      raise exception 'REF_ID_NO_DERIVADO';
    end;
    if extract(isodow from v_lunes) not in (1, 7) or v_lunes > current_date then
      raise exception 'REF_ID_NO_DERIVADO';
    end if;
    if not exists (
      select 1 from reservas r join sesiones s on s.id = r.sesion_id
      where r.socio_id = p_socio_id and r.studio_id = p_studio_id and r.estado = 'ASISTIDA'
        and s.inicio >= v_lunes::timestamptz
        and s.inicio <  (v_lunes + 8)::timestamptz
    ) then
      raise exception 'CONDICION_NO_CUMPLIDA';
    end if;
    -- La semana solo exige UNA asistencia: para la instructora, que sea en su clase.
    if v_solo_clases_propias and not exists (
      select 1 from reservas r join sesiones s on s.id = r.sesion_id
      where r.socio_id = p_socio_id and r.studio_id = p_studio_id and r.estado = 'ASISTIDA'
        and s.instructor_id = public.current_instructor_id()
        and s.inicio >= v_lunes::timestamptz
        and s.inicio <  (v_lunes + 8)::timestamptz
    ) then
      raise exception 'NO_AUTORIZADO';
    end if;
    select r.creditos, r.nombre, r.id into v_creditos, v_desc, v_regla_id from reward_rules r
      where r.studio_id = p_studio_id and r.trigger = 'SEMANA_COMPLETA' and r.activa limit 1;

  elsif p_trigger = 'OBJETIVO_MENSUAL' then
    -- p_ref_id debe ser '<socio_id>:<YYYY-MM>' del MES EN CURSO exacto (ni
    -- pasado ni futuro) — mismo estilo de derivación que SEMANA_COMPLETA.
    if left(p_ref_id, length(p_socio_id) + 1) is distinct from p_socio_id || ':' then
      raise exception 'REF_ID_NO_DERIVADO';
    end if;
    v_sufijo := substr(p_ref_id, length(p_socio_id) + 2);
    if v_sufijo is distinct from to_char(current_date, 'YYYY-MM') then
      raise exception 'REF_ID_NO_DERIVADO';
    end if;

    select s.objetivo_clases_mes into v_objetivo
      from socios s where s.id = p_socio_id and s.studio_id = p_studio_id;
    if v_objetivo is null or v_objetivo < 1 then
      raise exception 'CONDICION_NO_CUMPLIDA';
    end if;

    -- "Hecha" = mismo criterio que cuentaComoHecha (lib/student/ritmo.ts):
    -- ASISTIDA, o CONFIRMADA con la sesión ya pasada. Acotado al mes natural
    -- en curso (misma zona horaria en bruto que ya usa SEMANA_COMPLETA arriba).
    select count(*) into v_hechas
      from reservas r
      join sesiones s on s.id = r.sesion_id and s.studio_id = p_studio_id
      where r.socio_id = p_socio_id and r.studio_id = p_studio_id
        and s.inicio >= date_trunc('month', current_date)::timestamptz
        and s.inicio <  (date_trunc('month', current_date) + interval '1 month')::timestamptz
        and (r.estado = 'ASISTIDA' or (r.estado = 'CONFIRMADA' and s.inicio < now()));

    if v_hechas < v_objetivo then
      raise exception 'CONDICION_NO_CUMPLIDA';
    end if;
    select r.creditos, r.nombre, r.id into v_creditos, v_desc, v_regla_id from reward_rules r
      where r.studio_id = p_studio_id and r.trigger = 'OBJETIVO_MENSUAL' and r.activa limit 1;

  elsif p_trigger = 'LOGRO' then
    if p_config_id is null or p_ref_id is distinct from p_socio_id || ':' || p_config_id then
      raise exception 'REF_ID_NO_DERIVADO';
    end if;
    if not exists (
      select 1 from achievement_progress ap
      where ap.socio_id = p_socio_id and ap.studio_id = p_studio_id
        and ap.achievement_id = p_config_id and ap.completado
    ) then
      raise exception 'CONDICION_NO_CUMPLIDA';
    end if;
    select a.creditos_recompensa, 'Logro desbloqueado: ' || a.nombre into v_creditos, v_desc
      from achievement_definitions a
      where a.id = p_config_id and a.studio_id = p_studio_id and a.activo;

  elsif p_trigger = 'RETO' then
    if p_config_id is null or p_ref_id is distinct from p_socio_id || ':' || p_config_id then
      raise exception 'REF_ID_NO_DERIVADO';
    end if;
    if not exists (
      select 1 from challenge_progress cp
      where cp.socio_id = p_socio_id and cp.studio_id = p_studio_id
        and cp.challenge_id = p_config_id and cp.completado
    ) then
      raise exception 'CONDICION_NO_CUMPLIDA';
    end if;
    select c.creditos_recompensa, 'Reto completado: ' || c.nombre into v_creditos, v_desc
      from challenge_definitions c
      where c.id = p_config_id and c.studio_id = p_studio_id and c.activo;

  else
    raise exception 'TRIGGER_DESCONOCIDO';
  end if;

  if v_creditos is null or v_creditos <= 0 then
    raise exception 'SIN_REGLA_ACTIVA';
  end if;

  v_id := 'rwa-srv-' || substr(md5(p_studio_id || '|' || p_trigger || '|' || p_ref_id || '|' || clock_timestamp()::text || '|' || random()::text), 1, 20);

  begin
    insert into reward_actions (id, studio_id, socio_id, trigger, ref_id, creado_en)
      values (v_id, p_studio_id, p_socio_id, p_trigger, p_ref_id, now());
  exception when unique_violation then
    select mc.saldo into v_saldo from member_credits mc where mc.socio_id = p_socio_id and mc.studio_id = p_studio_id;
    return query select coalesce(v_saldo, 0), false, null::text, 0, null::text;
    return;
  end;

  insert into member_credits (socio_id, studio_id, saldo, total_ganado, total_canjeado, actualizado_en)
    values (p_socio_id, p_studio_id, v_creditos, v_creditos, 0, now())
  on conflict (socio_id) do update set
    saldo = member_credits.saldo + v_creditos,
    total_ganado = member_credits.total_ganado + v_creditos,
    actualizado_en = now()
  returning member_credits.saldo into v_saldo;

  insert into reward_history (id, studio_id, socio_id, rule_id, action_id, creditos, descripcion, creado_en)
    values (
      'rwh-srv-' || substr(md5(v_id || '|h|' || random()::text), 1, 18),
      p_studio_id, p_socio_id, v_regla_id, v_id, v_creditos, v_desc, now()
    );

  insert into credit_transactions (id, studio_id, socio_id, tipo, creditos, descripcion, ref_id, creado_en)
    values (
      'ctx-srv-' || substr(md5(v_id || '|t|' || random()::text), 1, 18),
      p_studio_id, p_socio_id, 'GANANCIA', v_creditos, v_desc, p_ref_id, now()
    );

  return query select v_saldo, true, v_id, v_creditos, v_desc;
end;
$function$;
