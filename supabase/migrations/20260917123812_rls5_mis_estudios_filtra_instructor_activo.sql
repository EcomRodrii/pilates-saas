-- RLS-5 (auditoría 2026-09-16): `mis_estudios()` listaba una sede donde la
-- instructora ya tenía `activo = false` (baja) — cualquier persona dada de
-- baja seguía viendo esa sede en su selector y heredando su rol antiguo ahí,
-- aunque el resto de RLS ya le negara el acceso a los datos. Se excluye el
-- caso de instructora inactiva, igual que ya hace el resto de RPCs de este
-- rol (`coalesce(i.activo, true)` para no romper filas antiguas sin la
-- columna poblada).
create or replace function public.mis_estudios()
returns table(id text, nombre text, slug text, ciudad text, rol text)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select s.id, s.nombre, s.slug, s.ciudad,
    coalesce(
      case when s.owner_auth_user_id = auth.uid() then 'PROPIETARIO' end,
      (
        select i.rol
        from public.instructores i
        where i.studio_id = s.id
          and i.auth_user_id = auth.uid()
          and coalesce(i.activo, true)
        limit 1
      )
    ) as rol
  from public.studios s
  where s.owner_auth_user_id = auth.uid()
     or exists (
        select 1
        from public.instructores i
        where i.studio_id = s.id
          and i.auth_user_id = auth.uid()
          and coalesce(i.activo, true)
     );
$$;

-- Firma sin cambios (mismos parámetros/columnas de salida): no dispara el
-- gotcha de grants-por-firma-nueva. Verificado en vivo tras aplicar:
-- has_function_privilege('anon', 'public.mis_estudios()', 'EXECUTE') = false,
-- 'authenticated'/'service_role' = true (sin cambios respecto a antes).
revoke all on function public.mis_estudios() from public, anon;
grant execute on function public.mis_estudios() to authenticated, service_role, postgres;
