-- El descuento del bono en las confirmaciones tardías, dentro de la misma
-- transacción y bajo el mismo candado por socia que la confirmación.
--
-- `reservar_plaza` ya lo hace así desde el 22-sep (D-1): toma
-- `pg_advisory_xact_lock(hashtext(studio || ':' || socio))` y descuenta con
-- `consumir_bono_interno` en la misma transacción que confirma la plaza. Las
-- tres confirmaciones que llegan MÁS TARDE —aprobar una reserva pendiente,
-- aceptar una plaza ofrecida y subir a la siguiente de la lista de espera—
-- decidían el bono después, en TS y en otra transacción. Ahora lo decide la base
-- de datos en el mismo momento, igual que al reservar.
--
-- El bono lo elige `elegir_bono_consumible`, copia exacta de `elegirBono`
-- (lib/bono-logic.ts): la mensual vigente que cubre la clase gana (no se
-- descuenta nada); si no, el bono o la clase suelta con saldo, vigente y que
-- cubra la clase, el que caduca antes, con desempate por id en orden binario
-- (`collate "C"`, el mismo que compara JS: la base de datos está en en_US y
-- ordenaría distinto).
--
-- Mismo patrón defensivo que D-1: los rechazos de `consumir_bono_interno` no
-- tiran abajo una plaza que ya es válida por lo demás; TS relee la reserva y, si
-- quedó sin decidir, la decide como hasta ahora.
--
-- Sin cambios de firma ni de RETURNS TABLE: no hay caché de PostgREST que
-- refrescar. Los cuerpos parten de la definición viva (pg_get_functiondef,
-- 30-sep-2026); lo único nuevo en cada una está marcado con «descuento en la
-- transacción».
--
-- Orden de candados: el de la socia va SIEMPRE antes de las filas, como en
-- `reservar_plaza`, salvo en la promoción (que ya tiene la sesión cuando sabe a
-- quién le toca). El único ciclo posible ahí lo corta Postgres en un segundo y
-- TS reintenta una vez.

-- ── La elección del bono, en la base de datos ────────────────────────────────

create or replace function public.elegir_bono_consumible(
  p_studio_id text, p_socio_id text, p_tipo_clase_id text, p_hoy date default current_date
) returns text
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  select case
    -- La mensual gana, y solo ante una clase concreta: sin saber de qué clase
    -- se habla no se afirma que la cuota la cubra (sería regalar la clase).
    when p_tipo_clase_id is not null and exists (
      select 1
        from public.suscripciones as s
        join public.planes_tarifa as p on p.id = s.plan_id and p.studio_id = s.studio_id
       where s.studio_id = p_studio_id and s.socio_id = p_socio_id and s.estado = 'ACTIVA'
         and p.tipo = 'MENSUAL'
         and (s.fecha_fin is null or s.fecha_fin >= p_hoy)
         and public.plan_cubre_tipo_clase(p.id, p_tipo_clase_id)
    ) then null
    else (
      select s.id
        from public.suscripciones as s
        join public.planes_tarifa as p on p.id = s.plan_id and p.studio_id = s.studio_id
       where s.studio_id = p_studio_id and s.socio_id = p_socio_id and s.estado = 'ACTIVA'
         and s.sesiones_restantes is not null and s.sesiones_restantes > 0
         and p.tipo in ('BONO', 'PUNTUAL')
         and public.plan_cubre_tipo_clase(p.id, p_tipo_clase_id)
         and (s.fecha_fin is null or s.fecha_fin >= p_hoy)
       order by coalesce(s.fecha_fin, '9999-12-31'::date), s.id collate "C"
       limit 1
    )
  end;
$$;

revoke all on function public.elegir_bono_consumible(text, text, text, date) from public, anon;
revoke all on function public.elegir_bono_consumible(text, text, text, date) from authenticated;
grant execute on function public.elegir_bono_consumible(text, text, text, date) to service_role, postgres;

-- ── Aprobar una reserva pendiente ────────────────────────────────────────────

create or replace function public.resolver_reserva_pendiente(p_studio_id text, p_reserva_id text, p_aprobar boolean)
 returns table(estado text, posicion_espera integer)
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
#variable_conflict use_column
declare
  v_sesion_id text;
  v_socio_id text;
  v_inicio timestamptz;
  v_fin timestamptz;
  v_tipo_clase_id text;
  v_aforo int;
  v_ocupadas int;
  v_espera int;
  v_estado text;
  v_pos int;
  v_excede_total boolean := false;
  v_excede_tipo boolean := false;
