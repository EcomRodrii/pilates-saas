-- La migración anterior (20260729172500) serializaba el tope de 4 con un
-- advisory lock, pero lo pedía DESPUÉS de comprobar YA_EXISTE (idempotencia
-- por origen_reserva_id) — esa comprobación se quedó igual de expuesta a la
-- carrera que el tope: dos llamadas concurrentes para el MISMO
-- origen_reserva_id podían leer las dos "no existe todavía" antes de que
-- ninguna insertara, y las dos acababan creando su propia recuperación para
-- la misma reserva cancelada (no hay UNIQUE en origen_reserva_id que lo
-- respalde). Se mueve el lock al principio, antes de cualquier lectura.

create or replace function public.crear_recuperacion(p_id text, p_studio_id text, p_socio_id text, p_origen_reserva_id text, p_motivo text)
 returns text
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_tipo text;
  v_dias int;
  v_vivas int;
  v_caduca date;
begin
  if auth.uid() is not null and p_studio_id is distinct from current_studio_id() then
    raise exception 'STUDIO_MISMATCH';
  end if;

  if not exists (select 1 from socios where id = p_socio_id and studio_id = p_studio_id) then
    raise exception 'SOCIO_NO_PERTENECE_AL_STUDIO';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_studio_id || ':recuperaciones:' || p_socio_id));

  if p_origen_reserva_id is not null and exists (
    select 1 from recuperaciones
     where studio_id = p_studio_id and socio_id = p_socio_id
       and origen_reserva_id = p_origen_reserva_id
  ) then
    return 'YA_EXISTE';
  end if;

  select recuperacion_caducidad_tipo, recuperacion_caducidad_dias into v_tipo, v_dias
    from studios where id = p_studio_id;

  select count(*) into v_vivas
    from recuperaciones
   where socio_id = p_socio_id and studio_id = p_studio_id
     and estado = 'DISPONIBLE' and caduca_el >= current_date;
  if v_vivas >= 4 then
    return 'TOPE';
  end if;

  v_caduca := calcular_caduca_recuperacion(current_date, coalesce(v_tipo, 'FIN_MES_SIGUIENTE'), v_dias);

  insert into recuperaciones (id, studio_id, socio_id, origen_reserva_id, motivo, caduca_el, estado)
    values (p_id, p_studio_id, p_socio_id, p_origen_reserva_id, p_motivo, v_caduca, 'DISPONIBLE');
  return 'CREADA';
end;
$function$;
