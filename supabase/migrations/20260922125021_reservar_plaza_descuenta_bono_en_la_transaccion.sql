-- D-1 (auditoria 22-sep): reservar_plaza confirmaba la plaza y devolvia el
-- control SIN descontar el bono -- el descuento ocurria despues, en TS, ya
-- fuera del pg_advisory_xact_lock por socio que reservar_plaza suelta al
-- terminar. Dos reservas concurrentes de la MISMA socia en DOS clases
-- distintas podian leer el mismo saldo sin que ninguna hubiera descontado
-- todavia y las dos salian CONFIRMADA (una de ellas sin cobrar). El arreglo:
-- mover el descuento DENTRO de reservar_plaza, tras el INSERT, en la misma
-- transaccion/candado -- verificado en vivo (execute_sql + ROLLBACK) que una
-- segunda llamada con el mismo socio y la misma suscripcion, tras la primera,
-- ahora falla con SIN_ENTITLEMENT en vez de confirmar sin cobrar.

-- 1) Helper compartido: la logica real de "descontar el bono de ESTA reserva"
-- (antes solo vivia en consumir_sesion_bono_reserva). La extraemos para que
-- la reutilicen tanto reservar_plaza (dentro de su propia transaccion) como
-- consumir_sesion_bono_reserva (para el resto de duenos: trasPlazaConfirmada,
-- trasPromocionDeEspera, completarConfirmacionTrasReintento -- que NO pasan
-- por reservar_plaza en la misma llamada).
create or replace function public.consumir_bono_interno(p_reserva_id text, p_suscripcion_id text, p_studio_id text)
 returns table(resultado text, saldo_restante integer, suscripcion_consumida_id text)
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_estado text;
  v_sesion_id text;
  v_socio_id text;
  v_decidido_en timestamptz;
  v_sus_previa text;
  v_sus_socio_id text;
  v_plan_id text;
  v_tipo_clase_id text;
  v_acotado boolean;
  v_saldo integer;
begin
  select r.estado, r.sesion_id, r.socio_id, r.bono_decidido_en, r.bono_suscripcion_id
    into v_estado, v_sesion_id, v_socio_id, v_decidido_en, v_sus_previa
    from public.reservas as r
   where r.id = p_reserva_id and r.studio_id = p_studio_id
   for update;

  if not found then
    return query select 'RESERVA_NO_ENCONTRADA'::text, null::integer, null::text;
    return;
  end if;

  if v_decidido_en is not null then
    if v_sus_previa is null then
      return query select 'YA_DECIDIDA'::text, null::integer, null::text;
      return;
    end if;
    return query
      select 'YA_CONSUMIDA'::text,
             (select s.sesiones_restantes
                from public.suscripciones as s
               where s.id = v_sus_previa and s.studio_id = p_studio_id),
             v_sus_previa;
    return;
  end if;

  if v_estado not in ('CONFIRMADA', 'ASISTIDA', 'NO_ASISTIO') then
    return query select 'NO_OCUPA_PLAZA'::text, null::integer, null::text;
    return;
  end if;

  if p_suscripcion_id is null then
    update public.reservas as r
       set bono_decidido_en = now(), bono_suscripcion_id = null
     where r.id = p_reserva_id;
    return query select 'SIN_BONO'::text, null::integer, null::text;
    return;
  end if;

  if v_sesion_id is null then
    raise exception 'SESION_REQUERIDA';
  end if;

  select s.plan_id, s.socio_id into v_plan_id, v_sus_socio_id
    from public.suscripciones as s
   where s.id = p_suscripcion_id and s.studio_id = p_studio_id;

  if v_sus_socio_id is null or v_sus_socio_id is distinct from v_socio_id then
    raise exception 'SUSCRIPCION_NO_ES_DE_LA_SOCIA';
  end if;

  select ss.tipo_clase_id into v_tipo_clase_id
    from public.sesiones as ss
   where ss.id = v_sesion_id and ss.studio_id = p_studio_id;

  select exists (
    select 1 from public.plan_tipos_clase as ptc
     where ptc.plan_id = v_plan_id and ptc.studio_id = p_studio_id
  ) into v_acotado;

  if v_acotado and v_tipo_clase_id is not null and not exists (
    select 1 from public.plan_tipos_clase as ptc
     where ptc.plan_id = v_plan_id and ptc.studio_id = p_studio_id
       and ptc.tipo_clase_id = v_tipo_clase_id
  ) then
    raise exception 'BONO_NO_CUBRE_CLASE';
  end if;

  update public.suscripciones as s
     set sesiones_restantes = s.sesiones_restantes - 1
   where s.id = p_suscripcion_id
     and s.studio_id = p_studio_id
     and s.sesiones_restantes > 0
  returning s.sesiones_restantes into v_saldo;

  if not found then
    update public.reservas as r
       set bono_decidido_en = now(), bono_suscripcion_id = null
     where r.id = p_reserva_id;
    return query select 'SIN_SALDO'::text, null::integer, null::text;
    return;
  end if;

  update public.reservas as r
     set bono_suscripcion_id = p_suscripcion_id,
         bono_decidido_en = now()
   where r.id = p_reserva_id;

  return query select 'CONSUMIDA'::text, v_saldo, p_suscripcion_id;
