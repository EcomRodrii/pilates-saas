-- RECONSTRUCCIÓN de una migración que se aplicó a producción y nunca se
-- commiteó. El SQL de aquí abajo es, literalmente, el que hay guardado en
-- `supabase_migrations.schema_migrations` para la versión 20260808135357
-- (recuperado con `select statements from ... where version = '20260808135357'`),
-- y el nombre del fichero lleva esa misma versión a propósito: así un
-- `supabase db push` desde limpio la ve YA aplicada y no la reaplica con otra
-- marca de tiempo. Es el mismo procedimiento que siguió #567.
--
-- ─── Qué pasó ──────────────────────────────────────────────────────────────
-- PR #822 arregló el error de Sentry JAVASCRIPT-NEXTJS-11 en dos mitades:
-- cambió el cliente para que usara `row.accion_id` Y aplicó esta migración a
-- producción el 2026-08-08. Pero el commit solo llevó la mitad cliente: toca
-- 10 ficheros y ninguno en supabase/migrations. Producción quedó bien y el
-- REPO se quedó con la RPC devolviendo solo (saldo, otorgado).
--
-- Consecuencia: no un fallo en producción —ahí lleva funcionando desde
-- entonces— sino que el repo dejó de poder reconstruir producción. Cualquier
-- base levantada desde las migraciones (local, CI, un proyecto nuevo) tenía el
-- bug vivo: `row.accion_id` undefined → `accionId` null → studio-context corta
-- con capturarMensaje('[otorgarCreditos] RPC otorgado=true sin accionId') y no
-- escribe reward_history ni credit_transactions.
--
-- El guardián lib/rpc-columnas-declaradas.test.ts existe para que un fichero
-- que falta vuelva a fallar en CI, y no dentro de un año.
--
-- ⚠️ No "mejorar" este fichero: tiene que seguir siendo idéntico a lo aplicado.
-- Cualquier cambio de verdad va en una migración nueva con su propia versión.
-- ───────────────────────────────────────────────────────────────────────────

-- La firma de argumentos no cambia, pero el tipo de retorno sí (gana
-- accion_id) — CREATE OR REPLACE no permite cambiar RETURNS TABLE, hace
-- falta DROP + CREATE. Motivo: el cliente fabricaba su propio id para
-- reward_history.action_id en vez de usar el que el servidor insertó de
-- verdad en reward_actions, violando reward_history_action_id_fkey siempre
-- (Sentry JAVASCRIPT-NEXTJS-11).

drop function if exists public.otorgar_credito_disparador(text, text, text, text, text);

create function public.otorgar_credito_disparador(
  p_studio_id text, p_socio_id text, p_trigger text, p_ref_id text, p_config_id text default null
)
 returns table(saldo integer, otorgado boolean, accion_id text)
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_creditos int;
  v_saldo int;
  v_id text;
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
    select creditos into v_creditos from reward_rules
      where studio_id = p_studio_id and trigger = 'ASISTENCIA_CLASE' and activa limit 1;

  elsif p_trigger = 'REFERIDO_AMIGO' then
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
    select mc.saldo into v_saldo from member_credits mc where mc.socio_id = p_socio_id and mc.studio_id = p_studio_id;
    return query select coalesce(v_saldo, 0), false, null::text;
    return;
  end;

  insert into member_credits (socio_id, studio_id, saldo, total_ganado, total_canjeado, actualizado_en)
    values (p_socio_id, p_studio_id, v_creditos, v_creditos, 0, now())
  on conflict (socio_id) do update set
    saldo = member_credits.saldo + v_creditos,
    total_ganado = member_credits.total_ganado + v_creditos,
    actualizado_en = now()
  returning member_credits.saldo into v_saldo;

  return query select v_saldo, true, v_id;
end;
$function$;

-- Gotcha de grants (van 3+ veces en este repo): DROP+CREATE resetea el
-- privilegio a EXECUTE ... TO PUBLIC por defecto.
revoke all on function public.otorgar_credito_disparador(text, text, text, text, text) from public, anon;
grant execute on function public.otorgar_credito_disparador(text, text, text, text, text) to authenticated, service_role;
