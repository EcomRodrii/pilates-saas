-- Fix: `cancelar_reserva_plaza` y `expirar_oferta_lista_espera` declaran
-- `RETURNS TABLE(..., oferta_socio_id text, oferta_expira_en timestamptz)` —
-- Postgres expone esas columnas como variables PL/pgSQL dentro del cuerpo de
-- la función (gotcha conocido de RETURNS TABLE). Como
-- `promocionar_siguiente_espera` devuelve columnas con ESOS MISMOS NOMBRES,
-- `select promovida_socio_id, oferta_socio_id, oferta_expira_en into ... from
-- promocionar_siguiente_espera(...)` es ambiguo: ¿la variable de salida de la
-- función actual, o la columna de la función llamada? Verificado en vivo con
-- ROLLBACK: `ERROR: 42702: column reference "promovida_socio_id" is
-- ambiguous`. Se arregla calificando la fuente con un alias.
create or replace function public.cancelar_reserva_plaza(p_studio_id text, p_reserva_id text, p_socio_id text)
 returns table(
   era_confirmada boolean,
   promovida_socio_id text,
   devolver_bono boolean,
   oferta_socio_id text,
   oferta_expira_en timestamptz
 )
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_sesion_id text;
  v_estado text;
  v_res_socio text;
  v_instructor_id text;
  v_promo_socio text;
  v_oferta_socio text;
  v_oferta_expira timestamptz;
  v_inicio timestamptz;
  v_tipo_clase_id text;
  v_ventana int;
  v_devolver_tardia boolean;
  v_tardia boolean;
  v_devolver boolean;
  v_plazo_espera int;
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

  if auth.uid() is not null and public.current_rol() = 'INSTRUCTOR' then
    select instructor_id into v_instructor_id from sesiones where id = v_sesion_id;
    if v_instructor_id is distinct from public.current_instructor_id() then
      raise exception 'NO_AUTORIZADO';
    end if;
  end if;

  if v_estado = 'CANCELADA' then
    return query select false, null::text, false, null::text, null::timestamptz;
    return;
  end if;

  perform 1 from sesiones where id = v_sesion_id for update;

  select ss.inicio, ss.tipo_clase_id into v_inicio, v_tipo_clase_id
    from sesiones ss where ss.id = v_sesion_id;
  select coalesce(tc.ventana_cancelacion_horas, st.cancelacion_ventana_horas),
         coalesce(st.cancelacion_devolver_bono_tardia, false),
         coalesce(tc.lista_espera_plazo_aceptacion_minutos, st.lista_espera_plazo_aceptacion_minutos)
    into v_ventana, v_devolver_tardia, v_plazo_espera
    from studios st
    left join tipos_clase tc on tc.id = v_tipo_clase_id and tc.studio_id = p_studio_id
   where st.id = p_studio_id;

  v_tardia := coalesce(v_ventana, 0) > 0
              and now() >= v_inicio - make_interval(hours => v_ventana);
  v_devolver := v_devolver_tardia or not v_tardia;

  update reservas set estado = 'CANCELADA', posicion_espera = null where id = p_reserva_id;

  update recuperaciones
     set estado = 'DISPONIBLE', usada_en_reserva_id = null
   where usada_en_reserva_id = p_reserva_id and estado = 'USADA';

  if v_estado in ('CONFIRMADA', 'ASISTIDA') then
    select pse.promovida_socio_id, pse.oferta_socio_id, pse.oferta_expira_en
      into v_promo_socio, v_oferta_socio, v_oferta_expira
      from public.promocionar_siguiente_espera(p_studio_id, v_sesion_id, v_plazo_espera) as pse;
  end if;

  update reservas r
     set posicion_espera = sub.rn
    from (
      select id, row_number() over (order by creado_en asc, id asc) as rn
        from reservas
       where sesion_id = v_sesion_id and estado = 'LISTA_ESPERA'
    ) sub
   where r.id = sub.id and r.posicion_espera is distinct from sub.rn;

  return query select (v_estado in ('CONFIRMADA', 'ASISTIDA')), v_promo_socio, v_devolver, v_oferta_socio, v_oferta_expira;
