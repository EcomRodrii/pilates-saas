-- Tentare Core retirado: la RLS deja de abrirle el panel a la instructora.
--
-- Decisión del fundador (14-sep-2026). La instructora trabaja en la app del
-- estudio, que no lee ni escribe NADA con su sesión: todo pasa por rutas de
-- servidor (`/api/portal/instructora/*`, service-role, acotadas a ella). Las
-- ramas INSTRUCTOR de estas políticas solo servían al panel, que ya la manda a
-- la app (#2013) y cuyas rutas ya le responden 403 (#2014). Se aplica DESPUÉS de
-- desplegar ese código.
--
-- Qué se cierra:
--   · Salud (condiciones, notas de progreso, cuestionario, respuestas de sesión,
--     valoración inicial), el registro de lecturas y las plantillas del
--     cuestionario: solo la propietaria. `instructora_atiende_socia()` se queda:
--     la usa la app por servidor.
--   · `sesiones` INSERT/UPDATE y `reservas` UPDATE: solo quien gestiona el
--     calendario (crear clase y pasar lista van por servidor en la app).
--   · Progreso de logros y retos: fuera las políticas que dejaban escribirlo a
--     la instructora.
--   · `socios_lectura` y `citas_lectura`: ya no le sirven las fichas de todas las
--     socias del estudio.
--
-- Qué NO se toca, a propósito: las políticas «propia» (ausencias,
-- disponibilidad, tarifa, liquidación), la mensajería por participante
-- (`es_participante_conversacion`) y `current_instructor_id()`, que siguen
-- usando otras políticas. ALTER POLICY, no DROP/CREATE: conserva comando y roles.

-- ── Salud: solo la propietaria ───────────────────────────────────────────────
alter policy salud_condiciones_salud_lectura on public.condiciones_salud
  using ((studio_id = public.current_studio_id()) and public.tiene_consentimiento_salud(socio_id) and (public.current_rol() = 'PROPIETARIO'));
alter policy salud_condiciones_salud_insert on public.condiciones_salud
  with check ((studio_id = public.current_studio_id()) and public.tiene_consentimiento_salud(socio_id) and (public.current_rol() = 'PROPIETARIO'));
alter policy salud_condiciones_salud_update on public.condiciones_salud
  using ((studio_id = public.current_studio_id()) and public.tiene_consentimiento_salud(socio_id) and (public.current_rol() = 'PROPIETARIO'))
  with check ((studio_id = public.current_studio_id()) and public.tiene_consentimiento_salud(socio_id) and (public.current_rol() = 'PROPIETARIO'));
alter policy salud_condiciones_salud_delete on public.condiciones_salud
  using ((studio_id = public.current_studio_id()) and public.tiene_consentimiento_salud(socio_id) and (public.current_rol() = 'PROPIETARIO'));

alter policy salud_notas_progreso_select on public.notas_progreso
  using ((studio_id = public.current_studio_id()) and public.tiene_consentimiento_salud(socio_id) and (public.current_rol() = 'PROPIETARIO'));
alter policy salud_notas_progreso_insert on public.notas_progreso
  with check ((studio_id = public.current_studio_id()) and public.tiene_consentimiento_salud(socio_id) and (public.current_rol() = 'PROPIETARIO'));
alter policy salud_notas_progreso_update on public.notas_progreso
  using ((studio_id = public.current_studio_id()) and public.tiene_consentimiento_salud(socio_id) and (public.current_rol() = 'PROPIETARIO'))
  with check ((studio_id = public.current_studio_id()) and public.tiene_consentimiento_salud(socio_id) and (public.current_rol() = 'PROPIETARIO'));
alter policy salud_notas_progreso_delete on public.notas_progreso
  using ((studio_id = public.current_studio_id()) and public.tiene_consentimiento_salud(socio_id) and (public.current_rol() = 'PROPIETARIO'));

alter policy respuestas_cuestionario_salud_lectura on public.respuestas_cuestionario_salud
  using ((studio_id = public.current_studio_id()) and public.tiene_consentimiento_salud(socio_id) and (public.current_rol() = 'PROPIETARIO'));
alter policy respuestas_cuestionario_salud_insert on public.respuestas_cuestionario_salud
  with check ((studio_id = public.current_studio_id()) and public.tiene_consentimiento_salud(socio_id) and (public.current_rol() = 'PROPIETARIO'));
alter policy respuestas_cuestionario_salud_update on public.respuestas_cuestionario_salud
  using ((studio_id = public.current_studio_id()) and public.tiene_consentimiento_salud(socio_id) and (public.current_rol() = 'PROPIETARIO'))
  with check ((studio_id = public.current_studio_id()) and public.tiene_consentimiento_salud(socio_id) and (public.current_rol() = 'PROPIETARIO'));
alter policy respuestas_cuestionario_salud_delete on public.respuestas_cuestionario_salud
  using ((studio_id = public.current_studio_id()) and public.tiene_consentimiento_salud(socio_id) and (public.current_rol() = 'PROPIETARIO'));

alter policy salud_respuestas_sesion_select on public.respuestas_sesion
  using ((studio_id = public.current_studio_id()) and public.tiene_consentimiento_salud(socio_id) and (public.current_rol() = 'PROPIETARIO'));
alter policy salud_respuestas_sesion_insert on public.respuestas_sesion
  with check ((studio_id = public.current_studio_id()) and public.tiene_consentimiento_salud(socio_id) and (public.current_rol() = 'PROPIETARIO'));
alter policy salud_respuestas_sesion_update on public.respuestas_sesion
  using ((studio_id = public.current_studio_id()) and public.tiene_consentimiento_salud(socio_id) and (public.current_rol() = 'PROPIETARIO'))
  with check ((studio_id = public.current_studio_id()) and public.tiene_consentimiento_salud(socio_id) and (public.current_rol() = 'PROPIETARIO'));
alter policy salud_respuestas_sesion_delete on public.respuestas_sesion
  using ((studio_id = public.current_studio_id()) and public.tiene_consentimiento_salud(socio_id) and (public.current_rol() = 'PROPIETARIO'));

alter policy valoraciones_iniciales_salud_lectura on public.valoraciones_iniciales_salud
  using ((studio_id = public.current_studio_id()) and public.tiene_consentimiento_salud(socio_id) and (public.current_rol() = 'PROPIETARIO'));

alter policy lecturas_ficha_salud_insercion on public.lecturas_ficha_salud
  with check ((studio_id = public.current_studio_id()) and (public.current_rol() = 'PROPIETARIO') and (leido_por_user_id = (select auth.uid())));

alter policy plantillas_cuestionario_salud_lectura on public.plantillas_cuestionario_salud
  using ((studio_id = public.current_studio_id()) and (public.current_rol() = 'PROPIETARIO'));

-- ── Clases y reservas: solo quien gestiona el calendario ────────────────────
alter policy sesiones_escritura_insert on public.sesiones
  with check ((studio_id = public.current_studio_id()) and public.puede_gestionar_calendario());
alter policy sesiones_escritura_update on public.sesiones
  using ((studio_id = public.current_studio_id()) and public.puede_gestionar_calendario())
  with check ((studio_id = public.current_studio_id()) and public.puede_gestionar_calendario());
alter policy reservas_escritura_update on public.reservas
  using ((studio_id = public.current_studio_id()) and public.puede_gestionar_calendario())
  with check ((studio_id = public.current_studio_id()) and public.puede_gestionar_calendario());

-- ── Logros y retos: fuera la escritura de la instructora ─────────────────────
drop policy if exists achievement_progress_insert_instructora on public.achievement_progress;
drop policy if exists achievement_progress_update_instructora on public.achievement_progress;
drop policy if exists challenge_progress_insert_instructora on public.challenge_progress;
drop policy if exists challenge_progress_update_instructora on public.challenge_progress;

-- ── Fichas de socias y citas: no para la instructora ─────────────────────────
-- `is distinct from`: una sesión sin rol de personal (NULL) no cambia.
alter policy socios_lectura on public.socios
  using ((studio_id = public.current_studio_id()) and ((select public.current_rol()) is distinct from 'INSTRUCTOR'));
alter policy citas_lectura on public.citas
  using ((studio_id = public.current_studio_id()) and ((select public.current_rol()) is distinct from 'INSTRUCTOR'));
