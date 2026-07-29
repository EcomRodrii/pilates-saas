-- Gamificación: cualquier cuenta de personal autenticada del estudio (no solo
-- PROPIETARIO/MANAGER) podía otorgarse créditos canjeables por recompensas
-- reales (clases gratis, descuentos) escribiendo directamente en `member_credits`
-- / `reward_actions`, o llamando a `ajustar_creditos` con CUALQUIER importe —
-- ni la RLS ni la RPC comprobaban el importe contra la regla configurada por el
-- estudio, ni si el disparador (asistencia, referido...) había ocurrido de
-- verdad. `ajustar_creditos` seguía siendo correcto para el DÉBITO de canje
-- (dbAjustarCreditos con delta negativo desde canjearRecompensa) — el problema
-- era solo la GANANCIA.
--
-- Esta RPC sustituye el camino de GANANCIA: el importe de créditos se calcula
-- SIEMPRE en servidor a partir de la regla/logro/reto activo del estudio (nunca
-- del cliente), y para los dos disparadores donde es barato y fiable
-- comprobarlo (ASISTENCIA_CLASE, REFERIDO_AMIGO) se exige que la condición
-- exista de verdad en la BD antes de conceder nada. Los demás disparadores
-- (SEMANA_COMPLETA/PRIMERA_RESERVA/RENOVACION_PLAN/OBJETIVO_MENSUAL/LOGRO/RETO)
-- no reproducen aquí la lógica de racha/logro/reto completa —fuera de alcance
-- de este fix—, pero quedan con el importe topado a lo configurado y con el
-- mismo cerrojo UNIQUE(studio_id, trigger, ref_id) que ya impedía doblar el
-- mismo refId: cierra la exposición "importe arbitrario ilimitado", que era la
-- parte con valor económico real.

create or replace function public.otorgar_credito_disparador(
  p_studio_id text, p_socio_id text, p_trigger text, p_ref_id text, p_config_id text default null
)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_creditos int;
  v_saldo int;
  v_id text;
begin
  if auth.uid() is not null and p_studio_id is distinct from current_studio_id() then
    raise exception 'STUDIO_MISMATCH';
  end if;
  if not exists (select 1 from socios where id = p_socio_id and studio_id = p_studio_id) then
    raise exception 'SOCIO_NO_PERTENECE_AL_STUDIO';
  end if;
  if p_ref_id is null or length(trim(p_ref_id)) = 0 then
    raise exception 'REF_ID_REQUERIDO';
  end if;

  if p_trigger = 'ASISTENCIA_CLASE' then
    -- p_ref_id = id de la reserva: tiene que ser una asistencia REAL de esta socia.
    if not exists (
      select 1 from reservas
      where id = p_ref_id and socio_id = p_socio_id and studio_id = p_studio_id and estado = 'ASISTIDA'
    ) then
      raise exception 'CONDICION_NO_CUMPLIDA';
    end if;
    select creditos into v_creditos from reward_rules
      where studio_id = p_studio_id and trigger = 'ASISTENCIA_CLASE' and activa limit 1;

  elsif p_trigger = 'REFERIDO_AMIGO' then
    -- p_ref_id = id de la socia REFERIDA: tiene que existir, ser del estudio,
    -- estar marcada como referida por p_socio_id, y haber asistido de verdad.
    if not exists (
      select 1 from socios s
      where s.id = p_ref_id and s.studio_id = p_studio_id and s.referido_por = p_socio_id
        and exists (select 1 from reservas r where r.socio_id = s.id and r.studio_id = p_studio_id and r.estado = 'ASISTIDA')
    ) then
      raise exception 'CONDICION_NO_CUMPLIDA';
    end if;
    select creditos into v_creditos from reward_rules
      where studio_id = p_studio_id and trigger = 'REFERIDO_AMIGO' and activa limit 1;

  elsif p_trigger in ('SEMANA_COMPLETA', 'PRIMERA_RESERVA', 'RENOVACION_PLAN', 'OBJETIVO_MENSUAL') then
    select creditos into v_creditos from reward_rules
      where studio_id = p_studio_id and trigger = p_trigger and activa limit 1;

  elsif p_trigger = 'LOGRO' then
    select creditos_recompensa into v_creditos from achievement_definitions
      where id = p_config_id and studio_id = p_studio_id and activo;

  elsif p_trigger = 'RETO' then
    select creditos_recompensa into v_creditos from challenge_definitions
      where id = p_config_id and studio_id = p_studio_id and activo;

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
    -- Ya se concedió antes para este (studio, trigger, ref_id): no-op idempotente.
    select saldo into v_saldo from member_credits where socio_id = p_socio_id and studio_id = p_studio_id;
    return coalesce(v_saldo, 0);
  end;

  insert into member_credits (socio_id, studio_id, saldo, total_ganado, total_canjeado, actualizado_en)
    values (p_socio_id, p_studio_id, v_creditos, v_creditos, 0, now())
  on conflict (socio_id) do update set
    saldo = member_credits.saldo + v_creditos,
    total_ganado = member_credits.total_ganado + v_creditos,
    actualizado_en = now()
  returning saldo into v_saldo;

  return v_saldo;
end;
$function$;

-- `revoke ... from public` NO basta: ALTER DEFAULT PRIVILEGES (0000_base.sql)
-- concede EXECUTE a `anon` de forma DIRECTA (no vía PUBLIC) a toda función
-- nueva, así que hay que revocárselo explícitamente o queda ejecutable sin
-- ninguna autenticación (el mismo agujero que reservar_cita, migración
-- 20260729154500 — se cierra aquí desde el principio).
revoke all on function public.otorgar_credito_disparador(text, text, text, text, text) from public, anon;
grant execute on function public.otorgar_credito_disparador(text, text, text, text, text) to authenticated, service_role;
