-- Acceso de INSTRUCTOR acotado a lo que su trabajo usa.
--
-- Desde que Tentare Core se retiró (14-sep-2026) la instructora trabaja en la app
-- del estudio, que lee y escribe por rutas del servidor, y el panel no tiene
-- pantallas para ella. Estas políticas no distinguían el rol; ahora INSTRUCTOR
-- queda fuera de los datos de alumnas y del negocio que ya no necesita. Los demás
-- roles no cambian (sin rol, `IS DISTINCT FROM` deja pasar, como antes). Los
-- bloqueos de agenda los sigue viendo, solo los suyos. Una instructora que en otra
-- sede es MANAGER tiene ese rol allí: `current_rol()` sigue a la sede activa.
--
-- Fuera a propósito: catálogos y configuración (salas, tipos de clase, horario,
-- planes, catálogo de recompensas…) y Comunidad (congelada).

-- Lectura: datos de alumnas y del equipo.
ALTER POLICY suscripciones_lectura ON public.suscripciones
  USING (studio_id = public.current_studio_id() AND (SELECT public.current_rol()) IS DISTINCT FROM 'INSTRUCTOR');
ALTER POLICY staff_lee_member_credits ON public.member_credits
  USING (studio_id = public.current_studio_id() AND (SELECT public.current_rol()) IS DISTINCT FROM 'INSTRUCTOR');
ALTER POLICY credit_transactions_lectura ON public.credit_transactions
  USING (studio_id = public.current_studio_id() AND (SELECT public.current_rol()) IS DISTINCT FROM 'INSTRUCTOR');
ALTER POLICY recuperaciones_lectura ON public.recuperaciones
  USING (studio_id = public.current_studio_id() AND (SELECT public.current_rol()) IS DISTINCT FROM 'INSTRUCTOR');
ALTER POLICY congelaciones_lectura ON public.congelaciones
  USING (studio_id = public.current_studio_id() AND (SELECT public.current_rol()) IS DISTINCT FROM 'INSTRUCTOR');
ALTER POLICY plazas_fijas_lectura ON public.plazas_fijas
  USING (studio_id = public.current_studio_id() AND (SELECT public.current_rol()) IS DISTINCT FROM 'INSTRUCTOR');
ALTER POLICY autorizados_lectura ON public.socio_tipos_clase_autorizados
  USING (studio_id = public.current_studio_id() AND (SELECT public.current_rol()) IS DISTINCT FROM 'INSTRUCTOR');
ALTER POLICY valoraciones_iniciales_lectura ON public.valoraciones_iniciales
  USING (studio_id = public.current_studio_id() AND (SELECT public.current_rol()) IS DISTINCT FROM 'INSTRUCTOR');
ALTER POLICY reward_redemptions_lectura ON public.reward_redemptions
  USING (studio_id = public.current_studio_id() AND (SELECT public.current_rol()) IS DISTINCT FROM 'INSTRUCTOR');
ALTER POLICY reward_history_lectura ON public.reward_history
  USING (studio_id = public.current_studio_id() AND (SELECT public.current_rol()) IS DISTINCT FROM 'INSTRUCTOR');
ALTER POLICY achievement_history_lectura ON public.achievement_history
  USING (studio_id = public.current_studio_id() AND (SELECT public.current_rol()) IS DISTINCT FROM 'INSTRUCTOR');
ALTER POLICY achievement_progress_lectura ON public.achievement_progress
  USING (studio_id = public.current_studio_id() AND (SELECT public.current_rol()) IS DISTINCT FROM 'INSTRUCTOR');
ALTER POLICY challenge_progress_lectura ON public.challenge_progress
  USING (studio_id = public.current_studio_id() AND (SELECT public.current_rol()) IS DISTINCT FROM 'INSTRUCTOR');
ALTER POLICY reto_participaciones_lectura ON public.reto_participaciones
  USING (studio_id = public.current_studio_id() AND (SELECT public.current_rol()) IS DISTINCT FROM 'INSTRUCTOR');
ALTER POLICY staff_lee_mensajes_equipo ON public.mensajes_equipo
  USING (studio_id = public.current_studio_id() AND (SELECT public.current_rol()) IS DISTINCT FROM 'INSTRUCTOR');

-- Lectura y escritura (políticas ALL).
ALTER POLICY admin_preferencias_socio ON public.preferencias_socio
  USING (studio_id = public.current_studio_id() AND (SELECT public.current_rol()) IS DISTINCT FROM 'INSTRUCTOR')
  WITH CHECK (studio_id = public.current_studio_id() AND (SELECT public.current_rol()) IS DISTINCT FROM 'INSTRUCTOR');
