-- 🟠 Auditoría 21-ago — el cupo SEMANAL contaba clases CANCELADAS.
--
-- `reservar_plaza` cuenta las reservas de la semana para comparar contra
-- `planes_tarifa.limite_semanal`, pero el conteo no mira `sesiones.cancelada`
-- (verificado sobre la definición REAL en producción con pg_get_functiondef,
-- no sobre el fichero de migración: en este proyecto schema_migrations no es
-- fuente de verdad). El propio repo ya lo tenía anotado como pendiente en
-- lib/booking-logic.ts:78-80.
--
-- Efecto: si el estudio cancela una clase, la reserva de esa clase se queda
-- comiendo el cupo de la socia esa semana. Como la limpieza de reservas al
-- cancelar una clase es best-effort en cliente (ver cancelarReservasDeSesiones),
-- basta con que falle una vez para que la socia no pueda reservar en toda la
-- semana y reciba un LIMITE_SEMANAL que no entiende — o peor, gaste una
-- recuperación para saltárselo.
--
-- La defensa que 477dd495 añadió en `contarReservasActivasFuturas` cubre el
-- tope de SIMULTÁNEAS, que se calcula en TypeScript; el cupo semanal se calcula
-- aquí dentro y se quedó fuera.
--
-- El resto del cuerpo se copia sin tocar de la definición vigente en producción
-- (`create or replace`, misma firma y mismo `security definer`): el único cambio
-- es el `and coalesce(ss.cancelada, false) = false` del conteo semanal.
create or replace function public.reservar_plaza(
  p_studio_id text,
  p_sesion_id text,
  p_socio_id text,
  p_reserva_id text,
  p_permite_lista_espera boolean default true,
  p_requiere_aprobacion boolean default false
)
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
         -- ← EL CAMBIO: una clase que el estudio canceló no gasta cupo.
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
    values (p_reserva_id, p_studio_id, p_sesion_id, p_socio_id, v_estado, null, v_pos, null, now());

  return query select v_estado, v_pos;
end;
$function$;
