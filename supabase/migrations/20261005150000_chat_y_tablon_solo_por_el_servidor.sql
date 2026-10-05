-- ─────────────────────────────────────────────────────────────────────────────
-- La mensajería y el tablón de la app de la alumna y de la instructora solo
-- pasan por el servidor (App Store 1.2: lo que se modera tiene que tener una
-- sola puerta).
--
-- Las dos apps leen y escriben por rutas de servidor con service-role
-- (`/api/public/mensajeria/*`, `/api/portal/instructora/mensajes`,
-- `/api/public/comunidad/*`), que comprueban a mano quién es cada una. Pero la
-- alumna SÍ tiene un JWT `authenticated` de Supabase (su sesión del portal), y
-- con él la API de Supabase le abría por PostgREST lo mismo que la ruta:
-- `es_participante_conversacion` contaba su fila SOCIO. El cliente del portal
-- solo usa `.auth` (lib/db/supabase-portal.ts) y el único canal de Realtime
-- `conversacion:` es el del panel (components/mensajeria/conversaciones-tab.tsx),
-- así que no hay nada de la app que dependa de esa rama.
--
-- Qué se cierra, y qué NO se toca a propósito:
--   · `es_participante_conversacion` solo cuenta filas STAFF (con ficha activa
--     en el estudio de la conversación, o la dueña), igual que antes para el
--     equipo. Misma firma: `create or replace` conserva el ACL, y aun así se
--     fija y se comprueba abajo. La siguen necesitando las políticas del panel
--     (`authenticated`).
--   · `mensajes`: fuera UPDATE y DELETE para `authenticated` (no había política
--     que los usara: era el privilegio por defecto del esquema). El INSERT por
--     columnas del panel (20260914142356) se queda.
--   · `conversaciones`: fuera INSERT y DELETE (las abre la RPC
--     `abrir_conversacion` con service-role). NO se revoca UPDATE de tabla: el
--     panel escribe `mostrador_leido_hasta` con su sesión y un REVOKE de tabla
--     se llevaría también ese GRANT de columna.
--   · `conversacion_participantes`: fuera INSERT y DELETE (20260827103031 los
--     concedía sin ninguna política que los usara). El UPDATE de `leido_hasta`
--     se queda.
--   · `anon` no tiene nada que hacer en ninguna de las tres.
--   · `comentarios_comunidad`: fuera UPDATE y su política de editar. Con la
--     moderación (20261005150100), un comentario retirado lleva `oculto_en`, y
--     quien lo escribió no puede volver a enseñarlo editando la fila. Nadie
--     edita comentarios desde el navegador (grep: ningún `.from('comentarios_comunidad')`
--     fuera de rutas de servidor).
--   · INSTRUCTOR sale de la lectura de `comentarios_comunidad` y `post_likes`
--     por PostgREST, con el mismo patrón que 20260921221053: desde que trabaja en
--     la app del estudio, el panel no tiene pantallas para ella y Comunidad es
--     una de las pérdidas aceptadas. Los demás roles, igual que antes.
--
-- Va ANTES de desplegar el código y se puede repetir. El código de hoy no usa
-- nada de lo que se quita (lo comprueba lib/mensajeria/escritura-solo-servidor-contrato.test.ts).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Quién participa en una conversación por PostgREST: solo el equipo ─────
create or replace function public.es_participante_conversacion(p_conversacion_id text)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select exists (
    select 1
      from public.conversacion_participantes cp
      join public.conversaciones c on c.id = cp.conversacion_id
     where cp.conversacion_id = p_conversacion_id
       and cp.auth_user_id = auth.uid()
       and cp.rol_en_conversacion = 'STAFF'
       and (
         exists (
           select 1 from public.instructores i
            where i.auth_user_id = cp.auth_user_id
              and i.studio_id = c.studio_id
              and coalesce(i.activo, true)
         )
         or exists (
           select 1 from public.studios s
            where s.id = c.studio_id
              and s.owner_auth_user_id = cp.auth_user_id
         )
       )
  );
$function$;

