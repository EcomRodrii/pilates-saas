-- Auditoría 19ª pasada (1-sep) · F-8 y F-9.
--
-- Dos policies que dan más de lo que ningún camino del código usa. Es la
-- CONTINUACIÓN literal de 20260820165632_cierra_lectura_anon_cross_tenant, y el
-- primer caso es esa misma migración deshecha: el 20-ago se eliminaron 9
-- policies `for select to anon using (true)` por leer datos de todos los
-- estudios, y el 26-ago `novedades_estudio` nació con exactamente esa forma. El
-- arreglo de entonces cerró las tablas que existían, pero no dejó regla que
-- impidiera reescribir el patrón en la tabla siguiente.
--
-- ── F-8 · novedades_estudio: lectura anon sin filtro de estudio ──────────────
--
-- `create policy public_read_novedades_estudio ... for select to anon using (true)`
-- (20260826220000_novedades_estudio.sql:47-48). Sin `studio_id`: con la clave
-- anónima —que es pública, viaja en el bundle— se lee el tablón interno de
-- TODOS los estudios de la plataforma, no solo el propio.
--
-- Hoy no filtra de hecho porque `anon` nunca recibió el GRANT de tabla: la
-- lectura falla con 42501 antes de evaluar la policy. Es decir, es el mismo
-- desajuste policy↔grant que ya produjo un no-op el 14-ago, solo que esta vez a
-- nuestro favor. No se deja así: basta que alguien conceda el SELECT para
-- "arreglar" la lectura pública —que es lo natural al ver el 42501— para abrir
-- la fuga entera de golpe.
--
-- No se pierde ningún camino legítimo: las novedades llegan al portal público
-- por `fetchPublicStudioData` (service-role, ignora RLS) — verificado en
-- lib/db/supabase-data-admin.ts, donde viajan en el payload público — y el
-- panel las lee como `authenticated` por `admin_novedades_estudio`, que sí
-- acota por `current_studio_id()` y por rol, y queda intacta.
--
-- Mismo cinturón y tirantes que el 20-ago: drop de la policy + revoke del grant.

drop policy if exists public_read_novedades_estudio on public.novedades_estudio;
revoke select on public.novedades_estudio from anon;

-- ── F-9 · valoraciones: la parte evaluada podía escribir su propia nota ──────
--
-- `admin_valoraciones` (0044_valoraciones.sql:48) es `FOR ALL` con el único
-- predicado `studio_id = current_studio_id()`, sin comprobación de rol, y la
-- tabla lleva `GRANT ALL ... TO anon, authenticated`. `current_studio_id()`
-- resuelve para propietarias E INSTRUCTORAS, así que una instructora del
-- estudio podía hacer UPDATE/DELETE/INSERT sobre `valoraciones` — la tabla que
-- alimenta `valoraciones_resumen_estudio()`, o sea las estrellas de Equipo y el
-- ranking con el que se reparten las sustituciones. Borrar los suspensos
-- propios o fabricarse sobresalientes era una llamada REST.
--
-- Verificado en producción con impersonación (instructora real 07c25aac…):
-- pasaba el predicado de la policy y tenía privilegio de UPDATE y de DELETE.
--
-- La escritura legítima no pasa por aquí: las valoraciones las crea la alumna
-- en /api/public/valorar y en /valorar/[token], ambos con service-role (que
-- ignora RLS y no se ve afectado). Comprobado por grep exhaustivo: no existe
-- ni un solo `.from('valoraciones')` con la clave del navegador en lib/, app/
-- ni components/ — el panel las lee por /api/valoraciones, también service-role.
-- La policy de escritura era código muerto, pero explotable.
--
-- Se deja SOLO lectura para el staff del propio estudio (por si algún consumo
-- futuro del panel la necesita con la clave de usuario) y se revoca `anon`,
-- que no tiene ninguna policy y por tanto tampoco usaba el grant.

drop policy if exists admin_valoraciones on public.valoraciones;
create policy admin_valoraciones on public.valoraciones
  for select to authenticated
  using (studio_id = public.current_studio_id());

revoke all on table public.valoraciones from anon;
revoke insert, update, delete on table public.valoraciones from authenticated;

comment on policy admin_valoraciones on public.valoraciones is
  'Solo lectura y solo del propio estudio. La escritura es exclusiva de service_role (/api/public/valorar): quien es evaluado no puede tocar su nota. Ver auditoría 19ª pasada, F-9.';