begin
  perform public.validar_studio_mismatch(p_studio_id);

  if not public.es_llamada_servicio() and not public.puede_gestionar_calendario() then
    raise exception 'NO_AUTORIZADO';
  end if;

  -- Descuento en la transacción: el candado de la socia ANTES de las filas,
  -- como `reservar_plaza`. Se lee su id sin candado; el orden reserva → sesión
  -- de abajo no cambia (al revés chocaría con cancelar esta misma pendiente).
  select r.socio_id into v_socio_id
    from reservas as r
   where r.id = p_reserva_id and r.studio_id = p_studio_id and r.estado = 'PENDIENTE_APROBACION';
  if found and v_socio_id is not null then
    perform pg_advisory_xact_lock(hashtext(p_studio_id || ':' || v_socio_id));
  end if;

  select sesion_id, socio_id into v_sesion_id, v_socio_id
    from reservas
   where id = p_reserva_id and studio_id = p_studio_id and estado = 'PENDIENTE_APROBACION'
   for update;
  if not found then
    raise exception 'NO_ENCONTRADA_O_YA_RESUELTA';
  end if;

  -- R-8: defensa en profundidad — v_sesion_id ya viene de una reserva acotada
  -- a p_studio_id, pero la propia sesión también se filtra ahora por escrito.
  select inicio, fin, tipo_clase_id into v_inicio, v_fin, v_tipo_clase_id
    from sesiones where id = v_sesion_id and studio_id = p_studio_id for update;

  if public.fecha_en_cierre(p_studio_id, (v_inicio at time zone 'Europe/Madrid')::date) then
    raise exception 'ESTUDIO_CERRADO';
  end if;

  if v_inicio is null or v_inicio <= now() then
    update reservas set estado = 'CANCELADA' where id = p_reserva_id;
    return query select 'CANCELADA'::text, null::int;
    return;
  end if;

  if not p_aprobar then
    update reservas set estado = 'CANCELADA' where id = p_reserva_id;
    return query select 'CANCELADA'::text, null::int;
    return;
  end if;

  v_aforo := aforo_efectivo(v_sesion_id);
  select count(*) into v_ocupadas
    from reservas where sesion_id = v_sesion_id and estado in ('CONFIRMADA', 'ASISTIDA');

  if v_aforo is null or v_ocupadas < v_aforo then
    v_estado := 'CONFIRMADA';
    v_pos := null;
  else
    select count(*) into v_espera
      from reservas where sesion_id = v_sesion_id and estado = 'LISTA_ESPERA';
    v_estado := 'LISTA_ESPERA';
    v_pos := v_espera + 1;
  end if;

  if v_estado = 'CONFIRMADA' then
    -- D-2, solo si el estudio exige plan a esta clase Y vende algo
    -- (`reserva_exige_plan`): la misma regla con la que `reservar_plaza` dejó
    -- entrar la reserva.
    if v_tipo_clase_id is not null
       and public.reserva_exige_plan(p_studio_id, v_tipo_clase_id)
       and not public.socio_tiene_entitlement_activo(p_studio_id, v_socio_id, v_tipo_clase_id, current_date) then
      raise exception 'SIN_ENTITLEMENT';
    end if;

    if public.socio_tiene_conflicto_horario(p_studio_id, v_socio_id, v_sesion_id, v_inicio, v_fin) then
      raise exception 'CONFLICTO_HORARIO';
    end if;

    select ce.excede_total, ce.excede_tipo into v_excede_total, v_excede_tipo
      from public.calcular_excede_limite_semanal(p_studio_id, v_socio_id, v_tipo_clase_id, v_inicio) ce;

    if v_excede_total or v_excede_tipo then
      if not public.intentar_consumir_recuperacion_semanal(p_studio_id, v_socio_id, p_reserva_id) then
        if v_excede_tipo then
          raise exception 'LIMITE_SEMANAL_ACTIVIDAD';
        else
          raise exception 'LIMITE_SEMANAL';
        end if;
      end if;
    end if;
  end if;

  update reservas set estado = v_estado, posicion_espera = v_pos where id = p_reserva_id;

  -- Descuento en la transacción, como `reservar_plaza`: los rechazos defensivos
  -- de `consumir_bono_interno` no tumban una plaza ya válida.
  if v_estado = 'CONFIRMADA' then
    begin
      perform public.consumir_bono_interno(
        p_reserva_id, public.elegir_bono_consumible(p_studio_id, v_socio_id, v_tipo_clase_id), p_studio_id);
    exception when raise_exception then
      null;
    end;
  end if;

  return query select v_estado, v_pos;
