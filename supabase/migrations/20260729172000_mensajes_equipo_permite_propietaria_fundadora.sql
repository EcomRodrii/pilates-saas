-- staff_escribe_mensajes_equipo (migración anterior) exigía que
-- autor_instructor_id apuntara a una fila real de `instructores` con
-- auth_user_id = auth.uid() — cierra la suplantación, pero la PROPIETARIA
-- FUNDADORA (la que se dio de alta ella misma en /crear-estudio, identificada
-- solo por studios.owner_auth_user_id) nunca tiene fila en `instructores`:
-- dbCreateStudio no la crea, y current_rol()/verificarSesionStaff ya
-- resuelven su rol aparte por esa misma razón (mismo patrón que
-- 0066/0068/0130). Con la policy anterior, esa propietaria no podría escribir
-- NUNCA en el chat de equipo — bloqueo total, no solo de otras identidades.
--
-- Hoy no es explotable como bug en vivo (el chat está congelado, /chat no
-- tiene page.tsx), pero se cierra ya para no dejarlo como trampa para cuando
-- se reactive el módulo.

drop policy if exists staff_escribe_mensajes_equipo on mensajes_equipo;

create policy staff_escribe_mensajes_equipo on mensajes_equipo
  for insert with check (
    studio_id = current_studio_id()
    and (
      exists (
        select 1 from instructores i
        where i.id = autor_instructor_id
          and i.studio_id = mensajes_equipo.studio_id
          and i.auth_user_id = auth.uid()
      )
      or (
        autor_instructor_id is null
        and exists (
          select 1 from studios s
          where s.id = mensajes_equipo.studio_id and s.owner_auth_user_id = auth.uid()
        )
      )
    )
  );
