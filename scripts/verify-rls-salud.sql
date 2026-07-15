-- ═══════════════════════════════════════════════════════════════════════════
-- Verificación C1/C2 — RLS de datos de salud + revocación anon (GDPR Art. 9)
-- ═══════════════════════════════════════════════════════════════════════════
-- Ejecutar en el SQL editor de Supabase (prod, proyecto dwqvdycjcffqwfkzapvi),
-- ANTES y DESPUÉS de aplicar las migraciones 0029/0030. Solo lectura: no cambia
-- nada. El objetivo es un "estado deseado" claro en cada bloque.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) RLS ACTIVO en las dos tablas de salud. Deseado: rls_activo = true en ambas.
select c.relname                as tabla,
       c.relrowsecurity         as rls_activo,      -- debe ser true
       c.relforcerowsecurity    as rls_forzado
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('condiciones_salud', 'respuestas_sesion')
order by c.relname;

-- 2) POLÍTICAS presentes. Deseado: una política 'authenticated' por tabla,
--    aislada por current_studio_id().
select tablename, policyname, roles, cmd, qual
from pg_policies
where schemaname = 'public'
  and tablename in ('condiciones_salud', 'respuestas_sesion')
order by tablename;

-- 3) anon SIN privilegios de tabla sobre datos de salud.
--    Deseado: 0 filas. Cualquier fila = fuga potencial cross-tenant de PHI.
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('condiciones_salud', 'respuestas_sesion')
  and grantee in ('anon', 'PUBLIC')
order by table_name, grantee, privilege_type;

-- 4) anon SIN EXECUTE sobre las RPCs sensibles. Deseado: todas 'false'.
select p.proname                                                   as funcion,
       has_function_privilege('anon',   p.oid, 'EXECUTE')          as anon_puede,
       has_function_privilege('public', p.oid, 'EXECUTE')          as public_puede
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('ajustar_creditos', 'reservar_plaza',
                    'cancelar_reserva_plaza', 'crear_reserva_atomica')
order by p.proname;

-- 5) Default privileges: que ninguna tabla FUTURA nazca accesible por anon.
--    Deseado: NO aparece 'anon' con privilegios de tabla para el rol postgres.
select r.rolname as rol_creador,
       (aclexplode(d.defaclacl)).grantee::regrole::text as concedido_a,
       (aclexplode(d.defaclacl)).privilege_type          as privilegio
from pg_default_acl d
join pg_roles r on r.oid = d.defaclrole
join pg_namespace n on n.oid = d.defaclnamespace
where n.nspname = 'public' and d.defaclobjtype = 'r'
order by rol_creador, concedido_a;
