-- Añade selección de sitio real al flujo "pagar y reservar sin login previo"
-- (checkout embebido → webhook de Stripe → reservarPlazaTrasPagoPublico →
-- reservar_plaza). Hasta ahora la función siempre insertaba spot_id = null.
--
-- p_spot_id se añade AL FINAL de la firma (mismo orden/defaults que ya tenía
-- la Fase 2a, migr 20260730192445) para no romper ningún caller existente
-- que llame con 4/5/6 args posicionales.
--
-- Solo se asigna el spot si el estado resultante es CONFIRMADA — mismo
-- criterio que ya documenta la función: "una reserva pendiente nunca tiene
-- spot asignado" (aplica igual a LISTA_ESPERA y PENDIENTE_APROBACION).
--
-- Candado de spot con el mismo patrón que el resto de la función: SELECT ...
-- FOR UPDATE sobre spots (además del FOR UPDATE ya existente sobre sesiones)
-- para que dos pagos casi simultáneos (dos PaymentIntents confirmándose a la
-- vez) no puedan colarse en el mismo sitio.

drop function if exists public.reservar_plaza(text, text, text, text, boolean, boolean);

CREATE OR REPLACE FUNCTION public.reservar_plaza(
  p_studio_id text, p_sesion_id text, p_socio_id text, p_reserva_id text,
  p_permite_lista_espera boolean DEFAULT true,
  p_requiere_aprobacion boolean DEFAULT false,
  p_spot_id text DEFAULT NULL
)
 RETURNS TABLE(estado text, posicion_espera integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
declare
  v_inicio timestamptz;
  v_sala_id text;
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
  v_spot_sala_id text;
  v_spot_ocupado text;
begin
  perform public.validar_studio_mismatch(p_studio_id);
  perform public.validar_socio_del_studio(p_socio_id, p_studio_id);

  select inicio, instructor_id, sala_id into v_inicio, v_instructor_id, v_sala_id
    from sesiones where id = p_sesion_id and studio_id = p_studio_id
    for update;
  if not found then
    raise exception 'SESION_NO_ENCONTRADA';
  end if;

  if auth.uid() is not null and public.current_rol() = 'INSTRUCTOR' then
    if v_instructor_id is distinct from public.current_instructor_id() then
      raise exception 'NO_AUTORIZADO';
    end if;
  end if;

  if exists (
    select 1 from reservas
    where sesion_id = p_sesion_id and socio_id = p_socio_id
      and estado in ('CONFIRMADA', 'LISTA_ESPERA', 'ASISTIDA', 'PENDIENTE_APROBACION')
  ) then
    raise exception 'YA_RESERVADA';
  end if;

  -- Candado del spot ANTES de decidir estado: mismo criterio que el FOR
  -- UPDATE de sesiones, evita que dos pagos simultáneos elijan el mismo
  -- sitio. Se hace igual si va a terminar en LISTA_ESPERA/PENDIENTE_APROBACION
  -- (el candado no hace daño ahí, solo no se usará luego).
  if p_spot_id is not null then
    select sp.sala_id into v_spot_sala_id
      from spots sp
      where sp.id = p_spot_id and sp.studio_id = p_studio_id
      for update;
    if not found or v_spot_sala_id is distinct from v_sala_id then
      raise exception 'SPOT_NO_PERTENECE_A_LA_SALA';
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
      v_semana_ini := date_trunc('week', v_inicio at time zone 'Europe/Madrid') at time zone 'Europe/Madrid';
      select count(*) into v_semana
        from reservas r
        join sesiones ss on ss.id = r.sesion_id
       where r.socio_id = p_socio_id and r.studio_id = p_studio_id
         and r.estado in ('CONFIRMADA', 'ASISTIDA')
         and coalesce(ss.cancelada, false) = false
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
    values (
      p_reserva_id, p_studio_id, p_sesion_id, p_socio_id, v_estado,
      case when v_estado = 'CONFIRMADA' then p_spot_id else null end,
      v_pos, null, now()
    );

  return query select v_estado, v_pos;
end;
$function$;

-- Gotcha de grants ya pisado varias veces en este repo: CREATE OR REPLACE con
-- firma NUEVA crea un objeto función distinto con EXECUTE por defecto a
-- PUBLIC, sin heredar el REVOKE de la firma anterior.
revoke all on function public.reservar_plaza(text, text, text, text, boolean, boolean, text) from public;
revoke all on function public.reservar_plaza(text, text, text, text, boolean, boolean, text) from anon;
grant execute on function public.reservar_plaza(text, text, text, text, boolean, boolean, text) to authenticated, service_role, postgres;
