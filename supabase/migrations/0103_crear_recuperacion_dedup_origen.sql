-- 0103: crear_recuperacion idempotente por reserva de origen.
-- Bug (ALTA, self-service): cancelar_reserva_plaza devuelve sin error también
-- cuando la reserva YA estaba CANCELADA, así que re-llamar a cancelar la misma
-- plaza fija (id res-pf-…) volvía a minar una recuperación cada vez, hasta el tope
-- de 4 → clases gratis. El gate de código (solo crear si era_confirmada) ataca la
-- causa; esta dedup es la defensa en profundidad a nivel de BD: una misma reserva
-- de origen no genera más de una recuperación, venga de donde venga la llamada.
CREATE OR REPLACE FUNCTION public.crear_recuperacion(p_id text, p_studio_id text, p_socio_id text, p_origen_reserva_id text, p_motivo text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_tipo text;
  v_dias int;
  v_vivas int;
  v_caduca date;
begin
  if auth.uid() is not null and p_studio_id is distinct from current_studio_id() then
    raise exception 'STUDIO_MISMATCH';
  end if;

  -- Idempotencia por origen: una reserva de origen concreta genera como mucho UNA
  -- recuperación (viva, usada o caducada — da igual su estado actual). Evita el
  -- farmeo por re-cancelación repetida de la misma plaza fija.
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
