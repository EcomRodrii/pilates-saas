-- ─────────────────────────────────────────────────────────────────────────────
-- Corrección de una REGRESIÓN introducida horas antes por
-- `20260914080445_socios_datos_privados_cierre` (60ª auditoría, cazada por la
-- revisión independiente — 9ª pasada seguida en que paga).
--
-- Aquel `revoke select on public.socios` no solo afecta a las consultas del
-- navegador: DOS políticas de `realtime.messages` subconsultan
-- `socios.auth_user_id`, columna que el grant nuevo no incluía. Y el privilegio
-- de columna se comprueba al planificar, así que el `OR
-- split_part(topic,':',2) = current_studio_id()` NO cortocircuita: la política
-- entera revienta con 42501 y la suscripción deja de autorizarse EN SILENCIO.
--
-- Lo que se apagaba: aforo en vivo (`lib/student/use-aforo-portal.ts`) y
-- créditos en vivo (`lib/student/use-creditos-portal.ts`) de la app de la
-- alumna, y los canales `feed:`/`creditos:` del panel.
--
-- No se arregla concediendo `auth_user_id` —eso devolvería a cualquier
-- instructora el mapeo socia→cuenta, que es parte de lo que se quería cerrar—
-- sino metiendo la subconsulta en una función `security definer`, que es el
-- patrón que este esquema ya usa para `current_studio_id()` y compañía.
--
-- Verificado en producción impersonando una socia REAL (todo revertido):
--     es_socia_activa_de('studio-1')        → true   (su estudio)
--     es_socia_activa_de(<otro estudio>)    → false
--     sin 42501 en ninguna de las dos
--
-- Lección para la próxima: antes de revocar el SELECT de una tabla, buscar
-- quién la subconsulta desde OTRO esquema (`pg_policies` de `realtime`,
-- `storage`…), no solo los `.from()` del repo.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.es_socia_activa_de(p_studio_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select exists (
    select 1 from public.socios s
     where s.auth_user_id = (select auth.uid())
       and s.activo = true
       and s.studio_id = p_studio_id
  );
$fn$;

-- Decisión explícita sobre anon (guardián de contrato): la usan las políticas
-- de realtime para sesiones autenticadas; `anon` tiene sus propias políticas.
revoke all on function public.es_socia_activa_de(text) from public, anon;
grant execute on function public.es_socia_activa_de(text) to authenticated, service_role;

drop policy if exists aforo_broadcast_lectura on realtime.messages;
create policy aforo_broadcast_lectura on realtime.messages
  for select to authenticated
  using (
    extension = 'broadcast'
    and split_part(realtime.topic(), ':', 1) = 'aforo'
    and (
      public.es_socia_activa_de(split_part(realtime.topic(), ':', 2))
      or split_part(realtime.topic(), ':', 2) = public.current_studio_id()
    )
  );

drop policy if exists feed_broadcast_lectura on realtime.messages;
create policy feed_broadcast_lectura on realtime.messages
  for select to authenticated
  using (
    extension = 'broadcast'
    and split_part(realtime.topic(), ':', 1) = any (array['feed', 'creditos'])
    and split_part(realtime.topic(), ':', 3) = ''
    and (
      public.es_socia_activa_de(split_part(realtime.topic(), ':', 2))
      or split_part(realtime.topic(), ':', 2) = public.current_studio_id()
    )
  );
