-- R-8 (auditoría 22-sep): varias RPCs/triggers `SECURITY DEFINER` leen
-- `sesiones` por id sin filtrar también por `studio_id` en la misma
-- consulta. **No explotable hoy** — el id siempre procede de una fila ya
-- acotada al estudio correcto (una reserva ya filtrada por
-- `studio_id = p_studio_id`, o `new.sesion_id` de un trigger sobre una fila
-- que ya pertenece a ese estudio) — pero es defensa en profundidad ausente
-- justo donde más cuesta si algún día cambia esa garantía.
--
-- Siete lecturas en seis funciones, puramente aditivo (añadir
-- `and studio_id = ...`/`and s.studio_id = ...` nunca puede cambiar el
-- resultado de una llamada legítima, porque el id ya implicaba ese estudio):
--   · resolver_reserva_pendiente, expirar_oferta_lista_espera,
--     cancelar_reserva_plaza (x3), reservar_cita: por p_studio_id.
--   · exigir_autorizacion_tipo_clase, trigger_detectar_penalizacion_no_show,
--     marcar_cancelacion_tardia: por new.studio_id (triggers).
--
-- De paso, dos de esos triggers (`exigir_autorizacion_tipo_clase`,
-- `marcar_cancelacion_tardia`) tenían EXECUTE abierto a `anon`/`authenticated`
-- sin ningún motivo — nadie los llama vía `.rpc(` (verificado con grep antes
-- de tocar nada, mismo criterio que exige este repo antes de revocar algo
-- que un advisor marca): son funciones de trigger puras
-- (`for each row execute function ...`), nunca pensadas para invocarse
-- directo. Se cierra ese EXECUTE de paso.
--
-- Verificado en vivo con execute_sql+ROLLBACK antes de aplicar: una
-- cancelación normal (`cancelar_reserva_plaza`, la de mayor riesgo por
-- tocar dinero) sigue devolviendo exactamente el mismo resultado
-- (era_confirmada, devolver_bono, etc.) con los filtros nuevos puestos.

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
    if v_tipo_clase_id is not null
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

create or replace function public.cancelar_reserva_plaza(p_studio_id text, p_reserva_id text, p_socio_id text, p_omitir_penalizacion boolean default false)
 returns table(era_confirmada boolean, promovida_socio_id text, devolver_bono boolean, oferta_socio_id text, oferta_expira_en timestamp with time zone, penalizacion_id text)
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_sesion_id text;
  v_estado text;
  v_res_socio text;
  v_instructor_id text;
  v_promo_socio text;
  v_oferta_socio text;
  v_oferta_expira timestamptz;
  v_tenia_oferta boolean;
  v_inicio timestamptz;
  v_tipo_clase_id text;
  v_ventana int;
  v_devolver_tardia boolean;
  v_tardia boolean;
  v_devolver boolean;
  v_plazo_espera int;
  v_penalizacion_importe numeric;
  v_penalizacion_aplica boolean;
  v_penalizacion_id text;
