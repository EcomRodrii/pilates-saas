-- Solicitudes de soporte: el equipo las escribe, solo la propietaria las lee.
--
-- ANTES: `admin_soporte_solicitudes` FOR ALL TO authenticated USING
-- (studio_id = current_studio_id()), sin mirar el rol. Cualquier persona del
-- equipo —instructora o recepción— podía leer, editar y borrar lo que la
-- propietaria había escrito a Tentare desde «Ayuda». Es texto libre: quien está
-- atascada describe su caso, y a veces el caso es una alumna. Además la tabla
-- tenía GRANT completo a `anon` (neutralizado por la RLS, pero sin motivo).
-- Ensayado en producción antes de escribir esto: RECEPCION e INSTRUCTOR de un
-- estudio real veían sus 7 solicitudes.
--
-- DESPUÉS:
--   · INSERT: cualquier persona del personal, solo en su estudio. Es lo que
--     hacen el widget de ayuda y «Avisarme» de Integraciones.
--   · SELECT: solo PROPIETARIO de ese estudio. No hay hoy ninguna pantalla que
--     las liste desde el cliente (Tentare las lee con service-role), así que
--     esto no apaga nada visible: evita que la primera pantalla que se haga
--     nazca abierta a todo el equipo. Espejo: `puedeVerSolicitudesSoporte`.
--   · UPDATE / DELETE: nadie desde el cliente. Ni política ni privilegio.
--
-- La inserción del cliente va con `return=minimal` (supabase-js sin `.select()`),
-- así que recepción o una instructora pueden seguir escribiendo aunque no
-- puedan leer lo que acaban de escribir.

drop policy if exists admin_soporte_solicitudes on public.soporte_solicitudes;

drop policy if exists soporte_insertar_personal on public.soporte_solicitudes;
create policy soporte_insertar_personal on public.soporte_solicitudes
  for insert to authenticated
  with check (
    studio_id = public.current_studio_id()
    and public.current_rol() is not null
  );

drop policy if exists soporte_leer_propietaria on public.soporte_solicitudes;
create policy soporte_leer_propietaria on public.soporte_solicitudes
  for select to authenticated
  using (
    studio_id = public.current_studio_id()
    and public.current_rol() = 'PROPIETARIO'
  );

revoke all on table public.soporte_solicitudes from anon;
revoke update, delete, truncate, references, trigger on table public.soporte_solicitudes from authenticated;
grant select, insert on table public.soporte_solicitudes to authenticated;
