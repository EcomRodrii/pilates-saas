-- ─────────────────────────────────────────────────────────────────────────────
-- Quien escribe un mensaje ya ha leído hasta su propio mensaje.
--
-- Nadie subía la marca de lectura de quien ENVÍA: el hilo solo marca leído al
-- abrirse, no al mandar. Dos efectos, los dos falsos:
--   · `mensajes_no_leidos_para_digest` (20261004120218) compara
--     `leido_hasta < ultimo_mensaje_en` sin mirar quién escribió el último, así
--     que la alumna que escribe al estudio y no recibe respuesta recibía a las
--     3 h «Tienes 1 conversación con mensajes nuevos por leer» por SU mensaje
--     (y la instructora, igual).
--   · En el hilo con el estudio, el mostrador seguía «sin leer» después de que
--     recepción contestara.
--
-- El trigger ya es SECURITY DEFINER y salta en las tres vías de escritura (panel
-- con su sesión, app de la alumna y app de la instructora con service-role), así
-- que la regla vive aquí una vez:
--   · la fila de quien escribe sube `leido_hasta` hasta su mensaje;
--   · en ALUMNA_MOSTRADOR, si escribe el equipo (no la fila SOCIO del hilo), sube
--     también `mostrador_leido_hasta`, la marca compartida del mostrador.
-- `greatest`: nunca baja una marca que ya iba por delante.
--
-- Sin cambios de esquema ni de RLS. No depende del código: puede aplicarse antes.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.actualizar_ultimo_mensaje_conversacion()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  update public.conversaciones c
     set ultimo_mensaje_en = new.creado_en,
         mostrador_leido_hasta = case
           when c.tipo = 'ALUMNA_MOSTRADOR'
            and new.remitente_auth_user_id is not null
            and not exists (
              select 1 from public.conversacion_participantes cp
               where cp.conversacion_id = c.id
                 and cp.rol_en_conversacion = 'SOCIO'
                 and cp.auth_user_id = new.remitente_auth_user_id)
           then greatest(coalesce(c.mostrador_leido_hasta, '-infinity'::timestamptz), new.creado_en)
           else c.mostrador_leido_hasta
         end
   where c.id = new.conversacion_id;

  update public.conversacion_participantes cp
     set leido_hasta = greatest(cp.leido_hasta, new.creado_en)
   where cp.conversacion_id = new.conversacion_id
     and cp.auth_user_id = new.remitente_auth_user_id;

  return new;
end;
$function$;

-- Mismos permisos que dejó 20260914142356: una función de trigger no se llama
-- suelta, pero el catálogo no debe decir lo contrario. `create or replace`
-- conserva el ACL, y aun así se fija y se comprueba (ver tentare-os.md:
-- `pg_default_acl` da EXECUTE directo a anon/authenticated).
revoke all on function public.actualizar_ultimo_mensaje_conversacion() from public;
revoke all on function public.actualizar_ultimo_mensaje_conversacion() from anon;
revoke all on function public.actualizar_ultimo_mensaje_conversacion() from authenticated;
grant execute on function public.actualizar_ultimo_mensaje_conversacion() to service_role;

do $$
begin
  if has_function_privilege('anon', 'public.actualizar_ultimo_mensaje_conversacion()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.actualizar_ultimo_mensaje_conversacion()', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.actualizar_ultimo_mensaje_conversacion()', 'EXECUTE') then
    raise exception 'actualizar_ultimo_mensaje_conversacion: permisos';
  end if;
end $$;