end;
$function$;

revoke all on function public.resolver_reserva_pendiente(text, text, boolean) from public, anon;
revoke all on function public.resolver_reserva_pendiente(text, text, boolean) from authenticated;
grant execute on function public.resolver_reserva_pendiente(text, text, boolean) to service_role, postgres;

-- ── Aceptar una plaza ofrecida ───────────────────────────────────────────────

create or replace function public.aceptar_oferta_lista_espera(p_studio_id text, p_reserva_id text, p_socio_id text)
 returns table(estado text)
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_sesion_id text; v_res_socio text; v_expira timestamptz;
  v_inicio timestamptz; v_fin timestamptz; v_tipo_clase_id text;
  v_cancelada boolean; v_aforo int; v_ocupadas int;
  v_excede_total boolean; v_excede_tipo boolean;
begin
  perform public.validar_studio_mismatch(p_studio_id);
  -- Descuento en la transacción: el candado de la socia ANTES de las filas,
  -- como `reservar_plaza`.
  perform pg_advisory_xact_lock(hashtext(p_studio_id || ':' || p_socio_id));
  select r.sesion_id into v_sesion_id from reservas as r
   where r.id = p_reserva_id and r.studio_id = p_studio_id and r.estado = 'LISTA_ESPERA';
  if not found then raise exception 'OFERTA_NO_ENCONTRADA'; end if;
  select s.inicio, s.fin, s.tipo_clase_id, coalesce(s.cancelada, false)
    into v_inicio, v_fin, v_tipo_clase_id, v_cancelada
    from sesiones as s
   where s.id = v_sesion_id and s.studio_id = p_studio_id for update;
  if not found then raise exception 'SESION_NO_ENCONTRADA'; end if;
  select r.socio_id, r.oferta_expira_en into v_res_socio, v_expira from reservas as r
   where r.id = p_reserva_id and r.studio_id = p_studio_id and r.estado = 'LISTA_ESPERA' for update;
  if not found then raise exception 'OFERTA_NO_ENCONTRADA'; end if;
  if v_res_socio is distinct from p_socio_id then raise exception 'NO_AUTORIZADO'; end if;
  if v_expira is null then raise exception 'SIN_OFERTA_ACTIVA'; end if;
  if now() > v_expira then raise exception 'OFERTA_CADUCADA'; end if;

  if v_cancelada then
    update reservas set estado='CANCELADA', posicion_espera=null, oferta_expira_en=null where id = p_reserva_id;
    perform public.renumerar_lista_espera(v_sesion_id);
    return query select 'CLASE_CANCELADA'::text;
    return;
  end if;
  if v_inicio <= now() then
    update reservas set estado='CANCELADA', posicion_espera=null, oferta_expira_en=null where id = p_reserva_id;
    perform public.renumerar_lista_espera(v_sesion_id);
    return query select 'CLASE_YA_EMPEZADA'::text;
    return;
  end if;

  v_aforo := aforo_efectivo(v_sesion_id);
  select count(*) into v_ocupadas from reservas as r
   where r.sesion_id = v_sesion_id and r.estado in ('CONFIRMADA','ASISTIDA');
  if v_aforo is not null and v_ocupadas >= v_aforo then
    update reservas set estado='CANCELADA', posicion_espera=null, oferta_expira_en=null where id = p_reserva_id;
    perform public.renumerar_lista_espera(v_sesion_id);
    return query select 'AFORO_LLENO'::text;
    return;
  end if;

  -- RES-1: recomprobación en el momento REAL de confirmar (no solo al abrir
  -- la oferta) — puede haber reservado otra cosa o agotado su cuota mientras
  -- la oferta estaba abierta. Conflicto primero porque no muta nada; el
  -- límite semanal después, porque sí puede consumir una recuperación.
  if public.socio_tiene_conflicto_horario(p_studio_id, p_socio_id, v_sesion_id, v_inicio, v_fin) then
    update reservas set estado='CANCELADA', posicion_espera=null, oferta_expira_en=null where id = p_reserva_id;
    perform public.renumerar_lista_espera(v_sesion_id);
    return query select 'CONFLICTO_HORARIO'::text;
    return;
  end if;

  -- D-2: mismo motivo que el conflicto de arriba — el bono/plan pudo dejar de
  -- cubrir la clase mientras la oferta estaba abierta. Solo si el estudio exige
  -- plan a esta clase Y vende algo (`reserva_exige_plan`).
  if v_tipo_clase_id is not null
     and public.reserva_exige_plan(p_studio_id, v_tipo_clase_id)
     and not public.socio_tiene_entitlement_activo(p_studio_id, p_socio_id, v_tipo_clase_id, current_date) then
    update reservas set estado='CANCELADA', posicion_espera=null, oferta_expira_en=null where id = p_reserva_id;
    perform public.renumerar_lista_espera(v_sesion_id);
    return query select 'SIN_ENTITLEMENT'::text;
    return;
  end if;

  select ce.excede_total, ce.excede_tipo into v_excede_total, v_excede_tipo
    from public.calcular_excede_limite_semanal(p_studio_id, p_socio_id, v_tipo_clase_id, v_inicio) ce;
  if (v_excede_total or v_excede_tipo)
     and not public.intentar_consumir_recuperacion_semanal(p_studio_id, p_socio_id, p_reserva_id) then
    update reservas set estado='CANCELADA', posicion_espera=null, oferta_expira_en=null where id = p_reserva_id;
    perform public.renumerar_lista_espera(v_sesion_id);
    if v_excede_tipo then
      return query select 'LIMITE_SEMANAL_ACTIVIDAD'::text;
    else
      return query select 'LIMITE_SEMANAL'::text;
    end if;
    return;
  end if;

  update reservas set estado='CONFIRMADA', posicion_espera=null, oferta_expira_en=null where id = p_reserva_id;
  perform public.renumerar_lista_espera(v_sesion_id);

  -- Descuento en la transacción, como `reservar_plaza`.
  begin
    perform public.consumir_bono_interno(
      p_reserva_id, public.elegir_bono_consumible(p_studio_id, p_socio_id, v_tipo_clase_id), p_studio_id);
  exception when raise_exception then
    null;
  end;

  return query select 'CONFIRMADA'::text;