begin
  if not public.es_llamada_servicio() and p_studio_id is distinct from current_studio_id() then
    raise exception 'STUDIO_MISMATCH';
  end if;

  select reservas.sesion_id, reservas.estado, reservas.socio_id,
         (reservas.oferta_expira_en is not null)
    into v_sesion_id, v_estado, v_res_socio, v_tenia_oferta
    from reservas where reservas.id = p_reserva_id and reservas.studio_id = p_studio_id
    for update;
  if not found then raise exception 'RESERVA_NO_ENCONTRADA'; end if;
  if p_socio_id is not null and v_res_socio is distinct from p_socio_id then
    raise exception 'NO_AUTORIZADO';
  end if;

  if not public.es_llamada_servicio() and public.current_rol() = 'INSTRUCTOR' then
    -- R-8: defensa en profundidad, mismo motivo que las dos de abajo.
    select instructor_id into v_instructor_id from sesiones where id = v_sesion_id and studio_id = p_studio_id;
    if v_instructor_id is distinct from public.current_instructor_id() then
      raise exception 'NO_AUTORIZADO';
    end if;
  end if;

  if v_estado = 'CANCELADA' then
    return query select false, null::text, false, null::text, null::timestamptz, null::text;
    return;
  end if;

  perform 1 from sesiones where id = v_sesion_id and studio_id = p_studio_id for update;

  select ss.inicio, ss.tipo_clase_id into v_inicio, v_tipo_clase_id
    from sesiones ss where ss.id = v_sesion_id and ss.studio_id = p_studio_id;
  select coalesce(tc.ventana_cancelacion_horas, st.cancelacion_ventana_horas),
         coalesce(st.cancelacion_devolver_bono_tardia, false),
         coalesce(tc.lista_espera_plazo_aceptacion_minutos, st.lista_espera_plazo_aceptacion_minutos),
         coalesce(tc.penalizacion_importe_eur, st.penalizacion_importe_eur),
         coalesce(st.penalizacion_aplica_cancelacion_tardia, true)
    into v_ventana, v_devolver_tardia, v_plazo_espera, v_penalizacion_importe, v_penalizacion_aplica
    from studios st
    left join tipos_clase tc on tc.id = v_tipo_clase_id and tc.studio_id = p_studio_id
   where st.id = p_studio_id;

  v_tardia := coalesce(v_ventana, 0) > 0
              and now() >= v_inicio - make_interval(hours => v_ventana);
  v_devolver := v_devolver_tardia or not v_tardia;

  update reservas set estado = 'CANCELADA', posicion_espera = null, oferta_expira_en = null
   where id = p_reserva_id;

  update recuperaciones
     set estado = 'DISPONIBLE', usada_en_reserva_id = null
   where usada_en_reserva_id = p_reserva_id and estado = 'USADA';

  if v_estado in ('CONFIRMADA', 'ASISTIDA') and v_tardia and v_penalizacion_aplica
     and not p_omitir_penalizacion
     and v_penalizacion_importe is not null and v_penalizacion_importe > 0 then
    insert into penalizaciones (id, studio_id, socio_id, reserva_id, tipo, importe, estado)
      values ('pen-' || gen_random_uuid()::text, p_studio_id, v_res_socio, p_reserva_id, 'CANCELACION_TARDIA', v_penalizacion_importe, 'DETECTADA')
      on conflict (reserva_id, tipo) do nothing
      returning id into v_penalizacion_id;
  end if;

  if v_estado in ('CONFIRMADA', 'ASISTIDA')
     or (v_estado = 'LISTA_ESPERA' and v_tenia_oferta) then
    select pse.promovida_socio_id, pse.oferta_socio_id, pse.oferta_expira_en
      into v_promo_socio, v_oferta_socio, v_oferta_expira
      from public.promocionar_siguiente_espera(p_studio_id, v_sesion_id, v_plazo_espera) as pse;
  end if;

  update reservas r
     set posicion_espera = sub.rn
    from (
      select id, row_number() over (order by creado_en asc, id asc) as rn
        from reservas
       where sesion_id = v_sesion_id and estado = 'LISTA_ESPERA'
    ) sub
   where r.id = sub.id and r.posicion_espera is distinct from sub.rn;

  return query select (v_estado in ('CONFIRMADA', 'ASISTIDA')), v_promo_socio, v_devolver, v_oferta_socio, v_oferta_expira, v_penalizacion_id;
end;
$function$;

