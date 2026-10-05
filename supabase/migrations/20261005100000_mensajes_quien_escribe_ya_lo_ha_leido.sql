-- ─────────────────────────────────────────────────────────────────────────────
-- Quien escribe un mensaje ya ha leído hasta su propio mensaje, y el resumen
-- diario de no leídos dice lo mismo que el punto de la bandeja.
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
-- Sin cambios de esquema ni de RLS. No depende del código: puede aplicarse antes.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. El trigger. Ya es SECURITY DEFINER y salta en las tres vías de escritura
--    (panel con su sesión, app de la alumna y app de la instructora con
--    service-role), así que la regla vive aquí una vez.
--
--    · Quién es la alumna del hilo: la cuenta de su fila SOCIO o, si borró su
--      cuenta y volvió a entrar con otra, la de su ficha (`socios.auth_user_id`):
--      la fila de participante se queda con la cuenta vieja a NULL (FK ON DELETE
--      SET NULL, 20261004120218) y no basta para reconocerla.
--    · El mostrador solo se da por leído si escribe SU EQUIPO: la dueña del
--      estudio o una ficha activa con rol PROPIETARIO, MANAGER o RECEPCION, la
--      misma regla que reparte sus avisos (`mostradorDinamico`,
--      lib/mensajeria/destinatarios.ts). Decidirlo por «no es la fila SOCIO»
--      daba por leído el mensaje de una alumna con la cuenta desvinculada.
--    · `greatest`: nunca baja una marca que ya iba por delante.
create or replace function public.actualizar_ultimo_mensaje_conversacion()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_tipo text;
  v_studio text;
  v_es_alumna boolean := false;
  v_es_mostrador boolean := false;
begin
  select c.tipo, c.studio_id into v_tipo, v_studio
    from public.conversaciones c where c.id = new.conversacion_id;

  if new.remitente_auth_user_id is not null then
    v_es_alumna := exists (
      select 1
        from public.conversacion_participantes cp
        left join public.socios so on so.id = cp.socio_id
       where cp.conversacion_id = new.conversacion_id
         and cp.rol_en_conversacion = 'SOCIO'
         and (cp.auth_user_id = new.remitente_auth_user_id
              or so.auth_user_id = new.remitente_auth_user_id));
    if v_tipo = 'ALUMNA_MOSTRADOR' and not v_es_alumna then
      v_es_mostrador :=
        exists (select 1 from public.studios s
                 where s.id = v_studio and s.owner_auth_user_id = new.remitente_auth_user_id)
        or exists (select 1 from public.instructores i
                    where i.studio_id = v_studio
                      and i.auth_user_id = new.remitente_auth_user_id
                      and i.rol in ('PROPIETARIO', 'MANAGER', 'RECEPCION')
                      and i.activo is true);
    end if;
  end if;

  update public.conversaciones c
     set ultimo_mensaje_en = new.creado_en,
         mostrador_leido_hasta = case
           when v_es_mostrador
           then greatest(coalesce(c.mostrador_leido_hasta, '-infinity'::timestamptz), new.creado_en)
           else c.mostrador_leido_hasta
         end
   where c.id = new.conversacion_id;

  update public.conversacion_participantes cp
     set leido_hasta = greatest(cp.leido_hasta, new.creado_en)
   where cp.conversacion_id = new.conversacion_id
     and (cp.auth_user_id = new.remitente_auth_user_id
          or (v_es_alumna and cp.rol_en_conversacion = 'SOCIO'));

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

-- 2. Relleno de una vez, para que lo ya escrito diga lo mismo que lo nuevo.
--
-- 2a. La fila SOCIO de una alumna que borró su cuenta y volvió a entrar con otra
--     se queda con la cuenta a NULL; se vuelve a vincular con la de su ficha (lo
--     mismo que hace ya `resolverSociaAutenticada` al reclamarla). Sin pisar a
--     nadie: solo filas sin cuenta, y nunca si esa cuenta ya está en el hilo
--     (UNIQUE (conversacion_id, auth_user_id)).
update public.conversacion_participantes cp
   set auth_user_id = so.auth_user_id
  from public.socios so
 where so.id = cp.socio_id
   and cp.rol_en_conversacion = 'SOCIO'
   and cp.auth_user_id is null
   and so.auth_user_id is not null
   and not exists (select 1 from public.conversacion_participantes x
                    where x.conversacion_id = cp.conversacion_id
                      and x.auth_user_id = so.auth_user_id);

-- 2b. Quien escribió el último mensaje de un hilo ya lo ha leído.
update public.conversacion_participantes cp
   set leido_hasta = c.ultimo_mensaje_en
  from public.conversaciones c
  join public.mensajes m on m.conversacion_id = c.id and m.creado_en = c.ultimo_mensaje_en
 where c.id = cp.conversacion_id
   and m.remitente_auth_user_id = cp.auth_user_id
   and cp.leido_hasta < c.ultimo_mensaje_en;

