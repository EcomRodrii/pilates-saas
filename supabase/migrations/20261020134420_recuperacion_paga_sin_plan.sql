-- Una recuperación paga la clase aunque la alumna ya no tenga plan (20-oct-2026, fallo visto por el fundador: le quitó
-- el plan a una alumna con 2 recuperaciones y la app le pedía pagar).
--
-- La regla ya decidida («una recuperación es el derecho a recuperar UNA sesión: cubre la clase y levanta el tope semanal,
-- hasta que caduca») solo se cumplía a medias: `evaluar_reserva` rechazaba con `sin-plan` ANTES de mirar si tenía alguna
-- recuperación, así que solo valía para pasar del tope semanal teniendo plan.
--
-- Ahora, sin plan que cubra la clase, una recuperación DISPONIBLE y sin caducar paga una plaza CONFIRMADA (la que caduca
-- antes, el mismo criterio que `intentar_consumir_recuperacion_semanal`, que es quien la gasta en `reservar_plaza`). Lista
-- de espera y reserva pendiente de aprobar siguen siendo `sin-plan`: promocionar (`promocionar_siguiente_espera`) y aprobar
-- (`resolver_reserva_pendiente`) vuelven a exigir el plan y no saben pagar con recuperación, así que dejarla entrar en la
-- cola sería prometerle una plaza que luego se salta.
--
-- Solo cambia `evaluar_reserva`: `reservar_plaza` ya decide con ella y ya consume la recuperación cuando el pagador es
-- `recuperacion`. Misma firma: los permisos no cambian.

create or replace function public.evaluar_reserva(p_studio_id text, p_sesion_id text, p_socio_id text, p_opciones jsonb default '{}'::jsonb)
 returns jsonb
 language plpgsql
 stable
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_permite_espera boolean := coalesce((p_opciones ->> 'permite_lista_espera')::boolean, true);
  v_requiere_aprobacion boolean := coalesce((p_opciones ->> 'requiere_aprobacion')::boolean, false);
  v_spot_id text := nullif(p_opciones ->> 'spot_id', '');
  v_saltar_impago boolean := coalesce((p_opciones ->> 'saltar_gate_impago')::boolean, false);
  v_exigir_entitlement boolean := coalesce((p_opciones ->> 'exigir_entitlement')::boolean, true);
  v_inicio timestamptz;
  v_fin timestamptz;
  v_sala_id text;
  v_instructor_id text;
  v_tipo_clase_id text;
  v_requiere_autorizacion boolean;
  v_bloquea_impago boolean;
  v_ofertas_reservan boolean;
  v_aforo int;
  v_ocupadas int;
  v_espera int;
  v_estado text;
  v_pos int;
  v_spot_sala_id text;
  v_spot_activo boolean;
  v_spot_existe boolean;
  v_spot_ocupado text;
  v_excede_total boolean := false;
  v_excede_tipo boolean := false;
  v_recuperacion text;
  v_paga_recuperacion_sin_plan text;
  v_bono text;
  v_cuota text;
  v_pagador jsonb := jsonb_build_object('origen', 'ninguno');
