-- Foto de un artículo del TPV.
--
-- `avatars_path_autorizado` resuelve el permiso de subida con una cadena de
-- `elsif` por PREFIJO. Sin una rama propia, `producto-<id>` caería en el `else`
-- final —que busca una SOCIA con ese id— y la RLS rechazaría la subida sin
-- decir por qué. Es la misma trampa que ya documenta `subirLogoClase`.
--
-- La rama va antes del `else` y no colisiona con ninguna anterior (comprobado:
-- 'producto-…' no casa con portal-/logo-/clase-/claselogo-/banner-/…).
--
-- ⚠️ La comprobación exige que la FILA YA EXISTA. Por eso el alta sube la foto
-- DESPUÉS de crear el artículo, nunca antes: con un id todavía inexistente
-- esto devuelve false y Storage responde 403.
--
-- Verificado en vivo (execute_sql + ROLLBACK) con la sesión de una propietaria
-- real: su propio artículo → true, el de otro estudio → false, un id que no
-- existe → false, y sin sesión → false.
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
