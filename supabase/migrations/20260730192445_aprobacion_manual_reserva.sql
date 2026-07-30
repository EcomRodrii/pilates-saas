-- Fase 2a: aprobación manual de reserva (por tipo de clase). Mismo patrón
-- override que Fase 1 (migr 20260730152516): NULL en tipos_clase = hereda el
-- default del estudio.

alter table studios add column if not exists requiere_aprobacion boolean not null default false;
alter table tipos_clase add column if not exists requiere_aprobacion boolean; -- null = hereda

-- reservas.estado NO es un enum nativo, es un CHECK constraint clásico —
-- mismo patrón de ampliación que 0051_dunning_impagos.sql (añadió 'FALLIDO' a
-- recibos.estado).
alter table reservas drop constraint reservas_estado_check;
alter table reservas add constraint reservas_estado_check
  check (estado = any (array['CONFIRMADA','LISTA_ESPERA','ASISTIDA','CANCELADA','NO_ASISTIO','PENDIENTE_APROBACION']));

-- Incluir el nuevo estado en el índice de "reserva activa" (evita que la
-- misma socia duplique la solicitud mientras espera aprobación). El índice de
-- spot NO se toca: una reserva pendiente nunca tiene spot asignado.
drop index if exists uq_reserva_activa_socio_sesion;
create unique index uq_reserva_activa_socio_sesion on public.reservas using btree (sesion_id, socio_id)
  where (estado = any (array['CONFIRMADA','LISTA_ESPERA','ASISTIDA','PENDIENTE_APROBACION']));

-- reservar_plaza: consolida los overloads sueltos (4 args de origen + 5 args
-- de la Fase 1 conviven hoy, nunca se limpió el viejo) en una sola firma con
-- el parámetro nuevo p_requiere_aprobacion. Si se exige aprobación, la
-- reserva entra directa como PENDIENTE_APROBACION sin tocar aforo/lista de
-- espera/límite semanal — todo eso se decide al aprobar, no al pedir.
drop function if exists public.reservar_plaza(text, text, text, text);
drop function if exists public.reservar_plaza(text, text, text, text, boolean);

CREATE OR REPLACE FUNCTION public.reservar_plaza(
  p_studio_id text, p_sesion_id text, p_socio_id text, p_reserva_id text,
  p_permite_lista_espera boolean DEFAULT true,
  p_requiere_aprobacion boolean DEFAULT false
)
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

-- Nueva RPC: aprobar/rechazar una reserva PENDIENTE_APROBACION. Callable por
-- staff con permiso de calendario (panel) o por el sistema (cron de
-- expiración, sin sesión de usuario — auth.uid() es null con service role).
-- Guardia de inicio: la regla de negocio "nadie aprueba una clase que ya
-- empezó" vive AQUÍ, no en el cron que la limpia — así es inmune a cualquier
-- desfase del barrido periódico.
CREATE OR REPLACE FUNCTION public.resolver_reserva_pendiente(
  p_studio_id text, p_reserva_id text, p_aprobar boolean
)
 RETURNS TABLE(estado text, posicion_espera integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
declare
  v_sesion_id text;
  v_socio_id text;
  v_inicio timestamptz;
  v_aforo int;
  v_ocupadas int;
  v_espera int;
  v_estado text;
  v_pos int;
begin
  perform public.validar_studio_mismatch(p_studio_id);

  if auth.uid() is not null and not public.puede_gestionar_calendario() then
    raise exception 'NO_AUTORIZADO';
  end if;

  select sesion_id, socio_id into v_sesion_id, v_socio_id
    from reservas
   where id = p_reserva_id and studio_id = p_studio_id and estado = 'PENDIENTE_APROBACION'
   for update;
  if not found then
    raise exception 'NO_ENCONTRADA_O_YA_RESUELTA';
  end if;

  select inicio into v_inicio from sesiones where id = v_sesion_id for update;

  -- Guardia de inicio: sin importar p_aprobar, una clase ya empezada cancela
  -- en vez de aprobar. El caller detecta este caso comparando lo que pidió
  -- (aprobar=true) contra lo que volvió (CANCELADA) — no hace falta un motivo
  -- explícito aquí, es el único camino por el que aprobar puede cancelar.
  if v_inicio is null or v_inicio <= now() then
    update reservas set estado = 'CANCELADA' where id = p_reserva_id;
    return query select 'CANCELADA'::text, null::int;
    return;
  end if;

  if not p_aprobar then
    update reservas set estado = 'CANCELADA' where id = p_reserva_id;
    return query select 'CANCELADA'::text, null::int;
    return;
  end if;

  v_aforo := aforo_efectivo(v_sesion_id);
  select count(*) into v_ocupadas
    from reservas where sesion_id = v_sesion_id and estado in ('CONFIRMADA', 'ASISTIDA');

  if v_aforo is null or v_ocupadas < v_aforo then
    v_estado := 'CONFIRMADA';
    v_pos := null;
  else
    select count(*) into v_espera
      from reservas where sesion_id = v_sesion_id and estado = 'LISTA_ESPERA';
    v_estado := 'LISTA_ESPERA';
    v_pos := v_espera + 1;
  end if;

  update reservas set estado = v_estado, posicion_espera = v_pos where id = p_reserva_id;
  return query select v_estado, v_pos;
end;
$function$;