end; $function$;

revoke all on function public.aceptar_oferta_lista_espera(text, text, text) from public, anon;
revoke all on function public.aceptar_oferta_lista_espera(text, text, text) from authenticated;
grant execute on function public.aceptar_oferta_lista_espera(text, text, text) to service_role, postgres;

-- ── Subir a la siguiente de la lista de espera ───────────────────────────────

create or replace function public.promocionar_siguiente_espera(p_studio_id text, p_sesion_id text, p_plazo_minutos integer)
 returns table(promovida_socio_id text, oferta_socio_id text, oferta_expira_en timestamp with time zone)
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_expira timestamptz;
  v_aforo int; v_ocupadas int;
  v_tipo text; v_requiere boolean;
  v_inicio timestamptz; v_fin timestamptz;
  v_excede_total boolean; v_excede_tipo boolean;
  v_conflicto boolean;
  v_exige_plan boolean;
  v_cand record;
begin
  if not exists (
    select 1 from public.sesiones s
     where s.id = p_sesion_id
       and s.studio_id = p_studio_id
       and coalesce(s.cancelada, false) = false
       and s.inicio > now()
       and not public.fecha_en_cierre(s.studio_id, (s.inicio at time zone 'Europe/Madrid')::date)
  ) then
    return query select null::text, null::text, null::timestamptz;
    return;
  end if;

  -- D-4: candado de la sesión AQUÍ, antes de leer aforo/ocupadas — para que
  -- cualquier llamante (los ya existentes y los que vengan) quede
  -- serializado contra `reservar_plaza` sobre la MISMA sesión.
  select s.tipo_clase_id, s.inicio, s.fin into v_tipo, v_inicio, v_fin
    from public.sesiones s where s.id = p_sesion_id
    for update;
  select tc.requiere_autorizacion into v_requiere
    from public.tipos_clase tc where tc.id = v_tipo;

  -- D-2, solo si el estudio exige plan a esta clase Y vende algo. Una vez por
  -- llamada: no depende de la candidata.
  v_exige_plan := v_tipo is not null and public.reserva_exige_plan(p_studio_id, v_tipo);

  v_aforo := aforo_efectivo(p_sesion_id);
  select count(*) into v_ocupadas from reservas as r
   where r.sesion_id = p_sesion_id and r.estado in ('CONFIRMADA', 'ASISTIDA');
  if v_aforo is not null and v_ocupadas >= v_aforo then
    return query select null::text, null::text, null::timestamptz;
    return;
  end if;

  for v_cand in
    select r.id, r.socio_id from reservas as r
     where r.sesion_id = p_sesion_id and r.estado = 'LISTA_ESPERA' and r.oferta_expira_en is null
       and (
         not coalesce(v_requiere, false)
         or exists (
           select 1 from socio_tipos_clase_autorizados a
            where a.studio_id = p_studio_id
              and a.socio_id = r.socio_id
              and a.tipo_clase_id = v_tipo
         )
       )
     order by r.creado_en asc, r.id asc
     for update
  loop
    -- Descuento en la transacción: en la promoción directa, el candado de la
    -- candidata ANTES de sus comprobaciones (solape, plan, límite), como
    -- `reservar_plaza`. La oferta con plazo no confirma nada: no lo necesita.
    if coalesce(p_plazo_minutos, 0) <= 0 then
      perform pg_advisory_xact_lock(hashtext(p_studio_id || ':' || v_cand.socio_id));
    end if;

    v_conflicto := public.socio_tiene_conflicto_horario(p_studio_id, v_cand.socio_id, p_sesion_id, v_inicio, v_fin);
    if v_conflicto then
      continue;
    end if;

    if v_exige_plan
       and not public.socio_tiene_entitlement_activo(p_studio_id, v_cand.socio_id, v_tipo, current_date) then
      continue;
    end if;

    if coalesce(p_plazo_minutos, 0) <= 0 then
      select ce.excede_total, ce.excede_tipo into v_excede_total, v_excede_tipo
        from public.calcular_excede_limite_semanal(p_studio_id, v_cand.socio_id, v_tipo, v_inicio) ce;
      if (v_excede_total or v_excede_tipo)
         and not public.intentar_consumir_recuperacion_semanal(p_studio_id, v_cand.socio_id, v_cand.id) then
        continue;
      end if;
      update reservas set estado='CONFIRMADA', posicion_espera=null, oferta_expira_en=null where id = v_cand.id;

      -- Descuento en la transacción, como `reservar_plaza`.
      begin
        perform public.consumir_bono_interno(
          v_cand.id, public.elegir_bono_consumible(p_studio_id, v_cand.socio_id, v_tipo), p_studio_id);
      exception when raise_exception then
        null;
      end;

      return query select v_cand.socio_id, null::text, null::timestamptz;
      return;
    else
      v_expira := now() + make_interval(mins => p_plazo_minutos);
      update reservas set oferta_expira_en = v_expira where id = v_cand.id;
      return query select null::text, v_cand.socio_id, v_expira;
      return;
    end if;
  end loop;

  return query select null::text, null::text, null::timestamptz;
end; $function$;

revoke all on function public.promocionar_siguiente_espera(text, text, integer) from public, anon;
revoke all on function public.promocionar_siguiente_espera(text, text, integer) from authenticated;
grant execute on function public.promocionar_siguiente_espera(text, text, integer) to service_role, postgres;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.elegir_bono_consumible(text,text,text,date)',
    'public.resolver_reserva_pendiente(text,text,boolean)',
    'public.aceptar_oferta_lista_espera(text,text,text)',
    'public.promocionar_siguiente_espera(text,text,integer)'
  ] loop
    if has_function_privilege('anon', f, 'EXECUTE')
       or has_function_privilege('authenticated', f, 'EXECUTE')
       or not has_function_privilege('service_role', f, 'EXECUTE') then
      raise exception 'permisos distintos de lo previsto en %', f;
    end if;
  end loop;
end $$;
