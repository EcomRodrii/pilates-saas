-- Fase: OBJETIVO_MENSUAL de gamificacion pasa de texto muerto a disparador real.
-- I-1 (auditoria-2026-09-10-49a-pasada.md): la propietaria podia activar/tarifar
-- esta regla pero nadie la concedia nunca -- la rama RPC solo lanzaba
-- CONDICION_NO_CUMPLIDA sin comprobar nada.

alter table public.socios
  add column if not exists objetivo_clases_mes integer null;

alter table public.socios
  drop constraint if exists socios_objetivo_clases_mes_valido;

alter table public.socios
  add constraint socios_objetivo_clases_mes_valido
  check (objetivo_clases_mes is null or objetivo_clases_mes between 1 and 60);

comment on column public.socios.objetivo_clases_mes is
  'Meta de clases/mes que la socia se marca desde su perfil (portal). null = sin objetivo. Mes de calendario natural, sin historico versionado (mismo criterio que studios.racha_clases_semana).';

-- CREATE OR REPLACE quirurgico: misma firma, mismas 6 ramas byte a byte,
-- solo cambia el cuerpo de la rama OBJETIVO_MENSUAL (antes: raise exception
-- 'CONDICION_NO_CUMPLIDA' sin mas). I-1 (auditoria-2026-09-10-49a-pasada.md).
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
  v_objetivo int;
  v_hechas int;
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
    -- p_ref_id debe ser '<socio_id>:<YYYY-MM>' del MES EN CURSO exacto (ni
    -- pasado ni futuro) -- mismo estilo de derivacion que SEMANA_COMPLETA.
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
    -- ASISTIDA, o CONFIRMADA con la sesion ya pasada. Acotado al mes natural
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

-- Gotcha de grants (repetido en este repo): un CREATE OR REPLACE con la MISMA
-- firma normalmente conserva el ACL, pero se reafirma explicito por si el
-- objeto necesitara reafirmarse -- verificado con has_function_privilege tras
-- aplicar (anon=false, authenticated=true, service_role=true).
revoke all on function public.otorgar_credito_disparador(text, text, text, text, text) from public;
revoke all on function public.otorgar_credito_disparador(text, text, text, text, text) from anon;
grant execute on function public.otorgar_credito_disparador(text, text, text, text, text) to authenticated, service_role;
