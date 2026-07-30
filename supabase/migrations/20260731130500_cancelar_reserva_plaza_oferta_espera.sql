-- Fase 2b: cancelar_reserva_plaza deja de promocionar SIEMPRE instantáneo a
-- la primera de la lista de espera — si el tipo de clase/estudio exige un
-- plazo de aceptación (lista_espera_plazo_aceptacion_minutos > 0), en vez de
-- confirmar directamente le abre una oferta con ese plazo (delegado al
-- helper promocionar_siguiente_espera, migr 20260731130000). El resto de la
-- función (guard de rol, ventana de cancelación/devolución de bono,
-- recuperaciones, renumerado denso) queda IDÉNTICO.
--
-- Cambia el RETURNS TABLE (dos columnas nuevas) → Postgres no permite
-- CREATE OR REPLACE con distinto tipo de retorno, hay que DROP + recrear.
-- Eso NO hereda los REVOKE/GRANT existentes (gotcha ya pisado en Fase 2a,
-- migr 20260730192616/20260730192657) — se re-endurece explícitamente al
-- final de este archivo.
drop function if exists public.cancelar_reserva_plaza(text, text, text);

create or replace function public.cancelar_reserva_plaza(p_studio_id text, p_reserva_id text, p_socio_id text)
 returns table(
   era_confirmada boolean,
   promovida_socio_id text,       -- confirmación instantánea (plazo<=0): SIN CAMBIOS
   devolver_bono boolean,
   oferta_socio_id text,          -- NUEVO: se abrió una oferta con plazo (>0)
   oferta_expira_en timestamptz   -- NUEVO
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

  -- Una instructora solo puede cancelar reservas de SU propia clase — mismo
  -- criterio que reservar_plaza/sesiones_escritura_update (109000/111000).
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
    select promovida_socio_id, oferta_socio_id, oferta_expira_en
      into v_promo_socio, v_oferta_socio, v_oferta_expira
      from public.promocionar_siguiente_espera(p_studio_id, v_sesion_id, v_plazo_espera);
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

revoke all on function public.cancelar_reserva_plaza(text, text, text) from public, anon;
grant execute on function public.cancelar_reserva_plaza(text, text, text) to authenticated, service_role;
