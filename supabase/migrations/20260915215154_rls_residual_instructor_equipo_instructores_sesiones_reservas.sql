-- ─────────────────────────────────────────────────────────────────────────────
-- Auditoría 15-sep, I-10/I-11/I-12: tres residuos de RLS que sobrevivieron a la
-- retirada de Tentare Core (`20260914220613_panel_sin_brazo_instructora.sql`,
-- que cerró ESCRITURA en sesiones/reservas y LECTURA en socios/citas, pero no
-- tocó estas cuatro). Verificado en vivo antes de aplicar (BEGIN...ROLLBACK,
-- impersonando una instructora real y a la propietaria del mismo estudio):
-- la propietaria mantiene exactamente el mismo acceso de antes; la instructora
-- pasa de ver TODO el estudio a ver solo lo suyo.
--
-- I-10: `conversaciones_lectura` daba acceso incondicional a CUALQUIER canal
-- EQUIPO del estudio con solo `studio_id = current_studio_id()` — sin mirar
-- rol ni participación. Mismo criterio que la rama ALUMNA_MOSTRADOR de esta
-- misma política: `puede_gestionar_calendario()` (PROPIETARIO/MANAGER/
-- RECEPCION). La instructora conserva acceso a los canales EQUIPO en los que
-- SÍ participa vía `es_participante_conversacion(id)`, que ya cubría ese caso
-- — solo se quita el acceso incondicional a TODOS los canales.
--
-- I-11: `read_instructores` daba toda ficha del estudio (incluidos email y
-- teléfono de las compañeras) a cualquier `authenticated` del estudio, sin
-- distinguir fila. Ahora una instructora solo ve su propia ficha
-- (`current_instructor_id()`, ya usado en el resto del repo para este mismo
-- propósito) — el resto de roles no cambia.
--
-- I-12: `sesiones_lectura`/`reservas_lectura` daban todo el estudio a
-- cualquier `authenticated`. Ahora una instructora solo ve sus propias
-- sesiones y las reservas de sus propias sesiones — el resto de roles no
-- cambia. Límite conocido, no resuelto aquí: `reservas.valoracion_experiencia`
-- (que permisos-reglas.ts dice que la instructora no debe ver) sigue visible
-- en las reservas de SUS PROPIAS clases — RLS es por fila, no por columna;
-- antes veía la de las 172 reservas ajenas también, así que esto reduce la
-- superficie real de forma drástica aunque no la cierra del todo.
-- ─────────────────────────────────────────────────────────────────────────────

alter policy conversaciones_lectura on public.conversaciones
  using (
    ((tipo = 'EQUIPO'::text) AND (studio_id = current_studio_id()) AND puede_gestionar_calendario())
    OR ((tipo = 'ALUMNA_MOSTRADOR'::text) AND (studio_id = current_studio_id()) AND puede_gestionar_calendario())
    OR ((tipo = 'ALUMNA_INSTRUCTORA'::text) AND (studio_id = (SELECT current_studio_id())) AND ((SELECT current_rol()) = 'PROPIETARIO'::text))
    OR es_participante_conversacion(id)
  );

alter policy read_instructores on public.instructores
  using (
    (studio_id = current_studio_id())
    AND ((current_rol() IS DISTINCT FROM 'INSTRUCTOR') OR (id = current_instructor_id()))
  );

alter policy sesiones_lectura on public.sesiones
  using (
    (studio_id = current_studio_id())
    AND ((current_rol() IS DISTINCT FROM 'INSTRUCTOR') OR (instructor_id = current_instructor_id()))
  );

alter policy reservas_lectura on public.reservas
  using (
    (studio_id = current_studio_id())
    AND (
      (current_rol() IS DISTINCT FROM 'INSTRUCTOR')
      OR EXISTS (SELECT 1 FROM sesiones s WHERE s.id = reservas.sesion_id AND s.instructor_id = current_instructor_id())
    )
  );
