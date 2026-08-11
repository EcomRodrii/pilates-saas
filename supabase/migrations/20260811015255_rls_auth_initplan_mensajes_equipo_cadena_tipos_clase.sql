-- O-2 de la auditoría de fiabilidad 2026-08-11: los dos últimos avisos
-- `auth_rls_initplan` que quedaban en get_advisors(performance).
--
-- `auth.uid()` suelto en una política se re-evalúa POR FILA. Envuelto en
-- `(select auth.uid())` Postgres lo resuelve una sola vez como InitPlan. Mismo
-- arreglo que ya se aplicó al resto de políticas en 0069_rls_auth_initplan_fix;
-- estas dos se quedaron fuera porque son posteriores.
--
-- ⚠️ La semántica NO cambia: se verificó en vivo (BEGIN/ROLLBACK) que las
-- expresiones resultantes son idénticas a las anteriores salvo el envoltorio, y
-- que se conservan `cmd` y `roles` (public en una, authenticated en la otra) —
-- recrear una política es DROP+CREATE, y perder el `TO` la abriría a roles que
-- antes no la tenían.

DROP POLICY IF EXISTS staff_escribe_mensajes_equipo ON public.mensajes_equipo;
CREATE POLICY staff_escribe_mensajes_equipo ON public.mensajes_equipo
  FOR INSERT TO public
  WITH CHECK (
    studio_id = current_studio_id()
    AND (
      EXISTS (SELECT 1 FROM instructores i
              WHERE i.id = mensajes_equipo.autor_instructor_id
                AND i.studio_id = mensajes_equipo.studio_id
                AND i.auth_user_id = (SELECT auth.uid()))
      OR (autor_instructor_id IS NULL AND EXISTS (
            SELECT 1 FROM studios s
            WHERE s.id = mensajes_equipo.studio_id
              AND s.owner_auth_user_id = (SELECT auth.uid())))
    )
  );

DROP POLICY IF EXISTS owner_cadena_tipos_clase ON public.cadena_tipos_clase;
CREATE POLICY owner_cadena_tipos_clase ON public.cadena_tipos_clase
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM cadenas c
                 WHERE c.id = cadena_tipos_clase.cadena_id
                   AND c.owner_auth_user_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM cadenas c
                      WHERE c.id = cadena_tipos_clase.cadena_id
                        AND c.owner_auth_user_id = (SELECT auth.uid())));
