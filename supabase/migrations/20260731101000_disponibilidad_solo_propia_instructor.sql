-- ─────────────────────────────────────────────────────────────────────────────
-- Cuarto tramo del autoservicio de instructora: ahora puede ver/editar SU
-- disponibilidad desde el panel logueado (`/api/mi-disponibilidad`), no solo
-- por el enlace público firmado. Ese endpoint usa service-role y ya acota por
-- `instructor_id` resuelto en servidor, así que en sí mismo ya es seguro — pero
-- la policy de esta tabla (0037) era `studio_id = current_studio_id()` SIN
-- distinguir fila ni rol, el mismo agujero que ya se cerró para
-- `sesiones`/`reservas` en 20260730109000-112000. Antes daba igual porque
-- ninguna sesión de INSTRUCTOR hablaba con esta tabla directamente; en cuanto
-- empieza a hacerlo, cerrar esto en la misma tanda en vez de esperar a que lo
-- encuentre una auditoría.
--
-- Modelo (mismo patrón exacto que 20260730109000):
--   · PROPIETARIO / MANAGER / RECEPCION: control total, sin cambios — siguen
--     gestionando la disponibilidad de CUALQUIERA desde /equipo.
--   · INSTRUCTOR: solo sobre sus propias filas (`instructor_id =
--     current_instructor_id()`), en cualquier operación (select/insert/update/
--     delete) — coherente con que el endpoint hace un reemplazo total
--     (DELETE + INSERT) de su propia disponibilidad.
--
-- No toca `instructora_disponibilidad_excepciones` (fuera de alcance de este
-- tramo) ni ninguna función existente (`current_instructor_id()`,
-- `current_rol()`, `current_studio_id()`, ya creadas en 0000/20260730109000).
--
-- Reversible: recrear `admin_instructora_disponibilidad` (FOR ALL, mismo
-- `qual`/`with_check` que antes) y DROP de las policies nuevas.
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists admin_instructora_disponibilidad on public.instructora_disponibilidad;

create policy instructora_disponibilidad_gestion on public.instructora_disponibilidad
  for all to authenticated
  using (studio_id = public.current_studio_id() and public.current_rol() != 'INSTRUCTOR')
  with check (studio_id = public.current_studio_id() and public.current_rol() != 'INSTRUCTOR');

create policy instructora_disponibilidad_propia on public.instructora_disponibilidad
  for all to authenticated
  using (studio_id = public.current_studio_id() and instructor_id = public.current_instructor_id())
  with check (studio_id = public.current_studio_id() and instructor_id = public.current_instructor_id());