revoke all on function public.cancelar_reserva_plaza(text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.cancelar_reserva_plaza(text, text, text, boolean) to service_role, postgres;

create or replace function public.expirar_oferta_lista_espera(p_studio_id text, p_reserva_id text)
 returns table(cancelada boolean, oferta_socio_id text, oferta_expira_en timestamp with time zone, promovida_socio_id text)
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_sesion_id text;
  v_tipo_clase_id text;
  v_plazo int;
  v_oferta_socio text;
  v_oferta_expira timestamptz;
  v_promo_socio text;
begin
  update reservas as r
     set estado = 'CANCELADA', posicion_espera = null, oferta_expira_en = null
   where r.id = p_reserva_id and r.studio_id = p_studio_id and r.estado = 'LISTA_ESPERA'
     and r.oferta_expira_en is not null and r.oferta_expira_en <= now()
  returning r.sesion_id into v_sesion_id;

  if v_sesion_id is null then
    return query select false, null::text, null::timestamptz, null::text;
    return;
  end if;

  -- R-8: defensa en profundidad.
  select tipo_clase_id into v_tipo_clase_id from sesiones where id = v_sesion_id and studio_id = p_studio_id;
  select coalesce(tc.lista_espera_plazo_aceptacion_minutos, st.lista_espera_plazo_aceptacion_minutos)
    into v_plazo
    from studios st
    left join tipos_clase tc on tc.id = v_tipo_clase_id and tc.studio_id = p_studio_id
   where st.id = p_studio_id;

  select pse.promovida_socio_id, pse.oferta_socio_id, pse.oferta_expira_en
    into v_promo_socio, v_oferta_socio, v_oferta_expira
    from public.promocionar_siguiente_espera(p_studio_id, v_sesion_id, v_plazo) as pse;

  update reservas r
     set posicion_espera = sub.rn
    from (
      select id, row_number() over (order by creado_en asc, id asc) as rn
        from reservas
       where sesion_id = v_sesion_id and estado = 'LISTA_ESPERA'
    ) sub
   where r.id = sub.id and r.posicion_espera is distinct from sub.rn;

  return query select true, v_oferta_socio, v_oferta_expira, v_promo_socio;
end;
$function$;

revoke all on function public.expirar_oferta_lista_espera(text, text) from public, anon, authenticated;
grant execute on function public.expirar_oferta_lista_espera(text, text) to service_role, postgres;

create or replace function public.exigir_autorizacion_tipo_clase()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_tipo text;
  v_inicio timestamptz;
  v_requiere boolean;
begin
  if new.estado not in ('CONFIRMADA', 'ASISTIDA', 'PENDIENTE_APROBACION') then
    return new;
  end if;

  -- R-8: defensa en profundidad.
  select s.tipo_clase_id, s.inicio into v_tipo, v_inicio
    from sesiones s where s.id = new.sesion_id and s.studio_id = new.studio_id;

  if v_tipo is null or v_inicio is null or v_inicio <= now() then
    return new;
  end if;

  select tc.requiere_autorizacion into v_requiere
    from tipos_clase tc where tc.id = v_tipo;

  if not coalesce(v_requiere, false) then
    return new;
  end if;

  if not exists (
    select 1 from socio_tipos_clase_autorizados a
     where a.studio_id = new.studio_id
       and a.socio_id = new.socio_id
       and a.tipo_clase_id = v_tipo
  ) then
    raise exception 'NECESITA_AUTORIZACION';
  end if;

  return new;
end;
$function$;

-- R-8: de paso, cierra el EXECUTE que anon/authenticated tenían sin motivo
-- (es una función de trigger pura, nunca pensada para invocarse directo —
-- verificado con grep que nadie la llama vía .rpc(' antes de tocar nada).
revoke all on function public.exigir_autorizacion_tipo_clase() from public, anon, authenticated;
grant execute on function public.exigir_autorizacion_tipo_clase() to service_role, postgres;

create or replace function public.trigger_detectar_penalizacion_no_show()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_importe numeric;
  v_tipo_clase_id text;
begin
  if new.estado = 'NO_ASISTIO' and old.estado is distinct from 'NO_ASISTIO' then
    -- R-8: defensa en profundidad.
    select tipo_clase_id into v_tipo_clase_id from sesiones where id = new.sesion_id and studio_id = new.studio_id;
    select coalesce(tc.penalizacion_importe_eur, st.penalizacion_importe_eur)
      into v_importe
      from studios st
      left join tipos_clase tc on tc.id = v_tipo_clase_id and tc.studio_id = st.id
     where st.id = new.studio_id and coalesce(st.penalizacion_aplica_no_show, true);
    if v_importe is not null and v_importe > 0 and new.socio_id is not null then
      insert into penalizaciones (id, studio_id, socio_id, reserva_id, tipo, importe, estado)
        values ('pen-' || gen_random_uuid()::text, new.studio_id, new.socio_id, new.id, 'NO_SHOW', v_importe, 'DETECTADA')
        on conflict (reserva_id, tipo) do nothing;
    end if;
  elsif old.estado = 'NO_ASISTIO' and new.estado is distinct from 'NO_ASISTIO' then
    update penalizaciones
       set estado = 'OMITIDA_REVERTIDA', procesada_en = now()
     where reserva_id = new.id and tipo = 'NO_SHOW'
       and estado in ('DETECTADA', 'PENDIENTE_APROBACION');
  end if;

  return new;
end;
$function$;

revoke all on function public.trigger_detectar_penalizacion_no_show() from public, anon, authenticated;
grant execute on function public.trigger_detectar_penalizacion_no_show() to service_role, postgres;

create or replace function public.marcar_cancelacion_tardia()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_inicio timestamptz;
  v_tipo_clase_id text;
  v_ventana int;
begin
  if new.estado is distinct from 'CANCELADA' or old.estado is not distinct from 'CANCELADA' then
    return new;
  end if;

  -- R-8: defensa en profundidad.
  select ss.inicio, ss.tipo_clase_id into v_inicio, v_tipo_clase_id
    from sesiones ss where ss.id = new.sesion_id and ss.studio_id = new.studio_id;
  if v_inicio is null then
    return new;
  end if;

  select coalesce(tc.ventana_cancelacion_horas, st.cancelacion_ventana_horas)
    into v_ventana
    from studios st
    left join tipos_clase tc on tc.id = v_tipo_clase_id and tc.studio_id = st.id
   where st.id = new.studio_id;

  new.cancelada_tardia := coalesce(v_ventana, 0) > 0
                          and now() >= v_inicio - make_interval(hours => v_ventana);
  return new;
end;
$function$;

-- R-8: de paso, cierra el EXECUTE que anon/authenticated tenían sin motivo
-- (misma justificación que exigir_autorizacion_tipo_clase, arriba).
revoke all on function public.marcar_cancelacion_tardia() from public, anon, authenticated;
grant execute on function public.marcar_cancelacion_tardia() to service_role, postgres;

create or replace function public.reservar_cita(p_id text, p_studio_id text, p_socio_id text, p_instructor_id text, p_servicio_id text, p_tipo text, p_inicio timestamp with time zone, p_fin timestamp with time zone, p_precio numeric, p_notas text)
 returns text
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_conflict integer;
begin
  perform public.validar_studio_mismatch(p_studio_id);
  perform public.validar_socio_del_studio(p_socio_id, p_studio_id);

  if not exists (select 1 from instructores where id = p_instructor_id and studio_id = p_studio_id) then
    raise exception 'INSTRUCTOR_NO_PERTENECE_AL_STUDIO';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_studio_id || ':' || p_instructor_id));

  select count(*) into v_conflict from public.citas c
  where c.instructor_id = p_instructor_id
    and c.estado in ('PENDIENTE','CONFIRMADA')
    and tstzrange(c.inicio, c.fin) && tstzrange(p_inicio, p_fin);
  if v_conflict > 0 then return 'CONFLICTO'; end if;

  -- R-8: defensa en profundidad.
  select count(*) into v_conflict from public.sesiones s
  where s.instructor_id = p_instructor_id
    and s.studio_id = p_studio_id
    and coalesce(s.cancelada, false) = false
    and tstzrange(s.inicio, s.fin) && tstzrange(p_inicio, p_fin);
  if v_conflict > 0 then return 'CONFLICTO'; end if;

  insert into public.citas
    (id, studio_id, socio_id, instructor_id, servicio_id, tipo, inicio, fin, precio, notas, estado, pagada)
  values
    (p_id, p_studio_id, p_socio_id, p_instructor_id, p_servicio_id, p_tipo, p_inicio, p_fin, p_precio, p_notas, 'CONFIRMADA', false);

  return 'CONFIRMADA';
end;
$function$;

revoke all on function public.reservar_cita(text, text, text, text, text, text, timestamptz, timestamptz, numeric, text) from public, anon, authenticated;
grant execute on function public.reservar_cita(text, text, text, text, text, text, timestamptz, timestamptz, numeric, text) to service_role, postgres;
