-- Auditoría 2026-09-19 · CUARTO defecto del mismo bloque de reservas, que solo
-- aparece una vez desatascados los tres anteriores (20260919120000).
--
-- Con la ambigüedad de firmas resuelta y el `??` corregido, una sonda real
-- contra producción (dentro de una transacción abortada) devolvió:
--
--   ALUMNA    = 42703: column st.requiere_plan does not exist
--   MOSTRADOR = OK (LISTA_ESPERA, 1)
--
-- O sea: el mostrador y el camino de tras-pago ya funcionan, pero la reserva de
-- la propia alumna sigue muriendo en cuanto el estudio exige plan, porque el
-- cuerpo vivo de `reservar_plaza` lee `studios.requiere_plan` y esa columna no
-- existe. La que existe se llama `studios.reserva_exigir_plan`.
--
-- ---------------------------------------------------------------------------
-- Por qué NO me limito a corregir el nombre de la columna
-- ---------------------------------------------------------------------------
-- Ese `select` dentro del lock es redundante Y además está mal como regla de
-- negocio. `p_exigir_entitlement` NO es una pista: es la decisión ya resuelta
-- por el llamante, que aplica la herencia completa
--
--     heredaOverride(tipos_clase.reserva_exigir_plan, studios.reserva_exigir_plan)
--
-- (`lib/db/supabase-data-admin.ts`, `exigirPlanResuelto`). Volver a mirar SOLO
-- la columna del estudio pisa el override por tipo de clase: un estudio que no
-- exige plan en general pero sí en un tipo concreto pasaba el parámetro a
-- `true` y la RPC lo apagaba igualmente mirando el estudio. El gate quedaba
-- otra vez fuera del lock — justo la carrera que RES-4 quería cerrar.
--
-- Así que la función pasa a fiarse del parámetro, que es para lo que está. El
-- resto del cuerpo es idéntico al que corre hoy en producción, carácter a
-- carácter, salvo el bloque marcado y la variable `v_requiere_plan`, que deja
-- de usarse.
-- ---------------------------------------------------------------------------

create or replace function public.reservar_plaza(
  p_studio_id text,
  p_sesion_id text,
  p_socio_id text,
  p_reserva_id text,
  p_permite_lista_espera boolean default true,
  p_requiere_aprobacion boolean default false,
  p_spot_id text default null,
  p_saltar_gate_impago boolean default false,
  p_exigir_entitlement boolean default true
)
returns table(estado text, posicion_espera int)
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

  -- ⚠️ RES-4: el gate de plan/bono va DENTRO del lock, que es lo que impide la
  -- doble reserva sin cobrar. `p_exigir_entitlement` llega ya resuelto por el
  -- llamante con la herencia tipo-de-clase → estudio; aquí NO se vuelve a
  -- mirar `studios` (ver cabecera de esta migración: la versión anterior leía
  -- `studios.requiere_plan`, columna que no existe → 42703, y de paso anulaba
  -- el override por tipo de clase).
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

  return query select v_estado, v_pos;
end;
$function$;

-- `create or replace` sobre la MISMA firma conserva los grants, pero se repiten
-- explícitos: esta función no tiene ningún llamador cliente (los tres del repo
-- son service-role) y ya se coló una vez un `grant ... to authenticated` que
-- deshizo el endurecimiento de RES-6.
revoke execute on function public.reservar_plaza(text, text, text, text, boolean, boolean, text, boolean, boolean) from public, anon, authenticated;
grant execute on function public.reservar_plaza(text, text, text, text, boolean, boolean, text, boolean, boolean) to service_role, postgres;
