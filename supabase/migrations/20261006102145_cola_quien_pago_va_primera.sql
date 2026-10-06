-- ─────────────────────────────────────────────────────────────────────────────
-- PR-13 · Quien pagó una clase y se quedó sin plaza va la PRIMERA en la lista de
-- espera (P06, Fase A del bloque de dinero de la app de la alumna, 6-oct-2026).
--
-- Hasta hoy la cola se ordenaba solo por `creado_en`: la alumna que pagó la clase
-- y se la llenaron mientras pagaba entraba la ÚLTIMA, detrás de quien se apuntó
-- gratis a la espera. `registrar_resultado_pago_clase` (migr 20261006052737) ya
-- anota `pagos_clase.prioridad_espera_desde` cuando ese pago queda COMPENSADA en
-- espera (si pagó ≤ 20 min después de comprobar la plaza); aquí la cola la LEE.
--
-- Orden de la cola, en un solo sitio por función:
--   1. con prioridad (pago COMPENSADA con `prioridad_espera_desde`), por esa hora;
--   2. el resto, como siempre: `creado_en`, y el id para desempatar.
-- `min(...)` y no la columna a secas: si algún día dos filas COMPENSADA apuntaran a
-- la misma reserva, una subconsulta escalar fallaría («more than one row») y
-- tumbaría la cancelación entera. `prioridad_espera_desde is not null` deja usar el
-- índice parcial `pagos_clase_prioridad`.
--
-- Las cuatro funciones que ordenan la cola, con la MISMA firma y los mismos
-- `prosecdef`/`proconfig` que tienen hoy en producción (leídos de pg_proc el
-- 6-oct-2026; cuerpos copiados de `pg_get_functiondef`, no de ficheros viejos):
--   · renumerar_lista_espera        INVOKER  — la que RE-numera la cola entera;
--   · promocionar_siguiente_espera  INVOKER  — a quién le toca el hueco;
--   · cancelar_reserva_plaza        DEFINER  — renumeraba con su propia copia;
--   · expirar_oferta_lista_espera   DEFINER  — ídem.
-- Las dos últimas tenían el UPDATE de renumerar copiado a mano: ahora llaman a
-- `renumerar_lista_espera`, así el orden vive en dos sitios (numerar y elegir) y
-- no en cuatro. Nada más cambia en sus cuerpos.
--
-- ⚠️ Riesgo aceptado (diseño, «riesgos abiertos»): la prioridad se anota DESPUÉS
-- de que `reservar_plaza` meta a la alumna en la cola. Si en ese intervalo se
-- libera una plaza, la promoción elige con el orden de antes y puede subir otra.
-- La app enseña la posición REAL (`posicion_espera` tras renumerar).
--
-- Permisos: ninguna de las cuatro la ejecuta el cliente (medido en producción el
-- 6-oct-2026 con has_function_privilege: authenticated = false en las cuatro; el
-- último llamador de navegador de `cancelar_reserva_plaza` se retiró en
-- 20260902211300). Se reafirma igual: un CREATE OR REPLACE con la misma firma no
-- toca los grants, pero si alguien cambiara la firma nacería abierta.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── renumerar_lista_espera (INVOKER) ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.renumerar_lista_espera(p_sesion_id text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  update reservas r set posicion_espera = sub.rn
    from (select rr.id, row_number() over (
                   order by (select min(pc.prioridad_espera_desde) from public.pagos_clase as pc
                              where pc.reserva_id = rr.id and pc.estado = 'COMPENSADA'
                                and pc.prioridad_espera_desde is not null) asc nulls last,
                            rr.creado_en asc, rr.id asc) as rn
            from reservas as rr where rr.sesion_id = p_sesion_id and rr.estado = 'LISTA_ESPERA') sub
   where r.id = sub.id and r.posicion_espera is distinct from sub.rn;
end; $function$;

-- ── promocionar_siguiente_espera (INVOKER) ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.promocionar_siguiente_espera(p_studio_id text, p_sesion_id text, p_plazo_minutos integer)
 RETURNS TABLE(promovida_socio_id text, oferta_socio_id text, oferta_expira_en timestamp with time zone)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  -- PR-13: el mismo orden que `renumerar_lista_espera` (quien pagó y se quedó sin
  -- plaza, primero; el resto por `creado_en`).
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
     order by (select min(pc.prioridad_espera_desde) from public.pagos_clase as pc
                where pc.reserva_id = r.id and pc.estado = 'COMPENSADA'
                  and pc.prioridad_espera_desde is not null) asc nulls last,
              r.creado_en asc, r.id asc
     for update
  loop
    -- Descuento en la transacción: en la promoción directa, el candado de la
    -- candidata ANTES de sus comprobaciones (solape, plan, límite), como
    -- `reservar_plaza`. La oferta con plazo no confirma nada: no lo necesita.
    if coalesce(p_plazo_minutos, 0) <= 0 then
      perform pg_advisory_xact_lock(hashtext(p_studio_id || ':' || v_cand.socio_id));
    end if;

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

      -- Descuento en la transacción, como `reservar_plaza`.
      begin
        perform public.consumir_bono_interno(
          v_cand.id, public.elegir_bono_consumible(p_studio_id, v_cand.socio_id, v_tipo), p_studio_id);
      exception when raise_exception then
        null;
      end;

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

-- ── cancelar_reserva_plaza (DEFINER) ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cancelar_reserva_plaza(p_studio_id text, p_reserva_id text, p_socio_id text, p_omitir_penalizacion boolean DEFAULT false)
 RETURNS TABLE(era_confirmada boolean, promovida_socio_id text, devolver_bono boolean, oferta_socio_id text, oferta_expira_en timestamp with time zone, penalizacion_id text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  update recuperaciones
     set estado = 'DISPONIBLE', usada_en_reserva_id = null
   where usada_en_reserva_id = p_reserva_id and estado = 'USADA';

  -- Sin socia (reserva de una plataforma) no hay a quién penalizar: mismo
  -- criterio que el trigger de no-show.
  if v_estado in ('CONFIRMADA', 'ASISTIDA') and v_tardia and v_penalizacion_aplica
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

-- ── expirar_oferta_lista_espera (DEFINER) ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.expirar_oferta_lista_espera(p_studio_id text, p_reserva_id text)
 RETURNS TABLE(cancelada boolean, oferta_socio_id text, oferta_expira_en timestamp with time zone, promovida_socio_id text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  -- PR-13: la cola se numera en UN sitio (antes, una copia del UPDATE aquí).
  perform public.renumerar_lista_espera(v_sesion_id);

  return query select true, v_oferta_socio, v_oferta_expira, v_promo_socio;
end;
$function$;

-- ── Permisos: solo el servidor ───────────────────────────────────────────────
revoke all on function public.renumerar_lista_espera(text) from public, anon, authenticated;
grant execute on function public.renumerar_lista_espera(text) to service_role, postgres;
revoke all on function public.promocionar_siguiente_espera(text, text, integer) from public, anon, authenticated;
grant execute on function public.promocionar_siguiente_espera(text, text, integer) to service_role, postgres;
revoke all on function public.cancelar_reserva_plaza(text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.cancelar_reserva_plaza(text, text, text, boolean) to service_role, postgres;
revoke all on function public.expirar_oferta_lista_espera(text, text) from public, anon, authenticated;
grant execute on function public.expirar_oferta_lista_espera(text, text) to service_role, postgres;

-- ── Verificación: permisos y el tipo de seguridad de siempre ─────────────────
do $$
declare
  v_fn text;
  v_definer boolean;
begin
  for v_fn, v_definer in values
    ('public.renumerar_lista_espera(text)', false),
    ('public.promocionar_siguiente_espera(text,text,integer)', false),
    ('public.cancelar_reserva_plaza(text,text,text,boolean)', true),
    ('public.expirar_oferta_lista_espera(text,text)', true)
  loop
    if has_function_privilege('anon', v_fn, 'EXECUTE')
       or has_function_privilege('authenticated', v_fn, 'EXECUTE')
       or not has_function_privilege('service_role', v_fn, 'EXECUTE') then
      raise exception '%: permisos distintos de lo previsto', v_fn;
    end if;
    if (select p.prosecdef from pg_proc p where p.oid = v_fn::regprocedure) is distinct from v_definer then
      raise exception '%: prosecdef distinto del de producción', v_fn;
    end if;
    if (select p.proconfig from pg_proc p where p.oid = v_fn::regprocedure) is distinct from array['search_path=public, pg_temp'] then
      raise exception '%: search_path distinto del de producción', v_fn;
    end if;
  end loop;
end $$;
