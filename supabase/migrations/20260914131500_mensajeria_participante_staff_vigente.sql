-- ─────────────────────────────────────────────────────────────────────────────
-- Mensajería: la baja de alguien del equipo también cierra sus conversaciones.
--
-- La 0130 hizo que `instructores.activo = false` quitara el acceso de verdad
-- (`current_studio_id()`/`current_rol()`), pero la mensajería no pasa por esas
-- dos funciones: sus policies (`conversaciones_lectura`,
-- `conversacion_participantes_lectura`, `mensajes_lectura`,
-- `mensajes_escritura`) y la de Realtime (`mensajeria_broadcast_lectura`)
-- autorizan a quien PARTICIPA mediante `es_participante_conversacion()`, que
-- solo miraba la fila de `conversacion_participantes`. Una fila STAFF sigue ahí
-- después de la baja, así que la baja no llegaba a sus conversaciones con
-- alumnas.
--
-- Ahora la fila cuenta si:
--   · es SOCIO (sin cambios: la socia sigue viendo lo suyo), o
--   · es STAFF y esa persona tiene ficha ACTIVA en el estudio de la
--     conversación — la de ESE estudio: estar activa en otra sede de la cadena
--     no mantiene el acceso aquí —, o
--   · es STAFF y es la dueña del estudio (mismo criterio que la 0130: la dueña
--     no se queda fuera de su propio estudio por una ficha desactivada).
--
-- `coalesce(activo, true)`, como en la 0130: solo una baja EXPLÍCITA revoca.
--
-- Arreglar la función basta: las cinco policies la llaman, así que no se toca
-- ninguna. Las ramas EQUIPO/ALUMNA_MOSTRADOR ya exigían `current_studio_id()`.
--
-- Firma IDÉNTICA (`create or replace`, mismo argumento y tipo de retorno): se
-- conservan los grants. Cambiarla crea un objeto nuevo con EXECUTE por defecto
-- (gotcha repetido en este repo); el bloque del final lo comprueba igualmente.
--
-- Verificado antes de escribir esto, sobre producción y dentro de una
-- transacción revertida: con la ficha desactivada, lectura, escritura, leído y
-- Realtime pasan de permitidos a denegados; instructora activa, socia y dueña
-- siguen igual; alguien ajeno sigue sin ver nada.
-- ─────────────────────────────────────────────────────────────────────────────

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
       and (
         cp.rol_en_conversacion = 'SOCIO'
         or exists (
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
  'Participa en la conversación: fila SOCIO, o fila STAFF con ficha activa en el estudio de la conversación (o dueña del estudio). Base de las policies de conversaciones, participantes, mensajes y Realtime.';

-- Sobre anon, por escrito: ni anon ni PUBLIC; la necesitan las policies de
-- `authenticated`. Es el estado que ya dejó la migración original.
revoke all on function public.es_participante_conversacion(text) from public, anon;
grant execute on function public.es_participante_conversacion(text) to authenticated, service_role;

do $$
begin
  if has_function_privilege('anon', 'public.es_participante_conversacion(text)', 'EXECUTE') then
    raise exception 'es_participante_conversacion: anon no debe poder ejecutarla';
  end if;
  if not has_function_privilege('authenticated', 'public.es_participante_conversacion(text)', 'EXECUTE') then
    raise exception 'es_participante_conversacion: authenticated la necesita (policies)';
  end if;
end $$;
