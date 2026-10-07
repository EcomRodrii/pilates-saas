-- Cuando alguien con una OFERTA viva la acepta y la base de datos la cancela por
-- un motivo SUYO (choca con otra clase suya, su límite semanal, su plan ya no
-- cubre la clase), la plaza queda libre pero nadie la ofrece a la siguiente de
-- la cola: `aceptar_oferta_lista_espera` cancela y renumera, pero no llama a
-- `promocionar_siguiente_espera`. Solo la recogía el cron de ofertas caducadas,
-- que mira ofertas vencidas, no plazas libres.
--
-- Esta función es la misma promoción que ya hace `expirar_oferta_lista_espera`
-- (mismo cálculo del plazo, mismo helper, misma renumeración) pero SIN cancelar
-- nada: la llama el servidor tras esos tres rechazos. No hay otro llamador.
create or replace function public.promocionar_espera_de_sesion(p_studio_id text, p_sesion_id text)
 returns table(oferta_socio_id text, oferta_expira_en timestamp with time zone, promovida_socio_id text)
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_tipo_clase_id text;
  v_plazo int;
  v_oferta_socio text;
  v_oferta_expira timestamptz;
  v_promo_socio text;
begin
  -- Candado de la clase: el mismo que toman reservar, cancelar y aceptar.
  perform 1 from sesiones where id = p_sesion_id and studio_id = p_studio_id for update;
  if not found then
    return query select null::text, null::timestamptz, null::text;
    return;
  end if;

  select tipo_clase_id into v_tipo_clase_id from sesiones where id = p_sesion_id and studio_id = p_studio_id;
  select coalesce(tc.lista_espera_plazo_aceptacion_minutos, st.lista_espera_plazo_aceptacion_minutos)
    into v_plazo
    from studios st
    left join tipos_clase tc on tc.id = v_tipo_clase_id and tc.studio_id = p_studio_id
   where st.id = p_studio_id;

  select pse.promovida_socio_id, pse.oferta_socio_id, pse.oferta_expira_en
    into v_promo_socio, v_oferta_socio, v_oferta_expira
    from public.promocionar_siguiente_espera(p_studio_id, p_sesion_id, v_plazo) as pse;

  perform public.renumerar_lista_espera(p_sesion_id);

  return query select v_oferta_socio, v_oferta_expira, v_promo_socio;
end;
$function$;

-- Una función SECURITY DEFINER nueva nace con EXECUTE directo para anon y
-- authenticated (pg_default_acl), no solo vía PUBLIC: los tres pasos son
-- obligatorios y se comprueba.
revoke execute on function public.promocionar_espera_de_sesion(text, text) from public;
revoke execute on function public.promocionar_espera_de_sesion(text, text) from anon;
revoke execute on function public.promocionar_espera_de_sesion(text, text) from authenticated;
grant execute on function public.promocionar_espera_de_sesion(text, text) to service_role;

do $$
begin
  if has_function_privilege('anon', 'public.promocionar_espera_de_sesion(text,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.promocionar_espera_de_sesion(text,text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.promocionar_espera_de_sesion(text,text)', 'EXECUTE') then
    raise exception 'promocionar_espera_de_sesion: permisos inesperados';
  end if;
end $$;