ALTER POLICY admin_socio_excepciones ON public.socio_excepciones
  USING (studio_id = public.current_studio_id() AND (SELECT public.current_rol()) IS DISTINCT FROM 'INSTRUCTOR')
  WITH CHECK (studio_id = public.current_studio_id() AND (SELECT public.current_rol()) IS DISTINCT FROM 'INSTRUCTOR');
ALTER POLICY admin_challenge_history ON public.challenge_history
  USING (studio_id = public.current_studio_id() AND (SELECT public.current_rol()) IS DISTINCT FROM 'INSTRUCTOR')
  WITH CHECK (studio_id = public.current_studio_id() AND (SELECT public.current_rol()) IS DISTINCT FROM 'INSTRUCTOR');
ALTER POLICY admin_favoritos_clase ON public.favoritos_clase
  USING (studio_id = public.current_studio_id() AND (SELECT public.current_rol()) IS DISTINCT FROM 'INSTRUCTOR')
  WITH CHECK (studio_id = public.current_studio_id() AND (SELECT public.current_rol()) IS DISTINCT FROM 'INSTRUCTOR');
ALTER POLICY admin_notificaciones ON public.notificaciones
  USING (studio_id = public.current_studio_id() AND (SELECT public.current_rol()) IS DISTINCT FROM 'INSTRUCTOR')
  WITH CHECK (studio_id = public.current_studio_id() AND (SELECT public.current_rol()) IS DISTINCT FROM 'INSTRUCTOR');
ALTER POLICY admin_canales_equipo ON public.canales_equipo
  USING (studio_id = public.current_studio_id() AND (SELECT public.current_rol()) IS DISTINCT FROM 'INSTRUCTOR')
  WITH CHECK (studio_id = public.current_studio_id() AND (SELECT public.current_rol()) IS DISTINCT FROM 'INSTRUCTOR');
ALTER POLICY admin_instructor_dependency_snapshots ON public.instructor_dependency_snapshots
  USING (studio_id = public.current_studio_id() AND (SELECT public.current_rol()) IS DISTINCT FROM 'INSTRUCTOR')
  WITH CHECK (studio_id = public.current_studio_id() AND (SELECT public.current_rol()) IS DISTINCT FROM 'INSTRUCTOR');
ALTER POLICY admin_dashboard_charts ON public.dashboard_charts
  USING (studio_id = public.current_studio_id() AND (SELECT public.current_rol()) IS DISTINCT FROM 'INSTRUCTOR')
  WITH CHECK (studio_id = public.current_studio_id() AND (SELECT public.current_rol()) IS DISTINCT FROM 'INSTRUCTOR');
ALTER POLICY staff_red_favoritos ON public.red_favoritos
  USING (studio_id = public.current_studio_id() AND (SELECT public.current_rol()) IS DISTINCT FROM 'INSTRUCTOR')
  WITH CHECK (studio_id = public.current_studio_id() AND (SELECT public.current_rol()) IS DISTINCT FROM 'INSTRUCTOR');
ALTER POLICY admin_videos_on_demand ON public.videos_on_demand
  USING (studio_id = public.current_studio_id() AND (SELECT public.current_rol()) IS DISTINCT FROM 'INSTRUCTOR')
  WITH CHECK (studio_id = public.current_studio_id() AND (SELECT public.current_rol()) IS DISTINCT FROM 'INSTRUCTOR');

-- Escribir en el canal de equipo: la instructora ya no lo tiene (pérdida aceptada al retirar Core).
ALTER POLICY staff_escribe_mensajes_equipo ON public.mensajes_equipo
  WITH CHECK (
    (studio_id = public.current_studio_id())
    AND (SELECT public.current_rol()) IS DISTINCT FROM 'INSTRUCTOR'
    AND (
      EXISTS (SELECT 1 FROM public.instructores i
              WHERE i.id = mensajes_equipo.autor_instructor_id AND i.studio_id = mensajes_equipo.studio_id
                AND i.auth_user_id = (SELECT auth.uid()))
      OR (autor_instructor_id IS NULL AND EXISTS (SELECT 1 FROM public.studios s
              WHERE s.id = mensajes_equipo.studio_id AND s.owner_auth_user_id = (SELECT auth.uid())))
    )
  );

-- Bloqueos de agenda: la instructora, solo los suyos.
ALTER POLICY instructora_disp_exc_lectura ON public.instructora_disponibilidad_excepciones
  USING (
    studio_id = public.current_studio_id()
    AND ((SELECT public.current_rol()) IS DISTINCT FROM 'INSTRUCTOR' OR instructor_id = public.current_instructor_id())
  );
