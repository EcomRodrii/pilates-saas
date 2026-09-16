-- Portada de un correo del estudio (`plantillas_email.portada_url`, migr
-- 20260916105833). Un prefijo de subida nuevo: `portada-correo-<studio>-<tipo>`.
--
-- ⚠️ Son DOS funciones, no una, y olvidarse de la segunda es el fallo del
-- 11-ago-2026 otra vez: `avatars_path_autorizado` decide la LECTURA y
-- `avatars_path_escribible` la ESCRITURA por rol. Sin rama propia el nombre cae
-- al `else` final —que busca una SOCIA con ese id—, la RLS rechaza la subida y
-- Storage responde «new row violates row-level security policy» sin decir por
-- qué. `lib/storage-politicas.test.ts` y `lib/avatars-escritura.test.ts`
-- comparan las dos contra el código y contra su espejo en TypeScript leyendo la
-- ÚLTIMA migración que las define, así que se copian ENTERAS con su rama nueva.
--
-- Quién ESCRIBE: solo PROPIETARIO. Mismo criterio que la RLS de
-- `plantillas_email` y que `/api/plantillas-email/preview`, que responde 403 a
-- cualquier otro rol — con el cuerpo libre, renderizar un correo con la marca
-- del estudio deja de ser inofensivo.
--
-- Quién LEE: cualquiera del estudio, igual que el resto del bucket. Tiene que
-- poder cargarla el cliente de correo de una alumna.
--
-- La rama va antes del `else` y no colisiona con ninguna anterior: ni 'portal-',
-- ni 'producto-', ni 'logo-'... casan con 'portada-correo-'.

create or replace function public.avatars_path_autorizado(p_name text)
returns boolean
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  v_id text;
begin
  if p_name like 'favicon-borrador-%' then
    v_id := substring(p_name from length('favicon-borrador-') + 1);
    return v_id = public.current_studio_id();
  elsif p_name like 'portal-%' then
    return public.current_studio_id() is not null
       and starts_with(p_name, 'portal-' || public.current_studio_id() || '-');
  elsif p_name like 'logo-%' or p_name like 'favicon-%' or p_name like 'admin-%' or p_name like 'bienvenida-%' then
    v_id := substring(p_name from position('-' in p_name) + 1);
    return v_id = public.current_studio_id();
  elsif p_name like 'instructor-%' then
    v_id := substring(p_name from length('instructor-') + 1);
    return exists (
      select 1 from public.instructores i
      where i.id = v_id
        and (i.studio_id = public.current_studio_id() or i.auth_user_id = auth.uid())
    );
  elsif p_name like 'network-%' then
    v_id := substring(p_name from length('network-') + 1);
    return exists (
      select 1 from public.red_perfiles rp
      where rp.id = v_id and rp.auth_user_id = auth.uid()
    );
  elsif p_name like 'claselogo-%' then
    v_id := substring(p_name from length('claselogo-') + 1);
    return exists (
      select 1 from public.tipos_clase t
      where t.id = v_id and t.studio_id = public.current_studio_id()
    );
  elsif p_name like 'clase-%' then
    v_id := substring(p_name from length('clase-') + 1);
    return exists (
      select 1 from public.tipos_clase t
      where t.id = v_id and t.studio_id = public.current_studio_id()
    );
  elsif p_name like 'banner-%' then
    v_id := substring(p_name from length('banner-') + 1);
    return exists (
      select 1 from public.contenido_portal_banners b
      where b.id::text = v_id and b.studio_id = public.current_studio_id()
    );
  elsif p_name like 'portada-correo-%' then
    return public.current_studio_id() is not null
       and starts_with(p_name, 'portada-correo-' || public.current_studio_id() || '-');
  elsif p_name like 'producto-%' then
    v_id := substring(p_name from length('producto-') + 1);
    return exists (
      select 1 from public.productos_pos p
      where p.id = v_id and p.studio_id = public.current_studio_id()
    );
  else
    return exists (
      select 1 from public.socios so
      where so.id = p_name
        and (so.studio_id = public.current_studio_id() or so.auth_user_id = auth.uid())
    );
  end if;
end;
$function$;

