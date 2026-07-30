-- ─────────────────────────────────────────────────────────────────────────────
-- `reservar_plaza` (20260730102000) es SECURITY DEFINER: su INSERT sobre
-- `reservas` NO pasa por la RLS de la tabla en absoluto (ese es justo el
-- punto de SECURITY DEFINER). La 20260730109000 acotó `reservas_escritura_insert`
-- a `puede_gestionar_calendario()` — pero eso NO protege esta función: sin un
-- guard propio, cualquier instructora autenticada podía llamarla directamente
-- (está `grant`eada a `authenticated` vía `dbReservarPlaza` en el panel) para
-- añadir una clienta a la clase de OTRA instructora, saltándose por completo
-- el botón "Añadir clienta a la clase" que la UI le esconde solo para clases
-- ajenas — el mismo hueco que la 109000 cerró en la tabla, reabierto por esta
-- RPC. Mismo patrón exacto que el guard de `editar_serie_desde` (110000).
--
-- Guard: si quien llama es INSTRUCTOR, la clase debe ser la suya
-- (`sesiones.instructor_id = current_instructor_id()`) — igual que ya podía
-- hacer desde el panel antes de este cambio (añadir una clienta a su propia
-- clase es trabajo legítimo). PROPIETARIO/MANAGER/RECEPCION: sin cambios.
-- `crearReservaPublica` (reserva pública de la socia, vía `admin.rpc(...)`
-- con cliente service-role) no lleva JWT de usuario — `auth.uid()` es NULL y
-- el guard no aplica, igual que en `editar_serie_desde`.
--
-- Reversible: recrear la función como en 20260730102000 (sin el bloque nuevo).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.reservar_plaza(p_studio_id text, p_sesion_id text, p_socio_id text, p_reserva_id text)
 returns table(estado text, posicion_espera integer)
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
#variable_conflict use_column
declare
  v_inicio timestamptz;
  v_instructor_id text;
  v_aforo int;
  v_ocupadas int;
  v_espera int;
  v_estado text;
  v_pos int;
  v_limite int;
  v_semana int;
  v_recup text;
  v_semana_ini timestamptz;
begin
  perform public.validar_studio_mismatch(p_studio_id);
  perform public.validar_socio_del_studio(p_socio_id, p_studio_id);

  select inicio, instructor_id into v_inicio, v_instructor_id
    from sesiones where id = p_sesion_id and studio_id = p_studio_id
    for update;
  if not found then
    raise exception 'SESION_NO_ENCONTRADA';
  end if;

  -- Una instructora solo puede añadir una reserva a SU propia clase — mismo
  -- criterio que sesiones_escritura_update/reservas_escritura_insert (109000).
  if auth.uid() is not null and public.current_rol() = 'INSTRUCTOR' then
    if v_instructor_id is distinct from public.current_instructor_id() then
      raise exception 'NO_AUTORIZADO';
    end if;
  end if;

  v_aforo := aforo_efectivo(p_sesion_id);

  if exists (
    select 1 from reservas
    where sesion_id = p_sesion_id and socio_id = p_socio_id
      and estado in ('CONFIRMADA', 'LISTA_ESPERA', 'ASISTIDA')
  ) then
    raise exception 'YA_RESERVADA';
  end if;

  select count(*) into v_ocupadas
    from reservas
    where sesion_id = p_sesion_id and estado in ('CONFIRMADA', 'ASISTIDA');

  if v_aforo is null or v_ocupadas < v_aforo then
    v_estado := 'CONFIRMADA';
    v_pos := null;
  else
    select count(*) into v_espera
      from reservas where sesion_id = p_sesion_id and estado = 'LISTA_ESPERA';
    v_estado := 'LISTA_ESPERA';
    v_pos := v_espera + 1;
  end if;

  if v_estado = 'CONFIRMADA' then
    select p.limite_semanal into v_limite
      from suscripciones s
      join planes_tarifa p on p.id = s.plan_id
     where s.studio_id = p_studio_id and s.socio_id = p_socio_id and s.estado = 'ACTIVA'
       and p.limite_semanal is not null
       and (s.fecha_fin is null or s.fecha_fin >= current_date)
     order by p.limite_semanal asc
     limit 1;
    if v_limite is not null then
      -- Semana natural española: lunes 00:00 → domingo 24:00 en Europe/Madrid.
      v_semana_ini := date_trunc('week', v_inicio at time zone 'Europe/Madrid') at time zone 'Europe/Madrid';
      select count(*) into v_semana
        from reservas r
        join sesiones ss on ss.id = r.sesion_id
       where r.socio_id = p_socio_id and r.studio_id = p_studio_id
         and r.estado in ('CONFIRMADA', 'ASISTIDA')
         and ss.inicio >= v_semana_ini
         and ss.inicio <  v_semana_ini + interval '7 days';
      if v_semana >= v_limite then
        select id into v_recup
          from recuperaciones
         where socio_id = p_socio_id and studio_id = p_studio_id
           and estado = 'DISPONIBLE' and caduca_el >= current_date
         order by caduca_el asc
         limit 1
         for update;
        if v_recup is null then
          raise exception 'LIMITE_SEMANAL';
        end if;
        update recuperaciones
           set estado = 'USADA', usada_en_reserva_id = p_reserva_id
         where id = v_recup;
      end if;
    end if;
  end if;

  insert into reservas (id, studio_id, sesion_id, socio_id, estado, spot_id, posicion_espera, check_in_en, creado_en)
    values (p_reserva_id, p_studio_id, p_sesion_id, p_socio_id, v_estado, null, v_pos, null, now());

  return query select v_estado, v_pos;
end;
$function$;
