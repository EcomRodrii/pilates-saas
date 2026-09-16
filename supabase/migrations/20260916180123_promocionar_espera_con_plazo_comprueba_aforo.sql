-- Auditoría 2026-09-16 (RES-5): `promocionar_siguiente_espera` solo comprobaba
-- el aforo en la rama de promoción directa (plazo <= 0). La rama "con plazo"
-- (studios/tipos_clase.lista_espera_plazo_aceptacion_minutos > 0) abría la
-- oferta sin mirar el aforo — con dos tipos de clase en producción usando esa
-- regla, una socia podía aceptar a tiempo una oferta y quedarse sin plaza,
-- gastando una recuperación por algo que nunca fue una plaza de verdad.
-- Verificado en vivo con execute_sql+ROLLBACK: antes abría oferta con el aforo
-- lleno; con este cambio no abre en ese caso, y sigue abriendo cuando el hueco
-- es real. Misma firma (3 args) — sin cambio de grants, verificado con
-- has_function_privilege tras aplicar.
create or replace function public.promocionar_siguiente_espera(p_studio_id text, p_sesion_id text, p_plazo_minutos integer)
 returns table(promovida_socio_id text, oferta_socio_id text, oferta_expira_en timestamp with time zone)
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_id text; v_socio text; v_expira timestamptz;
  v_aforo int; v_ocupadas int;
  v_tipo text; v_requiere boolean;
begin
  -- P-4: si el día se cerró después de que la clase se creara, no se
  -- promociona a nadie a esa sesión — mismo criterio que reservar_plaza.
  -- Nótese `s.` en todo el bloque: esta función tiene un `RETURNS TABLE` con
  -- una columna llamada `oferta_expira_en`, el mismo nombre que
  -- `reservas.oferta_expira_en` (gotcha ya documentado en
  -- 20260829234415_lista_espera_spots_y_valoracion.sql) — este `exists` solo
  -- toca `sesiones`, nunca `reservas`, así que no hay ambigüedad posible.
  if not exists (
    select 1 from public.sesiones s
     where s.id = p_sesion_id
       and s.studio_id = p_studio_id
       and coalesce(s.cancelada, false) = false
       and s.inicio > now()
       and not public.fecha_en_cierre(s.studio_id, (s.inicio at time zone 'Europe/Madrid')::date)
  ) then
    return query select null::text, null::text, null::timestamptz;
    return;
  end if;

  select s.tipo_clase_id into v_tipo from public.sesiones s where s.id = p_sesion_id;
  select tc.requiere_autorizacion into v_requiere
    from public.tipos_clase tc where tc.id = v_tipo;

  select r.id, r.socio_id into v_id, v_socio from reservas as r
   where r.sesion_id = p_sesion_id and r.estado = 'LISTA_ESPERA' and r.oferta_expira_en is null
     and (
       not coalesce(v_requiere, false)
       or exists (
         select 1 from socio_tipos_clase_autorizados a
          where a.studio_id = p_studio_id
            and a.socio_id = r.socio_id
            and a.tipo_clase_id = v_tipo
       )
     )
   order by r.creado_en asc, r.id asc limit 1 for update;
  if not found then return query select null::text, null::text, null::timestamptz; return; end if;

  -- RES-5: aforo comprobado ANTES de decidir qué rama tomar, no solo dentro de
  -- una de las dos.
  v_aforo := aforo_efectivo(p_sesion_id);
  select count(*) into v_ocupadas from reservas as r
   where r.sesion_id = p_sesion_id and r.estado in ('CONFIRMADA', 'ASISTIDA');
  if v_aforo is not null and v_ocupadas >= v_aforo then
    return query select null::text, null::text, null::timestamptz;
    return;
  end if;

  if coalesce(p_plazo_minutos,0) <= 0 then
    update reservas set estado='CONFIRMADA', posicion_espera=null, oferta_expira_en=null where id=v_id;
    return query select v_socio, null::text, null::timestamptz;
  else
    v_expira := now() + make_interval(mins => p_plazo_minutos);
    update reservas set oferta_expira_en = v_expira where id=v_id;
    return query select null::text, v_socio, v_expira;
  end if;
end; $function$;
