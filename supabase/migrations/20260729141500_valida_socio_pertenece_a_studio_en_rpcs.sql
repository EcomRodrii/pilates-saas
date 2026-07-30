-- Mismo hueco que reservar_plaza (migración anterior), encontrado por
-- patrón: tres RPCs más reciben p_studio_id y p_socio_id como parámetros
-- separados y nunca comprueban que el socio pertenezca de verdad a ese
-- estudio. Probado en directo antes de arreglar:
--   - reservar_cita: ni siquiera tenía el check de STUDIO_MISMATCH — creó
--     una cita sin ningún error con socio_id de otra sede.
--   - ajustar_creditos, crear_recuperacion: mismo hueco que reservar_plaza.
-- cancelar_reserva_plaza NO tiene este problema (valida el socio contra la
-- fila de `reservas` ya existente, no confía ciegamente en p_socio_id) —
-- no se toca.

CREATE OR REPLACE FUNCTION public.ajustar_creditos(p_socio_id text, p_studio_id text, p_delta_saldo integer, p_delta_ganado integer, p_delta_canjeado integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_saldo int;
begin
  -- Aislamiento por negocio en llamadas autenticadas (panel). Las de
  -- service-role (endpoints de servidor) no tienen auth.uid() y se saltan el
  -- check — la identidad ya se validó en la ruta.
  if auth.uid() is not null and p_studio_id is distinct from public.current_studio_id() then
    raise exception 'STUDIO_MISMATCH';
  end if;

  if not exists (select 1 from socios where id = p_socio_id and studio_id = p_studio_id) then
    raise exception 'SOCIO_NO_PERTENECE_AL_STUDIO';
  end if;

  insert into member_credits (socio_id, studio_id, saldo, total_ganado, total_canjeado, actualizado_en)
    values (p_socio_id, p_studio_id, p_delta_saldo, p_delta_ganado, p_delta_canjeado, now())
  on conflict (socio_id) do update set
    saldo = member_credits.saldo + p_delta_saldo,
    total_ganado = member_credits.total_ganado + p_delta_ganado,
    total_canjeado = member_credits.total_canjeado + p_delta_canjeado,
    actualizado_en = now()
  returning saldo into v_saldo;

  if v_saldo < 0 then
    raise exception 'SALDO_INSUFICIENTE';
  end if;

  return v_saldo;
end;
$function$;

CREATE OR REPLACE FUNCTION public.crear_recuperacion(p_id text, p_studio_id text, p_socio_id text, p_origen_reserva_id text, p_motivo text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_tipo text;
  v_dias int;
  v_vivas int;
  v_caduca date;
begin
  if auth.uid() is not null and p_studio_id is distinct from current_studio_id() then
    raise exception 'STUDIO_MISMATCH';
  end if;

  if not exists (select 1 from socios where id = p_socio_id and studio_id = p_studio_id) then
    raise exception 'SOCIO_NO_PERTENECE_AL_STUDIO';
  end if;

  -- Idempotencia por origen: una reserva de origen concreta genera como mucho UNA
  -- recuperación (venga de donde venga la llamada). Evita el farmeo por
  -- re-cancelación repetida de la misma plaza fija (bug ALTA self-service).
  if p_origen_reserva_id is not null and exists (
    select 1 from recuperaciones
     where studio_id = p_studio_id and socio_id = p_socio_id
       and origen_reserva_id = p_origen_reserva_id
  ) then
    return 'YA_EXISTE';
  end if;

  select recuperacion_caducidad_tipo, recuperacion_caducidad_dias into v_tipo, v_dias
    from studios where id = p_studio_id;

  select count(*) into v_vivas
    from recuperaciones
   where socio_id = p_socio_id and studio_id = p_studio_id
     and estado = 'DISPONIBLE' and caduca_el >= current_date;
  if v_vivas >= 4 then
    return 'TOPE';
  end if;

  v_caduca := calcular_caduca_recuperacion(current_date, coalesce(v_tipo, 'FIN_MES_SIGUIENTE'), v_dias);

  insert into recuperaciones (id, studio_id, socio_id, origen_reserva_id, motivo, caduca_el, estado)
    values (p_id, p_studio_id, p_socio_id, p_origen_reserva_id, p_motivo, v_caduca, 'DISPONIBLE');
  return 'CREADA';
end;
$function$;

CREATE OR REPLACE FUNCTION public.reservar_cita(p_id text, p_studio_id text, p_socio_id text, p_instructor_id text, p_servicio_id text, p_tipo text, p_inicio timestamp with time zone, p_fin timestamp with time zone, p_precio numeric, p_notas text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_conflict integer;
BEGIN
  -- reservar_cita no tenía NI el check de STUDIO_MISMATCH ni SECURITY DEFINER
  -- explícito: se añaden aquí, en línea con el resto de RPCs de reservas.
  IF auth.uid() is not null and p_studio_id is distinct from public.current_studio_id() THEN
    RAISE EXCEPTION 'STUDIO_MISMATCH';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM socios WHERE id = p_socio_id AND studio_id = p_studio_id) THEN
    RAISE EXCEPTION 'SOCIO_NO_PERTENECE_AL_STUDIO';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM instructores WHERE id = p_instructor_id AND studio_id = p_studio_id) THEN
    RAISE EXCEPTION 'INSTRUCTOR_NO_PERTENECE_AL_STUDIO';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_studio_id || ':' || p_instructor_id));

  SELECT count(*) INTO v_conflict FROM public.citas c
  WHERE c.instructor_id = p_instructor_id
    AND c.estado IN ('PENDIENTE','CONFIRMADA')
    AND tstzrange(c.inicio, c.fin) && tstzrange(p_inicio, p_fin);
  IF v_conflict > 0 THEN RETURN 'CONFLICTO'; END IF;

  SELECT count(*) INTO v_conflict FROM public.sesiones s
  WHERE s.instructor_id = p_instructor_id
    AND COALESCE(s.cancelada, false) = false
    AND tstzrange(s.inicio, s.fin) && tstzrange(p_inicio, p_fin);
  IF v_conflict > 0 THEN RETURN 'CONFLICTO'; END IF;

  INSERT INTO public.citas
    (id, studio_id, socio_id, instructor_id, servicio_id, tipo, inicio, fin, precio, notas, estado, pagada)
  VALUES
    (p_id, p_studio_id, p_socio_id, p_instructor_id, p_servicio_id, p_tipo, p_inicio, p_fin, p_precio, p_notas, 'CONFIRMADA', false);

  RETURN 'CONFIRMADA';
END;
$function$;
