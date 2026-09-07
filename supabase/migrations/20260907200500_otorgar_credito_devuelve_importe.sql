-- ═══════════════════════════════════════════════════════════════════════════
-- La RPC devuelve el IMPORTE y la DESCRIPCIÓN que ha aplicado.
--
-- El panel llamaba así (studio-context, `otorgarCreditos`):
--
--     const { otorgar, regla } = decidirOtorgarCreditos(rewardRules, ...);
--     if (!otorgar || !regla) return;              // ← filtro local
--     const res = await dbOtorgarCreditoDisparador(...);
--     ... creditos: regla.creditos                 // ← importe del CLIENTE
--
-- Dos problemas, y el primero está activo en producción:
--
-- 1. El filtro local usa `rewardRules`, que desde #1375 (25-ago-2026) nunca se
--    carga en el panel. Con la lista vacía `decidirOtorgarCreditos` siempre
--    dice que no y la RPC NO SE LLEGA A LLAMAR. Última concesión por el panel
--    en producción: 21-ago-2026. Por el camino del portal, que no depende del
--    estado del cliente: sigue viva. Por eso no saltó ninguna alarma.
--
--    El filtro ya se documentaba como un atajo —«solo para no disparar una
--    llamada de más»— porque esta función revalida TODO en servidor: regla
--    activa, importe, condición real (una reserva ASISTIDA de verdad) e
--    idempotencia por UNIQUE. Así que la reparación no es rellenar la lista
--    para el filtro: es quitar el filtro. Un atajo que puede decir que no
--    cuando el servidor diría que sí no es un atajo, es una segunda regla.
--
-- 2. Quitado el filtro, el cliente se queda sin `regla` — y con razón, porque
--    ese `regla.creditos` era el importe del CLIENTE mientras la RPC aplicaba
--    el suyo recalculado. Si la regla cambiaba entre la carga y la concesión,
--    el ledger declaraba un número distinto del que se movió de verdad. Misma
--    familia que «precio mostrado ≠ precio cobrado».
--
-- Devolviendo lo aplicado, quien llama ya no tiene que adivinarlo ni conservar
-- estado para saberlo.
--
-- 3. Y puestos a que el importe correcto viva aquí, los dos apuntes del ledger
--    (`reward_history` y `credit_transactions`) se escriben AQUÍ TAMBIÉN, en la
--    misma transacción que mueve el saldo. Antes los escribía el cliente
--    después, sin `await` y sin mirar el error: si fallaban, el saldo se había
--    movido y no quedaba registro, y nadie se enteraba. Esto quita código del
--    cliente en vez de añadirlo, y hace imposible la mitad perdida.
--
--    `rule_id` va NULL en LOGRO y RETO: su FK apunta a `reward_rules` y un
--    logro no es una regla. La columna ya es nullable.
--
-- Cambia el tipo de retorno, así que DROP + CREATE (no lo permite REPLACE) y
-- rehacer los grants: el privilegio por defecto vuelve a EXECUTE TO PUBLIC.
-- ═══════════════════════════════════════════════════════════════════════════

drop function if exists public.otorgar_credito_disparador(text, text, text, text, text);

create function public.otorgar_credito_disparador(
  p_studio_id text, p_socio_id text, p_trigger text, p_ref_id text, p_config_id text default null
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

  elsif p_trigger in ('SEMANA_COMPLETA', 'PRIMERA_RESERVA', 'RENOVACION_PLAN', 'OBJETIVO_MENSUAL') then
    select r.creditos, r.nombre, r.id into v_creditos, v_desc, v_regla_id from reward_rules r
      where r.studio_id = p_studio_id and r.trigger = p_trigger and r.activa limit 1;

  elsif p_trigger = 'LOGRO' then
    select a.creditos_recompensa, 'Logro desbloqueado: ' || a.nombre into v_creditos, v_desc
      from achievement_definitions a
      where a.id = p_config_id and a.studio_id = p_studio_id and a.activo;

  elsif p_trigger = 'RETO' then
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

  -- Los dos apuntes, en esta misma transacción. `rule_id` solo cuando el
  -- disparador viene de una regla: LOGRO y RETO no tienen una.
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

-- Gotcha de grants documentado en este repo (van 3+ veces): DROP+CREATE resetea
-- el privilegio a EXECUTE ... TO PUBLIC por defecto.
revoke all on function public.otorgar_credito_disparador(text, text, text, text, text) from public, anon;
grant execute on function public.otorgar_credito_disparador(text, text, text, text, text) to authenticated, service_role;
