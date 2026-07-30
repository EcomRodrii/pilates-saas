-- admin_mensajes_equipo era ALL con solo studio_id — cualquier staff
-- autenticado del estudio podía insertar un mensaje con
-- autor_instructor_id/autor_nombre de OTRA persona (suplantación dentro del
-- mismo estudio: "que parezca que otra compañera dijo algo que no dijo").
-- instructores.auth_user_id liga la fila de staff (PROPIETARIO/RECEPCION/
-- INSTRUCTOR — la tabla instructores es "personal", no solo profesorado) con
-- el usuario autenticado; se exige que coincida con quien firma el mensaje.
-- No hay UPDATE/DELETE de mensajes en el código (solo insert+select), así
-- que no se conceden esos permisos.

drop policy if exists admin_mensajes_equipo on mensajes_equipo;

create policy staff_lee_mensajes_equipo on mensajes_equipo
  for select using (studio_id = current_studio_id());

create policy staff_escribe_mensajes_equipo on mensajes_equipo
  for insert with check (
    studio_id = current_studio_id()
    and exists (
      select 1 from instructores i
      where i.id = autor_instructor_id
        and i.studio_id = mensajes_equipo.studio_id
        and i.auth_user_id = auth.uid()
    )
  );