create or replace function public.avatars_path_escribible(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_id text;
  v_studio text := public.current_studio_id();
  v_rol text := public.current_rol();
begin
  if p_name like 'favicon-borrador-%' then
    v_id := substring(p_name from length('favicon-borrador-') + 1);
    return coalesce(v_id = v_studio and v_rol in ('PROPIETARIO', 'MANAGER'), false);
  elsif p_name like 'portal-%' then
    return coalesce(
      v_studio is not null
      and starts_with(p_name, 'portal-' || v_studio || '-')
      and v_rol in ('PROPIETARIO', 'MANAGER'), false);
  elsif p_name like 'admin-%' then
    v_id := substring(p_name from length('admin-') + 1);
    return coalesce(v_id = v_studio and v_rol = 'PROPIETARIO', false);
  elsif p_name like 'logo-%' or p_name like 'favicon-%' or p_name like 'bienvenida-%' then
    v_id := substring(p_name from position('-' in p_name) + 1);
    return coalesce(v_id = v_studio and v_rol in ('PROPIETARIO', 'MANAGER'), false);
  elsif p_name like 'instructor-%' then
    v_id := substring(p_name from length('instructor-') + 1);
    return exists (
      select 1 from public.instructores i
      where i.id = v_id
        and (
          i.auth_user_id = auth.uid()
          or (i.studio_id = v_studio and public.puede_gestionar_ficha_instructor(i.id))
        )
    );
  elsif p_name like 'network-%' then
    v_id := substring(p_name from length('network-') + 1);
    return exists (
      select 1 from public.red_perfiles rp
      where rp.id = v_id and rp.auth_user_id = auth.uid()
    );
  elsif p_name like 'claselogo-%' then
    v_id := substring(p_name from length('claselogo-') + 1);
    return coalesce(v_rol in ('PROPIETARIO', 'MANAGER'), false) and exists (
      select 1 from public.tipos_clase t
      where t.id = v_id and t.studio_id = v_studio
    );
  elsif p_name like 'clase-%' then
    v_id := substring(p_name from length('clase-') + 1);
    return coalesce(v_rol in ('PROPIETARIO', 'MANAGER'), false) and exists (
      select 1 from public.tipos_clase t
      where t.id = v_id and t.studio_id = v_studio
    );
  elsif p_name like 'banner-%' then
    v_id := substring(p_name from length('banner-') + 1);
    return coalesce(v_rol in ('PROPIETARIO', 'MANAGER'), false) and exists (
      select 1 from public.contenido_portal_banners b
      where b.id::text = v_id and b.studio_id = v_studio
    );
  elsif p_name like 'portada-correo-%' then
    return coalesce(
      v_studio is not null
      and starts_with(p_name, 'portada-correo-' || v_studio || '-')
      and v_rol = 'PROPIETARIO', false);
  elsif p_name like 'producto-%' then
    v_id := substring(p_name from length('producto-') + 1);
    return coalesce(public.puede_mover_dinero(), false) and exists (
      select 1 from public.productos_pos p
      where p.id = v_id and p.studio_id = v_studio
    );
  else
    return exists (
      select 1 from public.socios so
      where so.id = p_name
        and (
          so.auth_user_id = auth.uid()
          or (so.studio_id = v_studio and public.puede_gestionar_clientas())
        )
    );
  end if;
end;
$function$;

-- `pg_default_acl` concede EXECUTE DIRECTO a anon/authenticated en TODA función
-- nueva de este proyecto: un `revoke ... from public` no les quita nada, porque
-- el privilegio no lo heredan de ahí. Es la tercera vez que este repo se lo
-- come, y por eso hay un test que exige que cada migración lo diga por escrito.
-- `authenticated` sí lo necesita: la policy de Storage se evalúa con sus
-- privilegios.
revoke execute on function public.avatars_path_autorizado(text) from public;
revoke execute on function public.avatars_path_autorizado(text) from anon;
grant execute on function public.avatars_path_autorizado(text) to authenticated;
grant execute on function public.avatars_path_autorizado(text) to service_role;

revoke execute on function public.avatars_path_escribible(text) from public;
revoke execute on function public.avatars_path_escribible(text) from anon;
grant execute on function public.avatars_path_escribible(text) to authenticated;
grant execute on function public.avatars_path_escribible(text) to service_role;

-- Sin política nueva: las cuatro de `storage.objects` ya llaman a estas dos
-- funciones y no cambian de forma.
--
-- Verificación tras aplicar (esperado: false, true, false, true):
--   select has_function_privilege('anon', 'public.avatars_path_autorizado(text)', 'EXECUTE'),
--          has_function_privilege('authenticated', 'public.avatars_path_autorizado(text)', 'EXECUTE'),
--          has_function_privilege('anon', 'public.avatars_path_escribible(text)', 'EXECUTE'),
--          has_function_privilege('authenticated', 'public.avatars_path_escribible(text)', 'EXECUTE');
