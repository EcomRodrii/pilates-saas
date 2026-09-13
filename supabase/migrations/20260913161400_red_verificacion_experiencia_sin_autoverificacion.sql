-- Tentare Network — nadie aprueba la verificación de su propia experiencia.
--
-- La RPC confirmaba la experiencia sin mirar si quien aprobaba (o la dueña del
-- estudio) era la propia titular del perfil. El endpoint de solicitud ya lo
-- rechaza (app/api/network/experiencia/verificar), pero puede haber solicitudes
-- anteriores pendientes, y la cerradura tiene que estar donde se escribe
-- `confirmada`: aquí.
--
-- Misma firma que 20260813135453 → CREATE OR REPLACE conserva el objeto y sus
-- grants; se reafirman igualmente abajo (service_role only).
--
-- Solo se bloquea APROBAR: rechazar una solicitud hecha a tu propio estudio no
-- fabrica nada y deja limpia la cola.
--
-- ⚠️ RETURNS TABLE expone `experiencia_id`, `perfil_auth_user_id`,
-- `perfil_nombre` y `nombre_estudio` como variables: toda columna del cuerpo va
-- calificada con alias (gotcha 42702 de Fase 2b).

create or replace function public.red_resolver_verificacion_experiencia(
  p_verificacion_id text,
  p_studio_id text,
  p_aprobar boolean,
  p_resuelto_por uuid
)
returns table(experiencia_id text, perfil_auth_user_id uuid, perfil_nombre text, nombre_estudio text)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_experiencia_id text;
  v_estado text;
  v_perfil_auth uuid;
  v_owner uuid;
begin
  select rve.experiencia_id, rve.estado into v_experiencia_id, v_estado
    from red_verificaciones_experiencia rve
    where rve.id = p_verificacion_id and rve.studio_id = p_studio_id
    for update;

  if not found then
    raise exception 'VERIFICACION_NO_ENCONTRADA';
  end if;
  if v_estado <> 'pendiente' then
    raise exception 'YA_RESUELTA';
  end if;

  if p_aprobar then
    select rp.auth_user_id into v_perfil_auth
      from red_experiencias re
      join red_perfiles rp on rp.id = re.perfil_id
      where re.id = v_experiencia_id;
    select s.owner_auth_user_id into v_owner
      from studios s
      where s.id = p_studio_id;
    if v_perfil_auth is not null
       and (v_perfil_auth = v_owner or v_perfil_auth = p_resuelto_por) then
      raise exception 'AUTOVERIFICACION';
    end if;
  end if;

  update red_verificaciones_experiencia rve
    set estado = case when p_aprobar then 'confirmada' else 'rechazada' end,
        resuelto_en = now(), resuelto_por = p_resuelto_por
    where rve.id = p_verificacion_id;

  update red_experiencias re
    set estado_verificacion = case when p_aprobar then 'confirmada' else 'rechazada' end
    where re.id = v_experiencia_id;

  return query
    select re.id, rp.auth_user_id, rp.nombre, re.nombre_estudio
    from red_experiencias re
    join red_perfiles rp on rp.id = re.perfil_id
    where re.id = v_experiencia_id;
end;
$function$;

revoke execute on function public.red_resolver_verificacion_experiencia(text, text, boolean, uuid) from public;
revoke execute on function public.red_resolver_verificacion_experiencia(text, text, boolean, uuid) from anon;
revoke execute on function public.red_resolver_verificacion_experiencia(text, text, boolean, uuid) from authenticated;
grant execute on function public.red_resolver_verificacion_experiencia(text, text, boolean, uuid) to service_role;

-- Verificación tras aplicar (esperado: false / false / true):
--   select has_function_privilege('anon', 'public.red_resolver_verificacion_experiencia(text,text,boolean,uuid)', 'EXECUTE'),
--          has_function_privilege('authenticated', 'public.red_resolver_verificacion_experiencia(text,text,boolean,uuid)', 'EXECUTE'),
--          has_function_privilege('service_role', 'public.red_resolver_verificacion_experiencia(text,text,boolean,uuid)', 'EXECUTE');
