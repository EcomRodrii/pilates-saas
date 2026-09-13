-- ═══════════════════════════════════════════════════════════════════════════
-- Verificación — RLS del bucket `avatars` (subida de imágenes)
-- ═══════════════════════════════════════════════════════════════════════════
-- Ejecutar en el SQL editor de Supabase (prod, proyecto dwqvdycjcffqwfkzapvi).
-- Solo lectura: no sube nada ni cambia nada.
--
-- Por qué existe: el 11-ago-2026 subir una foto desde el editor de apariencia
-- daba «new row violates row-level security policy». El código escribía en
-- `portal-<studioId>-<clave>` y la función que autoriza no tenía esa rama.
-- Ninguna prueba lo vio: los e2e mockean la red, así que Storage y su RLS no
-- los toca nadie hasta producción.
--
-- `lib/storage-politicas.test.ts` cubre en CI la mitad que se puede comprobar
-- sin red (que código y política hablan de los mismos prefijos). Esto es la
-- otra mitad: preguntarle a la base de datos DE VERDAD.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Las CUATRO políticas del bucket cuelgan de sus funciones.
--    Deseado (desde 20260913161200): SELECT con `avatars_path_autorizado`
--    (lectura, por estudio) e INSERT/UPDATE/DELETE con
--    `avatars_path_escribible` (mismo árbol de prefijos + rol). Si algún verbo
--    de escritura volviera a la función de lectura, dejaría de mirar el rol.
select cmd,
       policyname,
       case when cmd = 'SELECT'
            then coalesce(qual, with_check) like '%avatars_path_autorizado%'
            else coalesce(qual, with_check) like '%avatars_path_escribible%'
       end as usa_la_funcion_correcta
from pg_policies
where schemaname = 'storage' and tablename = 'objects' and policyname like 'avatars_%'
order by cmd;

-- 2) Ramas que autoriza la función, tal y como está AHORA en la base de datos.
--    Deseado: aparecen todos los prefijos que el código sube — hoy
--    favicon-borrador, portal, logo, favicon, admin, bienvenida, instructor,
--    clase, banner (ver lib/portal-storage.ts).
select unnest(regexp_matches(
         regexp_replace(pg_get_functiondef(p.oid), '--[^\n]*', '', 'g'),
         'like ''([a-z-]+?)-%''', 'g')) as prefijo_autorizado
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where p.proname = 'avatars_path_autorizado' and n.nspname = 'public'
union
select unnest(regexp_matches(
         regexp_replace(pg_get_functiondef(p.oid), '--[^\n]*', '', 'g'),
         'starts_with\(p_name, ''([a-z-]+?)-''', 'g'))
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where p.proname = 'avatars_path_autorizado' and n.nspname = 'public'
order by 1;

-- 3) La tabla de la verdad del aislamiento entre estudios, con ids REALES.
--    Deseado: permitido = true solo cuando el path empieza por el estudio que
--    pregunta. Los ids de estudio LLEVAN guiones, así que este bloque es el que
--    detectaría un troceo ingenuo por el primer guion.
with estudios as (select id from public.studios order by creado_en limit 3),
     casos as (
       select e.id as estudio_actual,
              'portal-' || e2.id || '-foto' as path,
              e.id = e2.id as deberia_permitir
       from estudios e cross join estudios e2
     )
select estudio_actual, path, deberia_permitir,
       starts_with(path, 'portal-' || estudio_actual || '-') as permitido,
       (starts_with(path, 'portal-' || estudio_actual || '-') = deberia_permitir) as correcto
from casos
order by estudio_actual, path;

-- 4) Permisos de ejecución. Deseado: authenticated = true, anon = false.
--    Se comprueba aquí porque un CREATE OR REPLACE con firma NUEVA crearía un
--    objeto función distinto con EXECUTE a PUBLIC por defecto — el gotcha que
--    este repo ya ha pisado tres veces con las RPC de reservas.
select has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_puede,
       has_function_privilege('anon', p.oid, 'EXECUTE')          as anon_puede
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where p.proname = 'avatars_path_autorizado' and n.nspname = 'public';
