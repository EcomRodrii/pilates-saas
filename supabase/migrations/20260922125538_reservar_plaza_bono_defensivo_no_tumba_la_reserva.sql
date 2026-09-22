-- D-1 fix: un rechazo DEFENSIVO de consumir_bono_interno (SESION_REQUERIDA,
-- SUSCRIPCION_NO_ES_DE_LA_SOCIA, BONO_NO_CUBRE_CLASE -- "no deberian pasar
-- nunca" segun bonoConsumible en TS) no debe tumbar una reserva que ya es
-- valida por lo demas. Detectado por lib/student/cadena-rechazo-reserva.test.ts
-- (salto 0): esos raise exception ahora vivian DENTRO de reservar_plaza (D-1
-- los mueve ahi), y antes de este fix abortaban la transaccion entera --
-- revirtiendo tambien el INSERT de la reserva ya valida. Antes de D-1 esos
-- rechazos vivian en una llamada aparte (consumir_sesion_bono_reserva) que
-- nunca revertia la reserva ya confirmada; este fix conserva ese mismo
-- comportamiento envolviendo la llamada en su propio BEGIN/EXCEPTION (crea
-- un SAVEPOINT implicito: si consumir_bono_interno ya habia decrementado la
-- suscripcion antes de fallar, ese cambio se deshace tambien).
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
  --
  -- Envuelto en su propio BEGIN/EXCEPTION (crea un SAVEPOINT implicito): los
  -- rechazos DEFENSIVOS de consumir_bono_interno (SESION_REQUERIDA,
  -- SUSCRIPCION_NO_ES_DE_LA_SOCIA, BONO_NO_CUBRE_CLASE -- "no deberian pasar
  -- nunca" segun bonoConsumible en TS) NO deben tirar abajo una reserva que
  -- YA es valida por lo demas. Antes de D-1 esos rechazos vivian en una
  -- llamada aparte (consumir_sesion_bono_reserva) que nunca revertia la
  -- reserva ya confirmada; este bloque conserva ese mismo comportamiento.
  if v_estado = 'CONFIRMADA' then
    begin
      select c.resultado, c.saldo_restante, c.suscripcion_consumida_id
        into v_bono_resultado, v_bono_saldo, v_bono_sus_id
        from public.consumir_bono_interno(p_reserva_id, p_suscripcion_id, p_studio_id) c;
    exception when others then
      v_bono_resultado := null;
      v_bono_saldo := null;
      v_bono_sus_id := null;
    end;
  end if;

  return query select v_estado, v_pos, v_bono_resultado, v_bono_saldo, v_bono_sus_id;
end;
$function$;

-- Redundante con la migracion de grants siguiente (20260922130209) -- el
-- contrato de este repo (lib/rgpd-grants-anon-guardias-contrato.test.ts)
-- exige que TODA migracion que redefina una funcion SECURITY DEFINER decida
-- por escrito sobre anon EN LA MISMA migracion, asi que esta redefinicion
-- (la firma no cambia) tambien lo repite -- defensa en profundidad contra el
-- gotcha de grants, verificado y aplicado igual en produccion.
revoke all on function public.reservar_plaza(text, text, text, text, boolean, boolean, text, boolean, boolean, text) from public, anon, authenticated;
grant execute on function public.reservar_plaza(text, text, text, text, boolean, boolean, text, boolean, boolean, text) to service_role, postgres;