comment on function public.es_participante_conversacion(text) is
  'Participa en la conversación POR POSTGREST: fila STAFF con ficha activa en el estudio de la conversación, o la dueña del estudio. La alumna no entra por aquí: su app va por rutas de servidor. Base de las políticas de conversaciones, participantes, mensajes y Realtime.';

-- La necesitan las políticas de `authenticated` (el panel). Nunca anon.
revoke all on function public.es_participante_conversacion(text) from public;
revoke all on function public.es_participante_conversacion(text) from anon;
grant execute on function public.es_participante_conversacion(text) to authenticated, service_role;

-- ── 2. Privilegios de tabla que nadie del navegador usa ──────────────────────
revoke all on table public.mensajes from anon;
revoke all on table public.conversaciones from anon;
revoke all on table public.conversacion_participantes from anon;

revoke update, delete on table public.mensajes from authenticated;
revoke insert, delete on table public.conversaciones from authenticated;
revoke insert, delete on table public.conversacion_participantes from authenticated;

revoke update on table public.comentarios_comunidad from authenticated;
drop policy if exists comentarios_comunidad_editar on public.comentarios_comunidad;

-- ── 3. INSTRUCTOR fuera de la lectura del tablón por PostgREST ──────────────
alter policy comentarios_comunidad_lectura on public.comentarios_comunidad
  using (studio_id = (select public.current_studio_id()) and (select public.current_rol()) is distinct from 'INSTRUCTOR');
alter policy post_likes_select on public.post_likes
  using (studio_id = (select public.current_studio_id()) and (select public.current_rol()) is distinct from 'INSTRUCTOR');

-- ── 4. Comprobación al aplicar (no fiarse de este comentario) ────────────────
do $$
begin
  if has_table_privilege('authenticated', 'public.mensajes', 'UPDATE')
     or has_table_privilege('authenticated', 'public.mensajes', 'DELETE')
     or has_any_column_privilege('authenticated', 'public.mensajes', 'UPDATE')
     or has_any_column_privilege('authenticated', 'public.comentarios_comunidad', 'UPDATE')
     or has_table_privilege('authenticated', 'public.conversaciones', 'INSERT')
     or has_table_privilege('authenticated', 'public.conversaciones', 'DELETE')
     or has_table_privilege('authenticated', 'public.conversacion_participantes', 'INSERT')
     or has_table_privilege('authenticated', 'public.conversacion_participantes', 'DELETE') then
    raise exception 'chat y tablón: queda un permiso de escritura abierto al navegador';
  end if;
  if has_table_privilege('anon', 'public.mensajes', 'SELECT')
     or has_table_privilege('anon', 'public.conversaciones', 'SELECT')
     or has_table_privilege('anon', 'public.conversacion_participantes', 'SELECT') then
    raise exception 'chat: anon sigue pudiendo leer la mensajería';
  end if;
  -- Lo que el panel usa con su sesión tiene que seguir ahí.
  if not has_column_privilege('authenticated', 'public.conversaciones', 'mostrador_leido_hasta', 'UPDATE')
     or not has_column_privilege('authenticated', 'public.conversacion_participantes', 'leido_hasta', 'UPDATE')
     or not has_column_privilege('authenticated', 'public.mensajes', 'cuerpo', 'INSERT')
     or not has_table_privilege('authenticated', 'public.mensajes', 'SELECT')
     or not has_table_privilege('authenticated', 'public.conversaciones', 'SELECT') then
    raise exception 'chat: el panel ha perdido un permiso que usa';
  end if;
  if exists (select 1 from pg_policy p where p.polrelid = 'public.comentarios_comunidad'::regclass
              and p.polname = 'comentarios_comunidad_editar') then
    raise exception 'tablón: sigue la política de editar comentarios';
  end if;
  if has_function_privilege('anon', 'public.es_participante_conversacion(text)', 'EXECUTE') then
    raise exception 'es_participante_conversacion: anon no debe poder ejecutarla';
  end if;
  if not has_function_privilege('authenticated', 'public.es_participante_conversacion(text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.es_participante_conversacion(text)', 'EXECUTE') then
    raise exception 'es_participante_conversacion: las políticas del panel la necesitan';
  end if;
end $$;
