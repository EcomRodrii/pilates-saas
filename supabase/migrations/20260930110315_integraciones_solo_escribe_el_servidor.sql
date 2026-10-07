-- `integraciones` la escribe ya solo el servidor (PUT /api/integrations/config
-- y el alta de WhatsApp por Embedded Signup), que guarda cifrados sus secretos
-- (el token de WhatsApp, las claves API de Kisi y Mailchimp) con una clave que
-- la base de datos no tiene. Hasta ahora la propietaria podía escribir su fila
-- directo desde el navegador (`owner_integraciones`, FOR ALL): un camino que
-- guardaba el secreto en claro.
--
-- La propietaria sigue LEYENDO su fila (el panel necesita qué está conectado y
-- su salud), con la misma condición de antes. Lo que pierde `authenticated` es
-- escribir. Aplicar DESPUÉS de desplegar el código: una pestaña con el panel de
-- antes que intente guardar recibirá un error y bastará con recargar.

drop policy if exists owner_integraciones on public.integraciones;

create policy owner_integraciones_lectura on public.integraciones
  for select to authenticated
  using (public.current_rol() = 'PROPIETARIO' and studio_id = public.current_studio_id());

revoke insert, update, delete on public.integraciones from anon, authenticated;

do $$
begin
  if has_table_privilege('authenticated', 'public.integraciones', 'INSERT')
     or has_table_privilege('authenticated', 'public.integraciones', 'UPDATE')
     or has_table_privilege('authenticated', 'public.integraciones', 'DELETE')
     or not has_table_privilege('authenticated', 'public.integraciones', 'SELECT')
     or not has_table_privilege('service_role', 'public.integraciones', 'UPDATE') then
    raise exception 'integraciones: permisos distintos de lo previsto';
  end if;
end $$;
