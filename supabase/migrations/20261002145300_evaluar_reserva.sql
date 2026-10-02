-- Motor de derechos, FASE 3b: `evaluar_reserva`, la elegibilidad de una reserva en UN solo sitio, SOLO LECTURA.
--
-- Responde «¿puede esta socia reservar esta clase, en qué estado entraría y quién la paga?» con un jsonb:
--
--   { "puede": bool, "codigo": null | 'ya-reservada' | 'limite-semanal' | …,   -- los códigos de lib/student/reserva-codigos.ts
--     "detalle": null | 'LIMITE_SEMANAL' | 'SIN_ENTITLEMENT' | …,   -- el nombre de la excepción que lanza `reservar_plaza` en ese caso:
--                                                                      -- es lo que el servidor traduce a `codigo`, y lo que permitirá
--                                                                      -- a `reservar_plaza` rechazar con la MISMA decisión
--     "estado": 'CONFIRMADA' | 'LISTA_ESPERA' | 'PENDIENTE_APROBACION' | null,
--     "posicion_espera": int | null,
--     "pagador": { "origen": 'recuperacion' | 'bono' | 'cuota' | 'ninguno', "suscripcion_id"?, "recuperacion_id"? },
--     "tope": { "excede_total": bool, "excede_tipo": bool } }
--
-- ⚠️ EN SOMBRA. Reproduce, en el mismo orden, las comprobaciones de `reservar_plaza` y usa las MISMAS funciones
-- auxiliares (`aforo_efectivo`, `socio_tiene_entitlement_activo`, `calcular_excede_limite_semanal`,
-- `socio_tiene_conflicto_horario`, `elegir_bono_consumible`…), pero NO decide nada: `reservar_plaza` sigue haciendo lo
-- suyo, con sus candados y sus excepciones. Lo que ata las dos es un test de PARIDAD en CI
-- (`supabase/tests/rls-evaluar-reserva-paridad.test.ts`): una batería de escenarios en los que `evaluar_reserva` y
-- `reservar_plaza` tienen que decir lo mismo. Cuando la paridad aguante, `reservar_plaza` pasará a decidir con ella.
--
-- Fuera de alcance A PROPÓSITO (siguen en TypeScript, en `crearReservaPublica`, y son lo siguiente en moverse): clase
-- cancelada o ya empezada, ventanas de antelación, máximo de reservas a la vez y al día, apertura suave, preguntas del
-- estudio. Aquí solo lo que decide la propia RPC.
--
-- No toma ningún candado: es una foto. Un resultado `puede: true` no garantiza la plaza (otra persona puede reservar
-- justo después); la garantía la da `reservar_plaza` dentro de su transacción.
--
-- Solo la llama el servidor (service_role), como `reservar_plaza`. Aditiva: nada la llama todavía.

create or replace function public.evaluar_reserva(
  p_studio_id text, p_sesion_id text, p_socio_id text, p_opciones jsonb default '{}'::jsonb
)
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
    if not public.socio_tiene_entitlement_activo(p_studio_id, p_socio_id, v_tipo_clase_id, current_date) then
      return jsonb_build_object('puede', false, 'codigo', 'sin-plan', 'detalle', 'SIN_ENTITLEMENT');
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

  if v_estado in ('CONFIRMADA', 'PENDIENTE_APROBACION') and v_inicio is not null and v_fin is not null then
    if public.socio_tiene_conflicto_horario(p_studio_id, p_socio_id, p_sesion_id, v_inicio, v_fin) then
      return jsonb_build_object('puede', false, 'codigo', 'conflicto-horario', 'detalle', 'CONFLICTO_HORARIO');
    end if;
  end if;

  if v_estado = 'CONFIRMADA' then
    select ce.excede_total, ce.excede_tipo into v_excede_total, v_excede_tipo
      from public.calcular_excede_limite_semanal(p_studio_id, p_socio_id, v_tipo_clase_id, v_inicio) as ce;

    if v_excede_total or v_excede_tipo then
      -- Mismo criterio que `intentar_consumir_recuperacion_semanal`: la que caduca antes, y no caducada.
      select rc.id into v_recuperacion
        from public.recuperaciones as rc
       where rc.socio_id = p_socio_id and rc.studio_id = p_studio_id
         and rc.estado = 'DISPONIBLE' and rc.caduca_el >= current_date
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
           and (s.fecha_fin is null or s.fecha_fin >= current_date)
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

revoke all on function public.evaluar_reserva(text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.evaluar_reserva(text, text, text, jsonb) to service_role;

comment on function public.evaluar_reserva(text, text, text, jsonb) is
  'Elegibilidad de una reserva en un solo sitio, solo lectura y en sombra: espeja las comprobaciones de reservar_plaza y un test de paridad en CI las ata. Solo service_role.';

do $$
begin
  if has_function_privilege('anon', 'public.evaluar_reserva(text,text,text,jsonb)'::regprocedure, 'EXECUTE')
     or has_function_privilege('authenticated', 'public.evaluar_reserva(text,text,text,jsonb)'::regprocedure, 'EXECUTE') then
    raise exception 'evaluar_reserva es ejecutable por anon/authenticated';
  end if;
  if not has_function_privilege('service_role', 'public.evaluar_reserva(text,text,text,jsonb)'::regprocedure, 'EXECUTE') then
    raise exception 'evaluar_reserva no es ejecutable por service_role';
  end if;
end $$;
