-- ─────────────────────────────────────────────────────────────────────────────
-- Dos huecos detectados en revisión (uno propio, uno de una revisión cruzada
-- de otra sesión) sobre el mismo modelo "solo lo suyo" de 20260730109000:
--
-- 1) `cancelar_reserva_plaza` (SECURITY DEFINER, igual que `reservar_plaza`)
--    no tenía guard de rol: cualquier instructora podía cancelar la reserva
--    de un asistente en la clase de OTRA instructora, saltándose el botón
--    "Quitar reserva" (ahora gateado por `gestionaClientas` en la UI, mismo
--    permiso que "Añadir clienta"). Verificado en vivo con ROLLBACK antes de
--    este parche: Julia (instructora) cancelaba una reserva en la clase de
--    María Soler sin ningún error.
-- 2) `reservas_escritura_update` (109000) se dejó abierta a CUALQUIER
--    autenticado del estudio sin comprobar la clase — el razonamiento
--    ("checkin/no-show es trabajo legítimo de cualquier rol de panel") es
--    cierto para PROPIETARIO/MANAGER/RECEPCION, pero para INSTRUCTOR permite
--    exactamente el mismo patrón que motivó todo este PR (tocar la reserva
--    de la clase de otra) por la vía de un PATCH directo a la tabla en vez
--    del botón. Se acota igual que ya se hizo con `sesiones_escritura_update`:
--    INSTRUCTOR solo puede UPDATE reservas de SU PROPIA clase. checkin/
--    no-show/deshacer/liberarSpot/asignarSpot (dbUpdateReserva, cliente
--    autenticado, no RPC) siguen funcionando igual para su propia clase —
--    no hay regresión, solo se cierra el caso ajeno.
--
-- Reversible: recrear `cancelar_reserva_plaza` como en 0000_base (sin el
-- guard) y `reservas_escritura_update` como en 20260730109000.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.cancelar_reserva_plaza(p_studio_id text, p_reserva_id text, p_socio_id text)
 returns table(era_confirmada boolean, promovida_socio_id text, devolver_bono boolean)
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_sesion_id text;
  v_estado text;
  v_res_socio text;
  v_instructor_id text;
  v_promo_id text;
  v_promo_socio text;
  v_inicio timestamptz;
  v_tipo_clase_id text;
  v_ventana int;
  v_devolver_tardia boolean;
  v_tardia boolean;
  v_devolver boolean;
begin
  if auth.uid() is not null and p_studio_id is distinct from current_studio_id() then
    raise exception 'STUDIO_MISMATCH';
  end if;

  select sesion_id, estado, socio_id into v_sesion_id, v_estado, v_res_socio
    from reservas where id = p_reserva_id and studio_id = p_studio_id
    for update;
  if not found then raise exception 'RESERVA_NO_ENCONTRADA'; end if;
  if p_socio_id is not null and v_res_socio is distinct from p_socio_id then
    raise exception 'NO_AUTORIZADO';
  end if;

  -- Una instructora solo puede cancelar reservas de SU propia clase — mismo
  -- criterio que reservar_plaza/sesiones_escritura_update (109000/111000).
  if auth.uid() is not null and public.current_rol() = 'INSTRUCTOR' then
    select instructor_id into v_instructor_id from sesiones where id = v_sesion_id;
    if v_instructor_id is distinct from public.current_instructor_id() then
      raise exception 'NO_AUTORIZADO';
    end if;
  end if;

  if v_estado = 'CANCELADA' then
    return query select false, null::text, false;
    return;
  end if;

  perform 1 from sesiones where id = v_sesion_id for update;

  select ss.inicio, ss.tipo_clase_id into v_inicio, v_tipo_clase_id
    from sesiones ss where ss.id = v_sesion_id;
  select coalesce(tc.ventana_cancelacion_horas, st.cancelacion_ventana_horas),
         coalesce(st.cancelacion_devolver_bono_tardia, false)
    into v_ventana, v_devolver_tardia
    from studios st
    left join tipos_clase tc on tc.id = v_tipo_clase_id and tc.studio_id = p_studio_id
   where st.id = p_studio_id;

  v_tardia := coalesce(v_ventana, 0) > 0
              and now() >= v_inicio - make_interval(hours => v_ventana);
  v_devolver := v_devolver_tardia or not v_tardia;

  update reservas set estado = 'CANCELADA', posicion_espera = null where id = p_reserva_id;

  update recuperaciones
     set estado = 'DISPONIBLE', usada_en_reserva_id = null
   where usada_en_reserva_id = p_reserva_id and estado = 'USADA';

  if v_estado in ('CONFIRMADA', 'ASISTIDA') then
    select id, socio_id into v_promo_id, v_promo_socio
      from reservas
      where sesion_id = v_sesion_id and estado = 'LISTA_ESPERA'
      order by creado_en asc, id asc
      limit 1 for update;
    if found then
      update reservas set estado = 'CONFIRMADA', posicion_espera = null where id = v_promo_id;
    end if;
  end if;

  update reservas r
     set posicion_espera = sub.rn
    from (
      select id, row_number() over (order by creado_en asc, id asc) as rn
        from reservas
       where sesion_id = v_sesion_id and estado = 'LISTA_ESPERA'
    ) sub
   where r.id = sub.id and r.posicion_espera is distinct from sub.rn;

  return query select (v_estado in ('CONFIRMADA', 'ASISTIDA')), v_promo_socio, v_devolver;
end;
$function$;

-- ── reservas_escritura_update: acotar a INSTRUCTOR igual que sesiones ────────
drop policy if exists reservas_escritura_update on public.reservas;

create policy reservas_escritura_update on public.reservas
  for update to authenticated
  using (
    studio_id = public.current_studio_id()
    and (
      public.puede_gestionar_calendario()
      or (
        public.current_rol() = 'INSTRUCTOR'
        and exists (
          select 1 from sesiones s
          where s.id = reservas.sesion_id and s.instructor_id = public.current_instructor_id()
        )
      )
    )
  )
  with check (
    studio_id = public.current_studio_id()
    and (
      public.puede_gestionar_calendario()
      or (
        public.current_rol() = 'INSTRUCTOR'
        and exists (
          select 1 from sesiones s
          where s.id = reservas.sesion_id and s.instructor_id = public.current_instructor_id()
        )
      )
    )
  );
