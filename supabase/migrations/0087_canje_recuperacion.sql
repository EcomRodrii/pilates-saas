-- F2 · Paso 5b — Canje de recuperación en la reserva (informe B2.3).
--
-- reservar_plaza: cuando una reserva confirmada superaría el límite semanal, en vez
-- de rechazarla se canjea una recuperación VIVA (DISPONIBLE y no caducada), la que
-- caduca antes. Así la recuperación hace exactamente lo que debe: permitir UNA clase
-- por encima del tope semanal para reponer la que se perdió. Sin recuperación → se
-- rechaza igual (LIMITE_SEMANAL). Todo dentro de la transacción de la reserva.
--
-- cancelar_reserva_plaza: si la reserva cancelada había consumido una recuperación,
-- se devuelve a DISPONIBLE (la clase no se llegó a usar).

create or replace function public.reservar_plaza(p_studio_id text, p_sesion_id text, p_socio_id text, p_reserva_id text)
  returns table(estado text, posicion_espera integer)
  language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
#variable_conflict use_column
declare
  v_inicio timestamptz;
  v_aforo int;
  v_ocupadas int;
  v_espera int;
  v_estado text;
  v_pos int;
  v_limite int;
  v_semana int;
  v_recup text;
begin
  if auth.uid() is not null and p_studio_id is distinct from current_studio_id() then
    raise exception 'STUDIO_MISMATCH';
  end if;

  select inicio into v_inicio
    from sesiones where id = p_sesion_id and studio_id = p_studio_id
    for update;
  if not found then
    raise exception 'SESION_NO_ENCONTRADA';
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

  -- F2 (B2.1/B2.3): límite semanal, con canje de recuperación. Solo confirmadas.
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
      select count(*) into v_semana
        from reservas r
        join sesiones ss on ss.id = r.sesion_id
       where r.socio_id = p_socio_id and r.studio_id = p_studio_id
         and r.estado in ('CONFIRMADA', 'ASISTIDA')
         and ss.inicio >= date_trunc('week', v_inicio)
         and ss.inicio <  date_trunc('week', v_inicio) + interval '7 days';
      if v_semana >= v_limite then
        -- ¿tiene una recuperación viva? Cánjéala en vez de rechazar.
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

create or replace function public.cancelar_reserva_plaza(p_studio_id text, p_reserva_id text, p_socio_id text)
  returns table(era_confirmada boolean, promovida_socio_id text)
  language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  v_sesion_id text;
  v_estado text;
  v_res_socio text;
  v_promo_id text;
  v_promo_socio text;
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
  if v_estado = 'CANCELADA' then
    return query select false, null::text;
    return;
  end if;

  perform 1 from sesiones where id = v_sesion_id for update;

  update reservas set estado = 'CANCELADA', posicion_espera = null where id = p_reserva_id;

  -- F2 (B2.3): si esta reserva consumió una recuperación, se devuelve a DISPONIBLE.
  update recuperaciones
     set estado = 'DISPONIBLE', usada_en_reserva_id = null
   where usada_en_reserva_id = p_reserva_id and estado = 'USADA';

  if v_estado in ('CONFIRMADA', 'ASISTIDA') then
    select id, socio_id into v_promo_id, v_promo_socio
      from reservas
      where sesion_id = v_sesion_id and estado = 'LISTA_ESPERA'
      order by posicion_espera asc nulls last
      limit 1 for update;
    if found then
      update reservas set estado = 'CONFIRMADA', posicion_espera = null where id = v_promo_id;
    end if;
  end if;

  return query select (v_estado in ('CONFIRMADA', 'ASISTIDA')), v_promo_socio;
end;
$function$;
