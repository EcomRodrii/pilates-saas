-- 0104: lista de espera justa (FIFO por antigüedad) + renumeración densa.
-- Bug: reservar_plaza asignaba posicion_espera = count(LISTA_ESPERA)+1, y
-- cancelar_reserva_plaza promovía por `min(posicion_espera)` SIN renumerar el
-- resto. Tras una promoción (o una cancelación de espera) quedaban huecos: el
-- siguiente en apuntarse recibía un número ya en uso → posiciones DUPLICADAS en
-- el portal y, en la siguiente cancelación, el desempate `order by posicion_espera`
-- era arbitrario, así que un recién llegado podía adelantar a quien esperaba antes.
-- Fix: promover al de mayor antigüedad (creado_en) y renumerar la espera de la
-- sesión de forma densa (1,2,3…) por creado_en tras cada cambio.
CREATE OR REPLACE FUNCTION public.cancelar_reserva_plaza(p_studio_id text, p_reserva_id text, p_socio_id text)
 RETURNS TABLE(era_confirmada boolean, promovida_socio_id text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  update recuperaciones
     set estado = 'DISPONIBLE', usada_en_reserva_id = null
   where usada_en_reserva_id = p_reserva_id and estado = 'USADA';

  if v_estado in ('CONFIRMADA', 'ASISTIDA') then
    -- Promover al que lleva MÁS tiempo esperando (FIFO por creado_en), no por
    -- posicion_espera (corrompible por huecos).
    select id, socio_id into v_promo_id, v_promo_socio
      from reservas
      where sesion_id = v_sesion_id and estado = 'LISTA_ESPERA'
      order by creado_en asc, id asc
      limit 1 for update;
    if found then
      update reservas set estado = 'CONFIRMADA', posicion_espera = null where id = v_promo_id;
    end if;
  end if;

  -- Renumerar la lista de espera restante de forma DENSA y por antigüedad (1,2,3…),
  -- tanto si hubo promoción como si se canceló una reserva de la propia espera.
  update reservas r
     set posicion_espera = sub.rn
    from (
      select id, row_number() over (order by creado_en asc, id asc) as rn
        from reservas
       where sesion_id = v_sesion_id and estado = 'LISTA_ESPERA'
    ) sub
   where r.id = sub.id and r.posicion_espera is distinct from sub.rn;

  return query select (v_estado in ('CONFIRMADA', 'ASISTIDA')), v_promo_socio;
end;
$function$;