-- 2c. Y el mostrador, si ese último mensaje es de su equipo (misma regla que el
--     trigger: la dueña, o una ficha activa de mostrador, y nunca la alumna).
update public.conversaciones c
   set mostrador_leido_hasta = c.ultimo_mensaje_en
  from public.mensajes m
 where m.conversacion_id = c.id
   and m.creado_en = c.ultimo_mensaje_en
   and c.tipo = 'ALUMNA_MOSTRADOR'
   and (c.mostrador_leido_hasta is null or c.mostrador_leido_hasta < c.ultimo_mensaje_en)
   and m.remitente_auth_user_id is not null
   and not exists (select 1
                     from public.conversacion_participantes cp
                     left join public.socios so on so.id = cp.socio_id
                    where cp.conversacion_id = c.id
                      and cp.rol_en_conversacion = 'SOCIO'
                      and (cp.auth_user_id = m.remitente_auth_user_id
                           or so.auth_user_id = m.remitente_auth_user_id))
   and (exists (select 1 from public.studios s
                 where s.id = c.studio_id and s.owner_auth_user_id = m.remitente_auth_user_id)
        or exists (select 1 from public.instructores i
                    where i.studio_id = c.studio_id
                      and i.auth_user_id = m.remitente_auth_user_id
                      and i.rol in ('PROPIETARIO', 'MANAGER', 'RECEPCION')
                      and i.activo is true));

-- 3. El resumen diario de no leídos.
--    · Un hilo sin mensajes (`ultimo_mensaje_en` nace igual que `creado_en`) no
--      tiene nada que leer: abrir uno y no escribir mandaba «Tienes 1
--      conversación…» cada día a quien estaba en él, y la bandeja no le ponía
--      punto (`tieneSinLeer`, regla «sin mensajes»).
--    · Una fila por cuenta, estudio y LADO (`rol_en_conversacion`): la misma
--      cuenta puede ser alumna en unos hilos e instructora en otros, y cada
--      resumen va a su bandeja con su papel, no con lo que sea su cuenta
--      (lib/mensajeria/digest.ts). `socio_id`, la ficha del lado alumna.
--    · La cuenta de la alumna, también por su ficha (ver 2a).
--    Cambia la forma de lo que devuelve: DROP + CREATE, y los permisos se
--    rehacen enteros (una función nueva nace con EXECUTE para todos).
drop function if exists public.mensajes_no_leidos_para_digest();

create function public.mensajes_no_leidos_para_digest()
 returns table(auth_user_id uuid, studio_id text, studio_slug text, lado text, socio_id text, conversaciones bigint)
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select coalesce(cp.auth_user_id, so.auth_user_id) as auth_user_id,
         c.studio_id,
         s.slug as studio_slug,
         cp.rol_en_conversacion as lado,
         max(cp.socio_id) as socio_id,
         count(*)::bigint as conversaciones
    from conversacion_participantes cp
    join conversaciones c on c.id = cp.conversacion_id
    join studios s on s.id = c.studio_id
    left join socios so on so.id = cp.socio_id and cp.rol_en_conversacion = 'SOCIO'
   where cp.leido_hasta < c.ultimo_mensaje_en
     and c.ultimo_mensaje_en > c.creado_en
     and coalesce(cp.auth_user_id, so.auth_user_id) is not null
   group by coalesce(cp.auth_user_id, so.auth_user_id), c.studio_id, s.slug, cp.rol_en_conversacion;
$function$;

-- Solo la llama el cron del resumen (service_role); nadie del cliente.
revoke all on function public.mensajes_no_leidos_para_digest() from public;
revoke all on function public.mensajes_no_leidos_para_digest() from anon;
revoke all on function public.mensajes_no_leidos_para_digest() from authenticated;
grant execute on function public.mensajes_no_leidos_para_digest() to service_role;

do $$
begin
  if has_function_privilege('anon', 'public.actualizar_ultimo_mensaje_conversacion()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.actualizar_ultimo_mensaje_conversacion()', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.actualizar_ultimo_mensaje_conversacion()', 'EXECUTE') then
    raise exception 'actualizar_ultimo_mensaje_conversacion: permisos';
  end if;
  if has_function_privilege('anon', 'public.mensajes_no_leidos_para_digest()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.mensajes_no_leidos_para_digest()', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.mensajes_no_leidos_para_digest()', 'EXECUTE') then
    raise exception 'mensajes_no_leidos_para_digest: permisos';
  end if;
end $$;