begin
  if not public.es_llamada_servicio() and p_studio_id is distinct from public.current_studio_id() then
    return jsonb_build_object('puede', false, 'codigo', 'no-autorizado', 'detalle', 'NO_AUTORIZADO');
  end if;
  if not exists (select 1 from public.socios as so where so.id = p_socio_id and so.studio_id = p_studio_id) then
    return jsonb_build_object('puede', false, 'codigo', 'no-autorizado', 'detalle', 'NO_AUTORIZADO');
  end if;

  select ss.inicio, ss.fin, ss.instructor_id, ss.sala_id, ss.tipo_clase_id
    into v_inicio, v_fin, v_instructor_id, v_sala_id, v_tipo_clase_id
    from public.sesiones as ss
   where ss.id = p_sesion_id and ss.studio_id = p_studio_id;
  if not found then
    return jsonb_build_object('puede', false, 'codigo', 'sesion-no-encontrada', 'detalle', 'SESION_NO_ENCONTRADA');
  end if;

  if public.fecha_en_cierre(p_studio_id, (v_inicio at time zone 'Europe/Madrid')::date) then
    return jsonb_build_object('puede', false, 'codigo', 'estudio-cerrado', 'detalle', 'ESTUDIO_CERRADO');
  end if;

  if not v_saltar_impago and public.current_rol() is null then
    select coalesce(st.bloquear_reserva_impago, false) into v_bloquea_impago
      from public.studios as st where st.id = p_studio_id;
    if v_bloquea_impago and public.socio_tiene_impago(p_studio_id, p_socio_id) then
      return jsonb_build_object('puede', false, 'codigo', 'impago', 'detalle', 'RESERVA_BLOQUEADA_IMPAGO');
    end if;
  end if;

  if public.current_rol() = 'INSTRUCTOR' and v_instructor_id is distinct from public.current_instructor_id() then
    return jsonb_build_object('puede', false, 'codigo', 'no-autorizado', 'detalle', 'NO_AUTORIZADO');
  end if;

  if v_tipo_clase_id is not null then
    select tc.requiere_autorizacion into v_requiere_autorizacion
      from public.tipos_clase as tc
     where tc.id = v_tipo_clase_id and tc.studio_id = p_studio_id;
    if coalesce(v_requiere_autorizacion, false) and not exists (
      select 1 from public.socio_tipos_clase_autorizados as a
       where a.socio_id = p_socio_id and a.tipo_clase_id = v_tipo_clase_id and a.studio_id = p_studio_id
    ) then
      return jsonb_build_object('puede', false, 'codigo', 'necesita-autorizacion', 'detalle', 'NECESITA_AUTORIZACION');
    end if;
  end if;

  if v_exigir_entitlement and v_tipo_clase_id is not null then
    if not public.socio_tiene_entitlement_activo(p_studio_id, p_socio_id, v_tipo_clase_id, public.hoy_estudio()) then
      -- Sin plan que la cubra, una recuperación la paga (la que caduca antes, no caducada). Sin ninguna, `sin-plan`.
      select rc.id into v_paga_recuperacion_sin_plan
        from public.recuperaciones as rc
       where rc.socio_id = p_socio_id and rc.studio_id = p_studio_id
         and rc.estado = 'DISPONIBLE' and rc.caduca_el >= public.hoy_estudio()
       order by rc.caduca_el asc
       limit 1;
      if v_paga_recuperacion_sin_plan is null then
        return jsonb_build_object('puede', false, 'codigo', 'sin-plan', 'detalle', 'SIN_ENTITLEMENT');
      end if;
    end if;
  end if;

  if exists (
    select 1 from public.reservas as r
     where r.sesion_id = p_sesion_id and r.socio_id = p_socio_id
       and r.estado in ('CONFIRMADA', 'LISTA_ESPERA', 'ASISTIDA', 'PENDIENTE_APROBACION')
  ) then
    return jsonb_build_object('puede', false, 'codigo', 'ya-reservada', 'detalle', 'YA_RESERVADA');
  end if;

  if v_spot_id is not null then
    select true, sp.sala_id, coalesce(sp.activo, true) into v_spot_existe, v_spot_sala_id, v_spot_activo
      from public.spots as sp
     where sp.id = v_spot_id and sp.studio_id = p_studio_id;
    if v_spot_existe is not true or v_spot_sala_id is distinct from v_sala_id then
      return jsonb_build_object('puede', false, 'codigo', 'spot-no-disponible', 'detalle', 'SPOT_NO_PERTENECE_A_LA_SALA');
    end if;
    if not v_spot_activo then
      return jsonb_build_object('puede', false, 'codigo', 'spot-no-disponible', 'detalle', 'SPOT_NO_DISPONIBLE');
    end if;
    select r.id into v_spot_ocupado
      from public.reservas as r
     where r.sesion_id = p_sesion_id and r.spot_id = v_spot_id and r.estado in ('CONFIRMADA', 'ASISTIDA')
     limit 1;
    if v_spot_ocupado is not null then
      return jsonb_build_object('puede', false, 'codigo', 'spot-ocupado', 'detalle', 'SPOT_OCUPADO');
    end if;
  end if;

  if v_requiere_aprobacion then
    v_estado := 'PENDIENTE_APROBACION';
    v_pos := null;
  else
    v_aforo := public.aforo_efectivo(p_sesion_id);
    select count(*) into v_ocupadas
      from public.reservas as r
     where r.sesion_id = p_sesion_id and r.estado in ('CONFIRMADA', 'ASISTIDA');

    -- Elección del estudio (`lista_espera_reserva_plaza_ofrecida`, de serie NO: como siempre).
    -- Con ella, una plaza que se le ha OFRECIDO a alguien de la lista de espera y sigue dentro
    -- de su plazo cuenta como ocupada para quien llega ahora: no se la lleva quien reserva en
    -- ese momento, y la oferta se puede aceptar. Sin ella, la ofrecida está libre y la primera
    -- persona que reserve la toma.
    select coalesce(st.lista_espera_reserva_plaza_ofrecida, false) into v_ofertas_reservan
      from public.studios as st where st.id = p_studio_id;
    if v_ofertas_reservan then
      v_ocupadas := v_ocupadas + (
        select count(*) from public.reservas as r
         where r.sesion_id = p_sesion_id and r.estado = 'LISTA_ESPERA'
           and r.oferta_expira_en is not null and r.oferta_expira_en > now()
      );
    end if;

    -- Las plazas APARTADAS para una plataforma que vende a mano (ClassPass) no son
    -- de los canales de Tentare hasta que se liberan (`plazas_apartadas`, decisión
    -- del fundador del 7-oct-2026): la clase sale completa o a lista de espera.
    if v_aforo is not null then
      v_ocupadas := v_ocupadas + public.plazas_apartadas(p_sesion_id);
    end if;

    if v_aforo is null or v_ocupadas < v_aforo then
      v_estado := 'CONFIRMADA';
      v_pos := null;
    else
      if not v_permite_espera then
        return jsonb_build_object('puede', false, 'codigo', 'aforo-lleno', 'detalle', 'AFORO_LLENO_SIN_ESPERA');
      end if;
      select count(*) into v_espera
        from public.reservas as r
       where r.sesion_id = p_sesion_id and r.estado = 'LISTA_ESPERA';
      v_estado := 'LISTA_ESPERA';
      v_pos := v_espera + 1;
    end if;
  end if;

  -- La recuperación sin plan paga una PLAZA: en la espera o pendiente de aprobar, promocionar y aprobar volverían a
  -- pedir el plan y la saltarían.
  if v_paga_recuperacion_sin_plan is not null and v_estado <> 'CONFIRMADA' then
    return jsonb_build_object('puede', false, 'codigo', 'sin-plan', 'detalle', 'SIN_ENTITLEMENT');
  end if;

  if v_estado in ('CONFIRMADA', 'PENDIENTE_APROBACION') and v_inicio is not null and v_fin is not null then
    if public.socio_tiene_conflicto_horario(p_studio_id, p_socio_id, p_sesion_id, v_inicio, v_fin) then
      return jsonb_build_object('puede', false, 'codigo', 'conflicto-horario', 'detalle', 'CONFLICTO_HORARIO');
    end if;
  end if;

  if v_estado = 'CONFIRMADA' and v_paga_recuperacion_sin_plan is not null then
    v_pagador := jsonb_build_object('origen', 'recuperacion', 'recuperacion_id', v_paga_recuperacion_sin_plan);
  elsif v_estado = 'CONFIRMADA' then
    select ce.excede_total, ce.excede_tipo into v_excede_total, v_excede_tipo
      from public.calcular_excede_limite_semanal(p_studio_id, p_socio_id, v_tipo_clase_id, v_inicio) as ce;

    if v_excede_total or v_excede_tipo then
      -- Mismo criterio que `intentar_consumir_recuperacion_semanal`: la que caduca antes, y no caducada.
      select rc.id into v_recuperacion
        from public.recuperaciones as rc
       where rc.socio_id = p_socio_id and rc.studio_id = p_studio_id
         and rc.estado = 'DISPONIBLE' and rc.caduca_el >= public.hoy_estudio()
       order by rc.caduca_el asc
       limit 1;
      if v_recuperacion is null then
        return jsonb_build_object(
          'puede', false,
          'codigo', case when v_excede_tipo then 'limite-semanal-actividad' else 'limite-semanal' end,
          'detalle', case when v_excede_tipo then 'LIMITE_SEMANAL_ACTIVIDAD' else 'LIMITE_SEMANAL' end,
          'tope', jsonb_build_object('excede_total', v_excede_total, 'excede_tipo', v_excede_tipo)
        );
      end if;
      v_pagador := jsonb_build_object('origen', 'recuperacion', 'recuperacion_id', v_recuperacion);
    else
      v_bono := public.elegir_bono_consumible(p_studio_id, p_socio_id, v_tipo_clase_id);
      if v_bono is not null then
        v_pagador := jsonb_build_object('origen', 'bono', 'suscripcion_id', v_bono);
      else
        select s.id into v_cuota
          from public.suscripciones as s
          join public.planes_tarifa as p on p.id = s.plan_id and p.studio_id = s.studio_id
         where s.studio_id = p_studio_id and s.socio_id = p_socio_id and s.estado = 'ACTIVA'
           and p.tipo = 'MENSUAL'
           and (s.fecha_fin is null or s.fecha_fin >= public.hoy_estudio())
           and v_tipo_clase_id is not null
           and public.plan_cubre_tipo_clase(p.id, v_tipo_clase_id)
         order by s.id collate "C"
         limit 1;
        if v_cuota is not null then
          v_pagador := jsonb_build_object('origen', 'cuota', 'suscripcion_id', v_cuota);
        end if;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'puede', true,
    'codigo', null,
    'estado', v_estado,
    'posicion_espera', v_pos,
    'pagador', v_pagador,
    'tope', jsonb_build_object('excede_total', v_excede_total, 'excede_tipo', v_excede_tipo)
  );
end;
$function$;