end;
$function$;

revoke all on function public.consumir_bono_interno(text, text, text) from public, anon, authenticated;
grant execute on function public.consumir_bono_interno(text, text, text) to service_role;

-- 2) consumir_sesion_bono_reserva delega en el helper. MISMA firma (create or
-- replace, sin gotcha de grants): la usan trasPlazaConfirmada,
-- trasPromocionDeEspera, completarConfirmacionTrasReintento y el `reintento`
-- de trasReservaCreada -- caminos que NO pasan por reservar_plaza en esta
-- misma llamada.
create or replace function public.consumir_sesion_bono_reserva(p_reserva_id text, p_suscripcion_id text, p_studio_id text, p_reintento boolean default false)
 returns table(resultado text, saldo_restante integer, suscripcion_consumida_id text)
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_rastreado boolean;
begin
  if not public.es_llamada_servicio() then
    raise exception 'NO_AUTORIZADO';
  end if;

  if p_reintento then
    select r.bono_consumo_rastreado into v_rastreado
      from public.reservas as r
     where r.id = p_reserva_id and r.studio_id = p_studio_id;
    if not found then
      return query select 'RESERVA_NO_ENCONTRADA'::text, null::integer, null::text;
      return;
    end if;
    if v_rastreado is not true then
      return query select 'NO_VERIFICABLE'::text, null::integer, null::text;
      return;
    end if;
  end if;

  return query select * from public.consumir_bono_interno(p_reserva_id, p_suscripcion_id, p_studio_id);
end;
$function$;

-- 3) reservar_plaza: nueva firma (gana p_suscripcion_id) y nuevas columnas de
-- salida (bono_resultado/bono_saldo_restante/bono_suscripcion_id). RETURNS
-- TABLE no admite `create or replace` con distinta forma: hace falta DROP +
-- CREATE, y por tanto rehacer los grants desde cero (gotcha ya documentado en
-- este repo -- Postgres da EXECUTE a PUBLIC por defecto en la funcion nueva).
drop function public.reservar_plaza(text, text, text, text, boolean, boolean, text, boolean, boolean);

create or replace function public.reservar_plaza(
  p_studio_id text, p_sesion_id text, p_socio_id text, p_reserva_id text,
  p_permite_lista_espera boolean default true, p_requiere_aprobacion boolean default false,
  p_spot_id text default null::text, p_saltar_gate_impago boolean default false,
  p_exigir_entitlement boolean default true, p_suscripcion_id text default null::text
)
 returns table(estado text, posicion_espera integer, bono_resultado text, bono_saldo_restante integer, bono_suscripcion_id text)
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
#variable_conflict use_column
declare
  v_inicio timestamptz;
  v_fin timestamptz;
  v_sala_id text;
  v_instructor_id text;
  v_tipo_clase_id text;
  v_requiere_autorizacion boolean;
  v_aforo int;
  v_ocupadas int;
  v_espera int;
  v_estado text;
  v_pos int;
  v_spot_sala_id text;
  v_spot_activo boolean;
  v_spot_ocupado text;
  v_bloquea_impago boolean;
  v_excede_total boolean := false;
  v_excede_tipo boolean := false;
  v_bono_resultado text := null;
  v_bono_saldo int := null;
  v_bono_sus_id text := null;
