-- crear_recuperacion leía el conteo de recuperaciones DISPONIBLE vivas
-- (tope 4) y luego insertaba, sin lock — a diferencia de reservar_plaza (que
-- bloquea la fila de la sesión) o reservar_numero_factura (que usa un
-- advisory lock para la cadena Veri*Factu). Dos llamadas concurrentes para la
-- MISMA socia (p. ej. una baja masiva de plaza fija que genera recuperaciones
-- en bucle, corriendo a la vez que una cancelación manual de recepción)
-- podían leer ambas v_vivas=3 bajo READ COMMITTED antes de que ninguna
-- confirmara, pasar las dos el `< 4`, e insertar las dos — la socia acababa
-- con 5 recuperaciones vivas, saltándose el tope documentado.
--
-- Se serializa con un advisory lock transaccional por (studio_id, socio_id):
-- mismo patrón ya usado en este repo para evitar carreras sin un "padre"
-- natural que bloquear con FOR UPDATE.

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

  if p_origen_reserva_id is not null and exists (
    select 1 from recuperaciones
     where studio_id = p_studio_id and socio_id = p_socio_id
       and origen_reserva_id = p_origen_reserva_id
  ) then
    return 'YA_EXISTE';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_studio_id || ':recuperaciones:' || p_socio_id));

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
