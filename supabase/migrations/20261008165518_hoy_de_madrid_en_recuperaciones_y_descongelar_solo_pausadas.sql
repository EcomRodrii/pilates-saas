-- Dos arreglos de integridad de la auditoría del 8-oct.
--
-- 1) EL «HOY» DE UN ESTUDIO ES EL DE MADRID, NO EL DE UTC.
--    La base de datos corre en UTC (ningún rol cambia el huso) y `current_date` es el día UTC. Entre las 00:00 y las 02:00 de
--    Madrid (01:00 en invierno) el día UTC es todavía el de ayer. `crear_recuperacion` calculaba la caducidad con él:
--      · el día 1 de cada mes, a las 00:30 de Madrid, una recuperación `FIN_MES` nacía con `caduca_el` = último día del MES
--        ANTERIOR, es decir, ya caducada, sin que la comprobación `CADUCIDAD_EN_PASADO` la viera (solo mira el parámetro
--        explícito);
--      · con `FIN_MES_SIGUIENTE`, el valor de serie, caducaba un mes antes de lo debido;
--      · con `DIAS`, le faltaba un día.
--    Se añade `hoy_estudio()` como única fuente del «hoy» y se usa aquí. Las demás comparaciones de vigencia que siguen en
--    `current_date` (bonos, cuotas, `evaluar_reserva`…) solo se equivocan en el sentido indulgente durante esas dos horas:
--    quedan para una pasada propia.
--
-- 2) `descongelar_suscripcion` SOLO REANUDA UNA PAUSADA.
--    Su UPDATE no miraba el estado: llamarla con una suscripción CANCELADA o VENCIDA la dejaba ACTIVA sin recalcular su fecha
--    de fin (la reactivación de verdad, `reactivarSuscripcion`, sí la recalcula). La pantalla solo la llama con una PAUSADA,
--    pero la función es ejecutable por quien mueve dinero desde el navegador. Ahora no toca lo que no está pausado y sigue
--    siendo idempotente: reanudar dos veces seguidas (doble clic) devuelve la misma fecha, sin error.

set lock_timeout = '5s';

create or replace function public.hoy_estudio()
 returns date
 language sql
 stable
 set search_path to 'public', 'pg_temp'
as $function$
  select (now() at time zone 'Europe/Madrid')::date
$function$;

comment on function public.hoy_estudio() is
  'El día de hoy en la hora del estudio (Europe/Madrid). current_date es el día UTC: entre las 00:00 y las 02:00 de Madrid es el de ayer.';

create or replace function public.crear_recuperacion(p_id text, p_studio_id text, p_socio_id text, p_origen_reserva_id text, p_motivo text, p_caduca_el date)
 returns text
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_tipo text;
  v_dias int;
  v_max int;
  v_vivas int;
  v_caduca date;
  v_hoy date := public.hoy_estudio();
begin
  perform public.validar_studio_mismatch(p_studio_id);
  perform public.validar_socio_del_studio(p_socio_id, p_studio_id);

  if not public.es_llamada_servicio() and not public.puede_gestionar_clientas() then
    raise exception 'NO_AUTORIZADO';
  end if;

  if p_caduca_el is not null and p_caduca_el < v_hoy then
    raise exception 'CADUCIDAD_EN_PASADO';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_studio_id || ':recuperaciones:' || p_socio_id));

  if p_origen_reserva_id is not null and exists (
    select 1 from recuperaciones
     where studio_id = p_studio_id and socio_id = p_socio_id
       and origen_reserva_id = p_origen_reserva_id
  ) then
    return 'YA_EXISTE';
  end if;

  select recuperacion_caducidad_tipo, recuperacion_caducidad_dias, recuperacion_max_vivas
    into v_tipo, v_dias, v_max
    from studios where id = p_studio_id;

  select count(*) into v_vivas
    from recuperaciones
   where socio_id = p_socio_id and studio_id = p_studio_id
     and estado = 'DISPONIBLE' and caduca_el >= v_hoy;
  if v_vivas >= coalesce(v_max, 4) then
    return 'TOPE';
  end if;

  v_caduca := coalesce(
    p_caduca_el,
    calcular_caduca_recuperacion(v_hoy, coalesce(v_tipo, 'FIN_MES_SIGUIENTE'), v_dias)
  );

  insert into recuperaciones (id, studio_id, socio_id, origen_reserva_id, motivo, caduca_el, estado)
    values (p_id, p_studio_id, p_socio_id, p_origen_reserva_id, p_motivo, v_caduca, 'DISPONIBLE');
  return 'CREADA';
end;
$function$;

create or replace function public.descongelar_suscripcion(p_suscripcion_id text, p_studio_id text)
 returns date
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_dias int;
  v_fin  date;
begin
  perform public.validar_studio_mismatch(p_studio_id);

  if not public.es_llamada_servicio() and not public.puede_mover_dinero() then
    raise exception 'NO_AUTORIZADO';
  end if;

  update congelaciones
     set hasta = public.hoy_estudio(), dias_aplicados = (public.hoy_estudio() - desde)
   where suscripcion_id = p_suscripcion_id and studio_id = p_studio_id and hasta is null
   returning dias_aplicados into v_dias;

  update suscripciones
     set estado = 'ACTIVA',
         fecha_fin = case when fecha_fin is not null and v_dias is not null
                          then fecha_fin + v_dias else fecha_fin end
   where id = p_suscripcion_id and studio_id = p_studio_id and estado = 'PAUSADA'
   returning fecha_fin into v_fin;

  -- Ya estaba activa (doble clic) o no se puede reanudar (cancelada, vencida): no se toca y se devuelve su fecha de fin.
  if not found then
    select fecha_fin into v_fin from suscripciones where id = p_suscripcion_id and studio_id = p_studio_id;
  end if;

  return v_fin;
end;
$function$;

-- Misma firma que las que sustituyen ⇒ los permisos se conservan; se dejan por escrito (la guardia de migraciones lo exige
-- para toda SECURITY DEFINER). `crear_recuperacion` y `descongelar_suscripcion` las llama el panel con la sesión de quien
-- gestiona: siguen ejecutables por `authenticated`, nunca por `anon`.
revoke all on function public.crear_recuperacion(text, text, text, text, text, date) from public, anon;
revoke all on function public.descongelar_suscripcion(text, text) from public, anon;
grant execute on function public.crear_recuperacion(text, text, text, text, text, date) to authenticated, service_role;
grant execute on function public.descongelar_suscripcion(text, text) to authenticated, service_role;

do $$
begin
  if has_function_privilege('anon', 'public.crear_recuperacion(text,text,text,text,text,date)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.crear_recuperacion(text,text,text,text,text,date)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.crear_recuperacion(text,text,text,text,text,date)', 'EXECUTE') then
    raise exception 'crear_recuperacion: permisos inesperados';
  end if;
  if has_function_privilege('anon', 'public.descongelar_suscripcion(text,text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.descongelar_suscripcion(text,text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.descongelar_suscripcion(text,text)', 'EXECUTE') then
    raise exception 'descongelar_suscripcion: permisos inesperados';
  end if;
end $$;
