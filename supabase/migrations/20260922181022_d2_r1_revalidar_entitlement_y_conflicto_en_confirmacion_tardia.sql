-- D-2 + R-1 (auditoría 22-sep): las tres RPCs que confirman una reserva DÍAS u
-- HORAS después de que naciera (aprobación manual, promoción de lista de
-- espera, aceptación de una oferta con plazo) no volvían a comprobar dos
-- cosas que `reservar_plaza` sí exige al crear:
--   D-2: `socio_tiene_entitlement_activo` — el bono pudo agotarse en otra
--   clase, o el plan pudo darse de baja, mientras la reserva esperaba.
--   R-1: `socio_tiene_conflicto_horario` — solo `resolver_reserva_pendiente`
--   no lo comprobaba; `aceptar_oferta_lista_espera` y
--   `promocionar_siguiente_espera` ya lo hacían (RES-1).
--
-- Patrón de respuesta, según quién decide en cada camino (ya existente en
-- cada función, no inventado aquí):
--   · `resolver_reserva_pendiente` (staff resuelve manualmente): `raise
--     exception` — mismo criterio que LIMITE_SEMANAL* ya en la función: la
--     transacción revierte, la reserva SIGUE `PENDIENTE_APROBACION` y quien
--     aprueba ve un mensaje para decidir, no el sistema por ella.
--   · `promocionar_siguiente_espera` (el sistema recorre la cola): `continue`
--     — mismo criterio que el conflicto de horario ya en el bucle: se salta a
--     la siguiente candidata sin abortar nada.
--   · `aceptar_oferta_lista_espera` (la socia acepta sola): downgrade a
--     `CANCELADA` con un código de estado nuevo (`SIN_ENTITLEMENT`) — mismo
--     criterio que CONFLICTO_HORARIO/LIMITE_SEMANAL* ya en la función: pierde
--     el sitio, SIN compensación con recuperación (es su propio plan/bono, no
--     un fallo del estudio — mismo razonamiento que ya escribe el comentario
--     de `aceptarOfertaListaEspera` en TS para esos dos casos).

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

  select inicio, fin, tipo_clase_id into v_inicio, v_fin, v_tipo_clase_id
    from sesiones where id = v_sesion_id for update;

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
    -- D-2: revalidación de entitlement en el momento REAL de confirmar.
    if v_tipo_clase_id is not null
       and not public.socio_tiene_entitlement_activo(p_studio_id, v_socio_id, v_tipo_clase_id, current_date) then
      raise exception 'SIN_ENTITLEMENT';
    end if;

    -- R-1: esta RPC era la única de las tres que no recomprobaba conflicto.
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

  select s.tipo_clase_id, s.inicio, s.fin into v_tipo, v_inicio, v_fin
    from public.sesiones s where s.id = p_sesion_id;
  select tc.requiere_autorizacion into v_requiere
    from public.tipos_clase tc where tc.id = v_tipo;

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

    -- D-2: si ya no tiene un plan/bono que cubra esta clase, ofrecerle la
    -- plaza (directa o con plazo) es un hueco que nunca podrá ocupar de
    -- verdad. Se salta a la siguiente de la cola, mismo criterio que el
    -- conflicto de arriba.
    if v_tipo is not null
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
  -- cubrir la clase mientras la oferta estaba abierta.
  if v_tipo_clase_id is not null
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
