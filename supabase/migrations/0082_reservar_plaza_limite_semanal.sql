-- F2 · Paso 3a — Enforcement del límite semanal en reservar_plaza (B2.1 → activo).
--
-- El dato entró en el Paso 1 (planes_tarifa.limite_semanal) pero no lo aplicaba
-- nadie. Ahora reservar_plaza lo comprueba: si el plan activo de la socia tiene
-- tope semanal y ya lo alcanzó en la semana ISO de la sesión, rechaza con
-- LIMITE_SEMANAL. Sólo aplica a plazas CONFIRMADAS (la lista de espera no cuenta
-- ni consume). Sin tope (null) → no se comprueba (100% compatible).
--
-- Cambio aditivo sobre la versión del Paso 2: se captura `inicio` en el lock de la
-- sesión (para la semana ISO) y se añade el bloque de límite antes del insert.

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
begin
  if auth.uid() is not null and p_studio_id is distinct from current_studio_id() then
    raise exception 'STUDIO_MISMATCH';
  end if;

  -- Lock de fila de la sesión (serializa) + captura de inicio para la semana ISO.
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

  -- F2 (B2.1): límite semanal. Sólo para plazas confirmadas.
  if v_estado = 'CONFIRMADA' then
    select p.limite_semanal into v_limite
      from suscripciones s
      join planes_tarifa p on p.id = s.plan_id
     where s.studio_id = p_studio_id and s.socio_id = p_socio_id and s.estado = 'ACTIVA'
       and p.limite_semanal is not null
       and (s.fecha_fin is null or s.fecha_fin >= current_date)
     order by p.limite_semanal asc   -- el más restrictivo si hubiera varios
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
        raise exception 'LIMITE_SEMANAL';
      end if;
    end if;
  end if;

  insert into reservas (id, studio_id, sesion_id, socio_id, estado, spot_id, posicion_espera, check_in_en, creado_en)
    values (p_reserva_id, p_studio_id, p_sesion_id, p_socio_id, v_estado, null, v_pos, null, now());

  return query select v_estado, v_pos;
end;
$function$;