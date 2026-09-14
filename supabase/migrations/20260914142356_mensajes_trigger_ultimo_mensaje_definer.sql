-- Enviar un mensaje con la sesión del usuario (el panel inserta en `mensajes`
-- con su propio JWT) fallaba con 42501 desde 20260901232656: esa migración dejó
-- a `authenticated` solo `update (mostrador_leido_hasta)` sobre
-- `conversaciones`, y el trigger que sube la conversación al principio de la
-- bandeja era SECURITY INVOKER y actualiza `ultimo_mensaje_en`. El portal no se
-- enteraba porque inserta con service-role.
--
-- Arreglo: el trigger pasa a SECURITY DEFINER, en vez de devolver a
-- `authenticated` el UPDATE de `ultimo_mensaje_en` (eso abriría esa columna a
-- escritura directa para cualquiera que pase la RLS de `conversaciones`). El
-- UPDATE solo toca la conversación del mensaje recién insertado, y ese INSERT
-- ya lo ha validado la policy `mensajes_escritura`.
--
-- Por lo mismo, la hora del mensaje la pone siempre el servidor (`default
-- now()`): con el trigger en DEFINER, un `creado_en` elegido por el cliente
-- llegaría hasta `conversaciones.ultimo_mensaje_en`. Ningún INSERT con sesión
-- la envía. Revocar la columna sola no bastaría: el INSERT de `authenticated`
-- es de tabla entera (ver 20260827103031), así que se revoca la tabla y se
-- concede por columnas.
--
-- Grants: `pg_default_acl` de este proyecto da EXECUTE directo a
-- `authenticated`/`service_role` en toda función nueva de `public`, y `create
-- or replace` conserva el ACL que ya tenía. En una función de trigger EXECUTE
-- no se comprueba al dispararse y no se puede llamar suelta, así que no abre
-- nada, pero se deja en solo service_role para que el catálogo no diga lo
-- contrario.

create or replace function public.actualizar_ultimo_mensaje_conversacion()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  update public.conversaciones
     set ultimo_mensaje_en = new.creado_en
   where id = new.conversacion_id;
  return new;
end;
$function$;

revoke all on function public.actualizar_ultimo_mensaje_conversacion() from public;
revoke all on function public.actualizar_ultimo_mensaje_conversacion() from anon;
revoke all on function public.actualizar_ultimo_mensaje_conversacion() from authenticated;
grant execute on function public.actualizar_ultimo_mensaje_conversacion() to service_role;

revoke insert on table public.mensajes from authenticated;
grant insert (id, conversacion_id, studio_id, remitente_auth_user_id, cuerpo)
  on table public.mensajes to authenticated;
