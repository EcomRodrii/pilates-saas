-- Fase 1 de reglas de reserva/cancelación configurables por tipo de clase.
-- Mismo patrón ya probado en producción que ventana_cancelacion_horas:
-- columna nullable en tipos_clase = override; NULL = hereda el valor del estudio.

-- studios: nuevos defaults a nivel de estudio
alter table studios add column if not exists reserva_ventana_minima_minutos integer not null default 0;
alter table studios add column if not exists reserva_antelacion_maxima_dias integer; -- null = sin límite
alter table studios add column if not exists permite_lista_espera boolean not null default true;

-- tipos_clase: overrides nullable, mismo patrón que ventana_cancelacion_horas
alter table tipos_clase add column if not exists reserva_exigir_plan boolean; -- null = hereda del estudio
alter table tipos_clase add column if not exists reserva_ventana_minima_minutos integer; -- null = hereda
alter table tipos_clase add column if not exists reserva_antelacion_maxima_dias integer; -- null = hereda
alter table tipos_clase add column if not exists permite_lista_espera boolean; -- null = hereda

comment on column tipos_clase.reserva_exigir_plan is 'NULL = hereda studios.reserva_exigir_plan';
comment on column tipos_clase.reserva_ventana_minima_minutos is 'NULL = hereda studios.reserva_ventana_minima_minutos';
comment on column tipos_clase.reserva_antelacion_maxima_dias is 'NULL = hereda studios.reserva_antelacion_maxima_dias';
comment on column tipos_clase.permite_lista_espera is 'NULL = hereda studios.permite_lista_espera';

-- reservar_plaza: añade p_permite_lista_espera (default true, no rompe llamadas
-- existentes). Si la clase está llena y no se permite lista de espera, rechaza
-- en vez de insertar en LISTA_ESPERA. Resto de la función sin cambios.
CREATE OR REPLACE FUNCTION public.reservar_plaza(p_studio_id text, p_sesion_id text, p_socio_id text, p_reserva_id text, p_permite_lista_espera boolean DEFAULT true)
 RETURNS TABLE(estado text, posicion_espera integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    if not p_permite_lista_espera then
      raise exception 'AFORO_LLENO_SIN_ESPERA';
    end if;
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
