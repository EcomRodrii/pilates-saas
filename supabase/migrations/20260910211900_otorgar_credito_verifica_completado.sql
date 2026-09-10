-- 55ª pasada de auditoría de seguridad: `otorgar_credito_disparador` comprobaba
-- la condición real contra una tabla de hechos en 5 de sus 7 ramas, pero LOGRO
-- y RETO solo miraban que la definición existiera activa en el estudio, nunca
-- si `achievement_progress.completado`/`challenge_progress.completado` era
-- cierto para ese socio. Cualquier cuenta autenticada del estudio (incluida
-- INSTRUCTOR) podía llamar a la RPC desde la consola y otorgarse/otorgar a
-- cualquier socia TODOS los logros/retos activos, canjeables por premios
-- reales de `reward_catalog`.
--
-- Cambio mínimo y quirúrgico: se añade la comprobación de `completado` a las
-- ramas LOGRO/RETO. El resto de la función (incluido el blindaje de importe
-- de la migración `20260910075416_gamificacion_catalogo_solo_propietaria`,
-- ya aplicado en producción) queda idéntico.
CREATE OR REPLACE FUNCTION public.otorgar_credito_disparador(p_studio_id text, p_socio_id text, p_trigger text, p_ref_id text, p_config_id text DEFAULT NULL::text)
 RETURNS TABLE(saldo integer, otorgado boolean, accion_id text, creditos integer, descripcion text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_creditos int;
  v_desc text;
  v_regla_id text;
  v_saldo int;
  v_id text;
  v_sufijo text;
  v_lunes date;
begin
  perform public.validar_studio_mismatch(p_studio_id);
  perform public.validar_socio_del_studio(p_socio_id, p_studio_id);
  if p_ref_id is null or length(trim(p_ref_id)) = 0 then
    raise exception 'REF_ID_REQUERIDO';
  end if;

  if p_trigger = 'ASISTENCIA_CLASE' then
    if not exists (
      select 1 from reservas
      where id = p_ref_id and socio_id = p_socio_id and studio_id = p_studio_id and estado = 'ASISTIDA'
    ) then
      raise exception 'CONDICION_NO_CUMPLIDA';
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
    select r.creditos, r.nombre, r.id into v_creditos, v_desc, v_regla_id from reward_rules r
      where r.studio_id = p_studio_id and r.trigger = 'SEMANA_COMPLETA' and r.activa limit 1;

  elsif p_trigger = 'OBJETIVO_MENSUAL' then
    raise exception 'CONDICION_NO_CUMPLIDA';

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

-- Grants: misma firma exacta (CREATE OR REPLACE, no un CREATE nuevo), así que
-- no aplica el gotcha de "firma nueva hereda EXECUTE a PUBLIC" — se preservan
-- los grants existentes. Se revalida explícitamente igual, por si acaso.
REVOKE ALL ON FUNCTION public.otorgar_credito_disparador(text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.otorgar_credito_disparador(text, text, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.otorgar_credito_disparador(text, text, text, text, text) TO authenticated, service_role;

-- Hallazgo 🟠: `ingresos_manuales` tenía una policy FOR ALL sin exigir ningún
-- rol (solo `studio_id = current_studio_id()`), mientras que el endpoint real
-- (`app/api/ingresos-manuales/route.ts`) sí exige `puedeMoverDinero(rol)` pero
-- corre con service_role — la RLS era la única barrera para cualquier otro
-- camino de escritura (PostgREST/supabase-js directo con el JWT del usuario).
-- Se reutiliza `puede_mover_dinero()`, ya usado por `congelar_suscripcion`/
-- `descongelar_suscripcion` para el mismo chequeo.
DROP POLICY IF EXISTS admin_ingresos_manuales ON public.ingresos_manuales;
CREATE POLICY admin_ingresos_manuales ON public.ingresos_manuales
  FOR ALL
  USING (studio_id = current_studio_id() AND public.puede_mover_dinero())
  WITH CHECK (studio_id = current_studio_id() AND public.puede_mover_dinero());
