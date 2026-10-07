-- Tres decisiones que son de CADA estudio (la propietaria las elige), no del código. Las tres nacen con el valor que
-- reproduce el comportamiento de hoy: aplicar esta migración antes que el código, o sin tocar los ajustes, no cambia nada.
--
--   · cancelacion_tardia_devuelve_recuperacion (de serie SÍ)
--       Una reserva pagada con una RECUPERACIÓN que se cancela tarde: ¿vuelve la recuperación a su dueña? Hoy vuelve
--       siempre. Apagado, una cancelación tardía la consume (como ya hace el estudio que no devuelve el bono tardío).
--   · lista_espera_reserva_plaza_ofrecida (de serie NO)
--       Una plaza ofrecida a alguien de la lista de espera, mientras corre su plazo: ¿la puede tomar quien reserva ahora?
--       Hoy sí (la ofrecida cuenta como libre y la oferta puede fallar con AFORO_LLENO). Encendido, la plaza ofrecida
--       cuenta como ocupada para quien llega, que pasa a la lista de espera.
--   · reserva_pendiente_cuenta_para_tope (de serie NO)
--       ¿Una reserva que espera la aprobación del estudio cuenta para el máximo de reservas a la vez? Hoy no. Lo lee el
--       servidor (TypeScript), no hay función de base de datos de por medio.

set lock_timeout = '5s';

alter table public.studios
  add column if not exists cancelacion_tardia_devuelve_recuperacion boolean not null default true,
  add column if not exists lista_espera_reserva_plaza_ofrecida boolean not null default false,
  add column if not exists reserva_pendiente_cuenta_para_tope boolean not null default false;

comment on column public.studios.cancelacion_tardia_devuelve_recuperacion is
  'Si una reserva pagada con una recuperación se cancela tarde, ¿vuelve la recuperación? De serie sí (como siempre).';
comment on column public.studios.lista_espera_reserva_plaza_ofrecida is
  'Una plaza ofrecida a la lista de espera, dentro de su plazo, ¿cuenta como ocupada para quien reserva ahora? De serie no (como siempre).';
comment on column public.studios.reserva_pendiente_cuenta_para_tope is
  'Una reserva pendiente de aprobación, ¿cuenta para el máximo de reservas a la vez? De serie no (como siempre).';

-- La propietaria los guarda desde Configuración con su sesión (RLS `owner_studios` limita la fila): sin el grant de columna
-- el UPDATE da 42501. Los lee el servidor con service-role, así que no hace falta grant de select.
grant update (cancelacion_tardia_devuelve_recuperacion, lista_espera_reserva_plaza_ofrecida, reserva_pendiente_cuenta_para_tope)
  on public.studios to authenticated;

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
  v_devuelve_recuperacion boolean;
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
         coalesce(st.penalizacion_aplica_cancelacion_tardia, true),
         coalesce(st.cancelacion_tardia_devuelve_recuperacion, true)
    into v_ventana, v_devolver_tardia, v_plazo_espera, v_penalizacion_importe, v_penalizacion_aplica, v_devuelve_recuperacion
    from studios st
    left join tipos_clase tc on tc.id = v_tipo_clase_id and tc.studio_id = p_studio_id
   where st.id = p_studio_id;

  v_tardia := coalesce(v_ventana, 0) > 0
              and now() >= v_inicio - make_interval(hours => v_ventana);
  v_devolver := v_devolver_tardia or not v_tardia;

  -- CANCEL-1 (auditoría 25-sep): la devolución del bono vive en TypeScript, DESPUÉS
  -- de este commit. Si el proceso muere en medio, la socia pierde la sesión en
  -- silencio, y no había forma de distinguir «no se devolvió porque la política no
  -- la concede» (cancelación tardía) de «debía devolverse y no se hizo». Aquí, en la
  -- MISMA transacción que cancela, se deja constancia de que la devolución PROCEDE
  -- (política que la concede + reserva que consumió un bono rastreado);
  -- `reparar_devoluciones_bono()` la reintenta si `bono_devuelto_en` sigue vacío.
  update reservas set estado = 'CANCELADA', posicion_espera = null, oferta_expira_en = null,
         bono_devolucion_debida_en = case
           when v_devolver and v_estado in ('CONFIRMADA', 'ASISTIDA')
                and bono_consumo_rastreado is true and bono_suscripcion_id is not null
                and bono_devuelto_en is null
           then now() end
   where id = p_reserva_id;

  -- La recuperación que pagó esta reserva vuelve a su dueña, salvo que el estudio haya
  -- decidido que una cancelación TARDÍA la consume (`cancelacion_tardia_devuelve_recuperacion`,
  -- de serie sí: como siempre).
  update recuperaciones
     set estado = 'DISPONIBLE', usada_en_reserva_id = null
   where usada_en_reserva_id = p_reserva_id and estado = 'USADA'
     and (v_devuelve_recuperacion or not v_tardia);

  -- Sin socia (reserva de una plataforma) no hay a quién penalizar: mismo
  -- criterio que el trigger de no-show. Tampoco si la clase ya empezó: eso es
  -- una corrección, no una cancelación tardía.
  if v_estado in ('CONFIRMADA', 'ASISTIDA') and v_tardia and v_penalizacion_aplica
     and v_inicio > now()
     and not p_omitir_penalizacion
     and v_res_socio is not null
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

  -- PR-13: la cola se numera en UN sitio (antes, una copia del UPDATE aquí).
  perform public.renumerar_lista_espera(v_sesion_id);

  return query select (v_estado in ('CONFIRMADA', 'ASISTIDA')), v_promo_socio, v_devolver, v_oferta_socio, v_oferta_expira, v_penalizacion_id;
end;
$function$;

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


-- Misma firma que las que sustituyen ⇒ los permisos se conservan; se dejan por escrito (la guardia de migraciones lo
-- exige para toda SECURITY DEFINER) y se comprueban: solo service_role.
revoke all on function public.cancelar_reserva_plaza(text, text, text, boolean) from public, anon;
revoke all on function public.evaluar_reserva(text, text, text, jsonb) from public, anon;

do $$
begin
  if has_function_privilege('anon', 'public.cancelar_reserva_plaza(text,text,text,boolean)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.cancelar_reserva_plaza(text,text,text,boolean)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.cancelar_reserva_plaza(text,text,text,boolean)', 'EXECUTE') then
    raise exception 'cancelar_reserva_plaza: permisos inesperados tras CREATE OR REPLACE';
  end if;
  if has_function_privilege('anon', 'public.evaluar_reserva(text,text,text,jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.evaluar_reserva(text,text,text,jsonb)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.evaluar_reserva(text,text,text,jsonb)', 'EXECUTE') then
    raise exception 'evaluar_reserva: permisos inesperados tras CREATE OR REPLACE';
  end if;
end $$;
