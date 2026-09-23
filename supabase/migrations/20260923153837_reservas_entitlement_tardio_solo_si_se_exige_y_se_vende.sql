-- Las tres RPCs que confirman una reserva DESPUÉS de que naciera (aprobación
-- manual, promoción de lista de espera, aceptación de una oferta con plazo)
-- recomprobaban el entitlement (D-2, 20260922181022) de forma INCONDICIONAL.
-- `reservar_plaza`, en cambio, solo lo exige si `p_exigir_entitlement` es true.
-- La regla de negocio (la que `crearReservaPublica` aplica con
-- `hayAlgoQueContratar`, lib/bono-logic.ts, y que #2265 hace llegar también a la
-- RPC) tiene DOS condiciones a la vez:
--   1. el ajuste resuelto pide plan: `heredaOverride(tipos_clase.reserva_exigir_plan,
--      studios.reserva_exigir_plan)`;
--   2. el estudio tiene algo que contratar (alguna fila `planes_tarifa` activa).
--
-- Un estudio recién creado tiene el ajuste a true de fábrica y las tarifas del
-- asistente en borrador (activo = false): la reserva entra —nada que exigir; por
-- mostrador, o por la alumna una vez mergeado #2265— pero si necesitaba
-- aprobación o esperaba en lista, nunca podía confirmarse ni promocionarse, porque estas tres funciones pedían un plan que nadie puede
-- comprar. Falla cerrado (no regala clases), así que era un fallo funcional, no
-- de seguridad.
--
-- Esta migración lleva la MISMA regla a las tres, en un único sitio
-- (`reserva_exige_plan`), en vez de copiar la condición tres veces.
--
-- Los cuerpos de abajo son los vivos en producción, tal cual (incluidos R-8 en
-- `resolver_reserva_pendiente` y D-4 en `promocionar_siguiente_espera`, que son
-- posteriores a 20260922181022), salvo el condicional de entitlement.
-- Ninguna firma cambia, así que los grants no se resetean; se reafirman igual y
-- se verifican al final.

create or replace function public.reserva_exige_plan(p_studio_id text, p_tipo_clase_id text)
 returns boolean
 language sql
 stable
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select coalesce(
           (select tc.reserva_exigir_plan from public.tipos_clase as tc
             where tc.id = p_tipo_clase_id and tc.studio_id = p_studio_id),
           (select s.reserva_exigir_plan from public.studios as s
             where s.id = p_studio_id),
           true
         )
     and exists (
           select 1 from public.planes_tarifa as pt
            where pt.studio_id = p_studio_id and pt.activo is true
         );
$function$;

comment on function public.reserva_exige_plan(text, text) is
  'Misma regla de negocio que el gate de reserva (crearReservaPublica + hayAlgoQueContratar, lib/bono-logic.ts): el ajuste heredado (tipo de clase sobre estudio, por defecto true) Y que el estudio tenga alguna tarifa activa. Solo de servidor.';

revoke all on function public.reserva_exige_plan(text, text) from public, anon, authenticated;
grant execute on function public.reserva_exige_plan(text, text) to service_role, postgres;

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
  return query select v_estado, v_pos;
end;
$function$;

revoke all on function public.resolver_reserva_pendiente(text, text, boolean) from public, anon;
grant execute on function public.resolver_reserva_pendiente(text, text, boolean) to authenticated, service_role, postgres;

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

revoke all on function public.promocionar_siguiente_espera(text, text, integer) from public, anon, authenticated;
grant execute on function public.promocionar_siguiente_espera(text, text, integer) to service_role, postgres;

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
  return query select 'CONFIRMADA'::text;
end; $function$;

revoke all on function public.aceptar_oferta_lista_espera(text, text, text) from public, anon, authenticated;
grant execute on function public.aceptar_oferta_lista_espera(text, text, text) to service_role, postgres;

-- Verificación de grants (falla la migración si alguno no es el esperado).
do $$
begin
  if has_function_privilege('anon', 'public.reserva_exige_plan(text,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.reserva_exige_plan(text,text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.reserva_exige_plan(text,text)', 'EXECUTE') then
    raise exception 'grants inesperados en reserva_exige_plan';
  end if;
  if has_function_privilege('anon', 'public.resolver_reserva_pendiente(text,text,boolean)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.resolver_reserva_pendiente(text,text,boolean)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.resolver_reserva_pendiente(text,text,boolean)', 'EXECUTE') then
    raise exception 'grants inesperados en resolver_reserva_pendiente';
  end if;
  if has_function_privilege('anon', 'public.promocionar_siguiente_espera(text,text,integer)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.promocionar_siguiente_espera(text,text,integer)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.promocionar_siguiente_espera(text,text,integer)', 'EXECUTE') then
    raise exception 'grants inesperados en promocionar_siguiente_espera';
  end if;
  if has_function_privilege('anon', 'public.aceptar_oferta_lista_espera(text,text,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.aceptar_oferta_lista_espera(text,text,text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.aceptar_oferta_lista_espera(text,text,text)', 'EXECUTE') then
    raise exception 'grants inesperados en aceptar_oferta_lista_espera';
  end if;
end $$;