end;
$function$;

create or replace function public.expirar_oferta_lista_espera(p_studio_id text, p_reserva_id text)
 returns table(cancelada boolean, oferta_socio_id text, oferta_expira_en timestamptz)
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_sesion_id text;
  v_tipo_clase_id text;
  v_plazo int;
  v_oferta_socio text;
  v_oferta_expira timestamptz;
  v_promo_socio text;
begin
  update reservas as r
     set estado = 'CANCELADA', posicion_espera = null, oferta_expira_en = null
   where r.id = p_reserva_id and r.studio_id = p_studio_id and r.estado = 'LISTA_ESPERA'
     and r.oferta_expira_en is not null and r.oferta_expira_en <= now()
  returning r.sesion_id into v_sesion_id;

  if v_sesion_id is null then
    return query select false, null::text, null::timestamptz;
    return;
  end if;

  select tipo_clase_id into v_tipo_clase_id from sesiones where id = v_sesion_id;
  select coalesce(tc.lista_espera_plazo_aceptacion_minutos, st.lista_espera_plazo_aceptacion_minutos)
    into v_plazo
    from studios st
    left join tipos_clase tc on tc.id = v_tipo_clase_id and tc.studio_id = p_studio_id
   where st.id = p_studio_id;

  select pse.promovida_socio_id, pse.oferta_socio_id, pse.oferta_expira_en
    into v_promo_socio, v_oferta_socio, v_oferta_expira
    from public.promocionar_siguiente_espera(p_studio_id, v_sesion_id, v_plazo) as pse;

  update reservas r
     set posicion_espera = sub.rn
    from (
      select id, row_number() over (order by creado_en asc, id asc) as rn
        from reservas
       where sesion_id = v_sesion_id and estado = 'LISTA_ESPERA'
    ) sub
   where r.id = sub.id and r.posicion_espera is distinct from sub.rn;

  return query select true, v_oferta_socio, v_oferta_expira;
end;
$function$;

-- Mismo gotcha en aceptar_oferta_lista_espera: `returns table(estado text)`
-- crea una variable `estado`, y el SELECT/subquery originales filtraban por
-- `estado = 'LISTA_ESPERA'` sin calificar — ambiguo contra esa variable.
create or replace function public.aceptar_oferta_lista_espera(p_studio_id text, p_reserva_id text, p_socio_id text)
 returns table(estado text)
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_sesion_id text;
  v_res_socio text;
  v_expira timestamptz;
begin
  perform public.validar_studio_mismatch(p_studio_id);

  select r.sesion_id, r.socio_id, r.oferta_expira_en into v_sesion_id, v_res_socio, v_expira
    from reservas as r where r.id = p_reserva_id and r.studio_id = p_studio_id and r.estado = 'LISTA_ESPERA'
    for update;
  if not found then raise exception 'OFERTA_NO_ENCONTRADA'; end if;
  if v_res_socio is distinct from p_socio_id then raise exception 'NO_AUTORIZADO'; end if;
  if v_expira is null then raise exception 'SIN_OFERTA_ACTIVA'; end if;
  if now() > v_expira then raise exception 'OFERTA_CADUCADA'; end if;

  update reservas set estado = 'CONFIRMADA', posicion_espera = null, oferta_expira_en = null
    where id = p_reserva_id;

  update reservas r
     set posicion_espera = sub.rn
    from (
      select rr.id, row_number() over (order by rr.creado_en asc, rr.id asc) as rn
        from reservas as rr
       where rr.sesion_id = v_sesion_id and rr.estado = 'LISTA_ESPERA'
    ) sub
   where r.id = sub.id and r.posicion_espera is distinct from sub.rn;

  return query select 'CONFIRMADA'::text;
end;
$function$;