begin
  perform public.validar_studio_mismatch(p_studio_id);
  perform public.validar_socio_del_studio(p_socio_id, p_studio_id);

  perform pg_advisory_xact_lock(hashtext(p_studio_id || ':' || p_socio_id));

  select inicio, fin, instructor_id, sala_id, tipo_clase_id
    into v_inicio, v_fin, v_instructor_id, v_sala_id, v_tipo_clase_id
    from sesiones where id = p_sesion_id and studio_id = p_studio_id
    for update;
  if not found then
    raise exception 'SESION_NO_ENCONTRADA';
  end if;

  if public.fecha_en_cierre(p_studio_id, (v_inicio at time zone 'Europe/Madrid')::date) then
    raise exception 'ESTUDIO_CERRADO';
  end if;

  if not p_saltar_gate_impago and public.current_rol() is null then
    select coalesce(st.bloquear_reserva_impago, false) into v_bloquea_impago
      from studios st where st.id = p_studio_id;
    if v_bloquea_impago and public.socio_tiene_impago(p_studio_id, p_socio_id) then
      raise exception 'RESERVA_BLOQUEADA_IMPAGO';
    end if;
  end if;

  if public.current_rol() = 'INSTRUCTOR' then
    if v_instructor_id is distinct from public.current_instructor_id() then
      raise exception 'NO_AUTORIZADO';
    end if;
  end if;

  if v_tipo_clase_id is not null then
    select tc.requiere_autorizacion into v_requiere_autorizacion
      from tipos_clase tc
     where tc.id = v_tipo_clase_id and tc.studio_id = p_studio_id;

    if coalesce(v_requiere_autorizacion, false) and not exists (
      select 1 from socio_tipos_clase_autorizados a
       where a.socio_id = p_socio_id
         and a.tipo_clase_id = v_tipo_clase_id
         and a.studio_id = p_studio_id
    ) then
      raise exception 'NECESITA_AUTORIZACION';
    end if;
  end if;

  if p_exigir_entitlement and v_tipo_clase_id is not null then
    if not public.socio_tiene_entitlement_activo(p_studio_id, p_socio_id, v_tipo_clase_id, current_date) then
      raise exception 'SIN_ENTITLEMENT';
    end if;
  end if;

  if exists (
    select 1 from reservas
    where sesion_id = p_sesion_id and socio_id = p_socio_id
      and estado in ('CONFIRMADA', 'LISTA_ESPERA', 'ASISTIDA', 'PENDIENTE_APROBACION')
  ) then
    raise exception 'YA_RESERVADA';
  end if;

  if p_spot_id is not null then
    select sp.sala_id, coalesce(sp.activo, true) into v_spot_sala_id, v_spot_activo
      from spots sp
      where sp.id = p_spot_id and sp.studio_id = p_studio_id
      for update;
    if not found or v_spot_sala_id is distinct from v_sala_id then
      raise exception 'SPOT_NO_PERTENECE_A_LA_SALA';
    end if;
    if not v_spot_activo then
      raise exception 'SPOT_NO_DISPONIBLE';
    end if;

    select r.id into v_spot_ocupado
      from reservas r
      where r.sesion_id = p_sesion_id and r.spot_id = p_spot_id
        and r.estado in ('CONFIRMADA', 'ASISTIDA')
      for update;
    if v_spot_ocupado is not null then
      raise exception 'SPOT_OCUPADO';
    end if;
  end if;

  if p_requiere_aprobacion then
    v_estado := 'PENDIENTE_APROBACION';
    v_pos := null;
  else
    v_aforo := aforo_efectivo(p_sesion_id);

    select count(*) into v_ocupadas
      from reservas
      where sesion_id = p_sesion_id and estado in ('CONFIRMADA', 'ASISTIDA');

    if v_aforo is null or v_ocupadas < v_aforo then
      v_estado := 'CONFIRMADA';
      v_pos := null;
    else
      if not p_permite_lista_espera then
        raise exception 'AFORO_LLENO_SIN_ESPERA';
      end if;
      select count(*) into v_espera
        from reservas where sesion_id = p_sesion_id and estado = 'LISTA_ESPERA';
      v_estado := 'LISTA_ESPERA';
      v_pos := v_espera + 1;
    end if;
  end if;

  if v_estado in ('CONFIRMADA', 'PENDIENTE_APROBACION') and v_inicio is not null and v_fin is not null then
    if public.socio_tiene_conflicto_horario(p_studio_id, p_socio_id, p_sesion_id, v_inicio, v_fin) then
      raise exception 'CONFLICTO_HORARIO';
    end if;
  end if;

  if v_estado = 'CONFIRMADA' then
    select ce.excede_total, ce.excede_tipo into v_excede_total, v_excede_tipo
      from public.calcular_excede_limite_semanal(p_studio_id, p_socio_id, v_tipo_clase_id, v_inicio) ce;

    if v_excede_total or v_excede_tipo then
      if not public.intentar_consumir_recuperacion_semanal(p_studio_id, p_socio_id, p_reserva_id) then
        if v_excede_tipo then
          raise exception 'LIMITE_SEMANAL_ACTIVIDAD';
        else
          raise exception 'LIMITE_SEMANAL';
        end if;
      end if;
    end if;
  end if;

  insert into reservas (id, studio_id, sesion_id, socio_id, estado, spot_id, posicion_espera, check_in_en, creado_en)
    values (
      p_reserva_id, p_studio_id, p_sesion_id, p_socio_id, v_estado,
      case when v_estado = 'CONFIRMADA' then p_spot_id else null end,
      v_pos, null, now()
    );

  -- D-1: el descuento del bono se decide AQUI, dentro del mismo candado
  -- (pg_advisory_xact_lock por socio) y la misma transaccion que confirma la
  -- plaza -- no en una llamada TS posterior tras liberar el candado. Solo
  -- para CONFIRMADA directa: LISTA_ESPERA y PENDIENTE_APROBACION no ocupan
  -- plaza todavia y su bono se decide mas tarde (resolver_reserva_pendiente,
  -- aceptar_oferta_lista_espera -- fuera del alcance de D-1, ver D-2).
  if v_estado = 'CONFIRMADA' then
    select c.resultado, c.saldo_restante, c.suscripcion_consumida_id
      into v_bono_resultado, v_bono_saldo, v_bono_sus_id
      from public.consumir_bono_interno(p_reserva_id, p_suscripcion_id, p_studio_id) c;
  end if;

  return query select v_estado, v_pos, v_bono_resultado, v_bono_saldo, v_bono_sus_id;
end;
$function$;

revoke all on function public.reservar_plaza(text, text, text, text, boolean, boolean, text, boolean, boolean, text) from public, anon, authenticated;
grant execute on function public.reservar_plaza(text, text, text, text, boolean, boolean, text, boolean, boolean, text) to service_role, postgres;
