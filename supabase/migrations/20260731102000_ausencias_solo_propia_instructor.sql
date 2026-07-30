-- ─────────────────────────────────────────────────────────────────────────────
-- Quinto tramo del autoservicio de instructora: ahora puede registrar/borrar
-- SU PROPIA ausencia programada (vacaciones/baja médica/otro) desde el panel
-- logueado (`/api/equipo/ausencias`, rama nueva para rol INSTRUCTOR), en vez
-- de depender de que la propietaria/manager lo hagan desde /equipo.
--
-- La policy de esta tabla (0101) era `FOR ALL USING (studio_id =
-- current_studio_id())` sin distinguir fila ni rol — el mismo agujero ya
-- cerrado para `sesiones`/`reservas` (20260730109000+) e
-- `instructora_disponibilidad` (20260731101000). El endpoint usa service-role
-- y ya acota por `instructor_id` resuelto en servidor, así que en sí mismo ya
-- es seguro — pero cerrar la RLS en la misma tanda, no esperar a que lo
-- encuentre una auditoría, es el patrón que ya se siguió las dos veces
-- anteriores.
--
-- Modelo (mismo patrón exacto que 20260731101000):
--   · PROPIETARIO / MANAGER / RECEPCION: control total, sin cambios — siguen
--     gestionando la ausencia de CUALQUIERA desde /equipo.
--   · INSTRUCTOR: solo sobre sus propias filas (`instructor_id =
--     current_instructor_id()`).
--
-- No toca `instructora_disponibilidad_excepciones` (los bloqueos que
-- materializa este endpoint) — se escriben con service-role, nunca
-- directamente desde el cliente.
--
-- Reversible: recrear `ausencias_staff` (FOR ALL, mismo `qual`/`with_check`
-- que antes) y DROP de las policies nuevas.
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists ausencias_staff on public.instructora_ausencias;

create policy ausencias_gestion on public.instructora_ausencias
  for all to authenticated
  using (studio_id = public.current_studio_id() and public.current_rol() != 'INSTRUCTOR')
  with check (studio_id = public.current_studio_id() and public.current_rol() != 'INSTRUCTOR');

create policy ausencias_propia on public.instructora_ausencias
  for all to authenticated
  using (studio_id = public.current_studio_id() and instructor_id = public.current_instructor_id())
  with check (studio_id = public.current_studio_id() and instructor_id = public.current_instructor_id());
