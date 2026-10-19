-- La marca del estudio (tema, logo, favicon y portada) la cambia SOLO la
-- propietaria (decisión del fundador, 16-oct-2026), y el tema, solo el servidor.
--
-- 1) `studio_theme`: el navegador solo LEE.
--    Toda escritura del tema ya pasa por el servidor con service_role
--    (lib/theme-data.ts: guardarBorradorTheme, publicarTheme,
--    publicarCamposTheme, aplicarEstiloWebTheme, ponerFaviconSiNoHay), detrás
--    de las rutas /api/theme/*, /api/estudio/widget-estilo y
--    /api/onboarding/configurar, que comprueban rol, plan y contraste y dejan
--    rastro. Ningún cliente escribe la tabla: se quita la política de escritura
--    y el GRANT de escritura a `authenticated`. La lectura (read_studio_theme)
--    y la restrictiva exige_doble_factor no cambian.
--
-- 2) Bucket `avatars`: la escritura de las imágenes de marca, solo PROPIETARIO.
--      favicon-borrador-<studio>, logo-<studio>, bienvenida-<studio> → PROPIETARIO
--      favicon-<studio> (el publicado) → nadie desde el navegador: lo copia
--        publicarTheme() con service_role, que no pasa por RLS.
--    El resto de prefijos no cambia (portal-, banner-, clase-, claselogo- siguen
--    con PROPIETARIO y MANAGER: el Inicio del portal, Contenido y los tipos de
--    clase son trabajo de la gerencia). La LECTURA no cambia.
--    Espejo TS y test de contrato: lib/avatars-escritura.ts(.test.ts). La función
--    se copia ENTERA: los tests leen la última migración que la define.

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
    return coalesce(v_id = v_studio and v_rol = 'PROPIETARIO', false);
  elsif p_name like 'portal-%' then
    return coalesce(
      v_studio is not null
      and starts_with(p_name, 'portal-' || v_studio || '-')
      and v_rol in ('PROPIETARIO', 'MANAGER'), false);
  elsif p_name like 'admin-%' then
    v_id := substring(p_name from length('admin-') + 1);
    return coalesce(v_id = v_studio and v_rol = 'PROPIETARIO', false);
  elsif p_name like 'logo-%' or p_name like 'bienvenida-%' then
    v_id := substring(p_name from position('-' in p_name) + 1);
    return coalesce(v_id = v_studio and v_rol = 'PROPIETARIO', false);
  elsif p_name like 'favicon-%' then
    -- El publicado solo lo escribe el servidor (service_role).
    return false;
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

-- Misma firma: CREATE OR REPLACE conserva los permisos; se reafirman para que
-- el fichero valga igual aplicado desde cero.
revoke execute on function public.avatars_path_escribible(text) from public;
revoke execute on function public.avatars_path_escribible(text) from anon;
grant execute on function public.avatars_path_escribible(text) to authenticated;
grant execute on function public.avatars_path_escribible(text) to service_role;

-- ── studio_theme ────────────────────────────────────────────────────────────
drop policy if exists write_studio_theme on public.studio_theme;
revoke insert, update, delete, truncate, references, trigger on table public.studio_theme from authenticated;
revoke all on table public.studio_theme from anon;
grant select on table public.studio_theme to authenticated;
grant all on table public.studio_theme to service_role;

-- Verificación tras aplicar (esperado: t, f, f, f, f, t, t):
--   select has_table_privilege('authenticated', 'public.studio_theme', 'SELECT'),
--          has_table_privilege('authenticated', 'public.studio_theme', 'INSERT'),
--          has_table_privilege('authenticated', 'public.studio_theme', 'UPDATE'),
--          has_table_privilege('authenticated', 'public.studio_theme', 'DELETE'),
--          has_table_privilege('anon', 'public.studio_theme', 'SELECT'),
--          has_table_privilege('service_role', 'public.studio_theme', 'UPDATE'),
--          has_function_privilege('authenticated', 'public.avatars_path_escribible(text)', 'EXECUTE');
