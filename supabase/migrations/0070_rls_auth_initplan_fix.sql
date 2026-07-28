-- Hallazgo del audit de rendimiento (bloque Seguridad): 5 políticas RLS llaman
-- auth.uid()/auth.jwt() directamente en vez de (select auth.uid()), lo que
-- fuerza a Postgres a re-evaluarlas fila a fila en vez de una vez por consulta
-- (advisor auth_rls_initplan de Supabase). Sin efecto medible hoy (tablas
-- pequeñas), pero crece con el tamaño real de cada tabla. Solo se toca el
-- qual/with_check — el alcance de comandos (FOR ALL/UPDATE/INSERT) no cambia.
--
-- Verificado con simulación de roles reales (propietaria, instructora,
-- cross-tenant) antes y después del cambio: mismos resultados en las 8
-- comprobaciones de lectura/escritura. Los 7 avisos "multiple_permissive_policies"
-- del mismo advisor se dejan sin tocar a propósito — requerirían partir
-- políticas FOR ALL en 3 (INSERT/UPDATE/DELETE) para no solapar con SELECT, y
-- el riesgo de tocar RLS en producción no compensa una ganancia marginal
-- (comparaciones booleanas baratas, no queries costosas).

ALTER POLICY owner_cadenas ON public.cadenas
  USING (owner_auth_user_id = (select auth.uid()))
  WITH CHECK (owner_auth_user_id = (select auth.uid()));

ALTER POLICY self_claim_instructores ON public.instructores
  USING (auth_user_id IS NULL AND email = ((select auth.jwt()) ->> 'email'))
  WITH CHECK (auth_user_id = (select auth.uid()));

ALTER POLICY self_rw_sesion_activa ON public.sesion_activa
  USING (auth_user_id = (select auth.uid()))
  WITH CHECK (auth_user_id = (select auth.uid()));

ALTER POLICY insert_studios ON public.studios
  WITH CHECK (
    owner_auth_user_id = (select auth.uid())
    AND (cadena_id IS NULL OR EXISTS (
      SELECT 1 FROM cadenas c WHERE c.id = studios.cadena_id AND c.owner_auth_user_id = (select auth.uid())
    ))
  );

ALTER POLICY post_likes_write ON public.post_likes
  USING (user_id = (select auth.uid()) AND studio_id = current_studio_id())
  WITH CHECK (user_id = (select auth.uid()) AND studio_id = current_studio_id());
