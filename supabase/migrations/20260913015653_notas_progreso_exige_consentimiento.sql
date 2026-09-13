-- `notas_progreso` guarda el progreso, las alertas (lesiones, limitaciones) y
-- el plan de la próxima sesión de una socia: dato de salud (art. 9 RGPD), igual
-- que `condiciones_salud`, `respuestas_sesion`, `respuestas_cuestionario_salud`
-- y `valoraciones_iniciales_salud`. Era la única de esas tablas que seguía con
-- la política original de 0095 (`salud_notas_progreso`, FOR ALL: studio_id +
-- rol), sin `tiene_consentimiento_salud(socio_id)`. Una instructora podía
-- escribir y leer notas de una socia sin consentimiento de salud vigente.
--
-- Mismo patrón que 20260909100523 (respuestas_sesion): se sustituye la política
-- FOR ALL por una por operación, las cuatro con el gate de consentimiento en
-- USING y en WITH CHECK. No cambia ninguna firma de función, así que no hay que
-- volver a conceder EXECUTE; `tiene_consentimiento_salud(text)` ya es
-- ejecutable por `authenticated` (y no por `anon`).
--
-- `socio_id` admite NULL en esta tabla: con NULL la función devuelve NULL y la
-- fila queda fuera. Una nota de salud sin socia no tiene sentido de negocio y
-- el cliente siempre la manda con socia.

drop policy if exists salud_notas_progreso on public.notas_progreso;
drop policy if exists salud_notas_progreso_select on public.notas_progreso;
drop policy if exists salud_notas_progreso_insert on public.notas_progreso;
drop policy if exists salud_notas_progreso_update on public.notas_progreso;
drop policy if exists salud_notas_progreso_delete on public.notas_progreso;

create policy salud_notas_progreso_select on public.notas_progreso
  for select to authenticated
  using (
    studio_id = current_studio_id()
    and current_rol() in ('PROPIETARIO', 'INSTRUCTOR')
    and public.tiene_consentimiento_salud(socio_id)
  );

create policy salud_notas_progreso_insert on public.notas_progreso
  for insert to authenticated
  with check (
    studio_id = current_studio_id()
    and current_rol() in ('PROPIETARIO', 'INSTRUCTOR')
    and public.tiene_consentimiento_salud(socio_id)
  );

create policy salud_notas_progreso_update on public.notas_progreso
  for update to authenticated
  using (
    studio_id = current_studio_id()
    and current_rol() in ('PROPIETARIO', 'INSTRUCTOR')
    and public.tiene_consentimiento_salud(socio_id)
  )
  with check (
    studio_id = current_studio_id()
    and current_rol() in ('PROPIETARIO', 'INSTRUCTOR')
    and public.tiene_consentimiento_salud(socio_id)
  );

create policy salud_notas_progreso_delete on public.notas_progreso
  for delete to authenticated
  using (
    studio_id = current_studio_id()
    and current_rol() in ('PROPIETARIO', 'INSTRUCTOR')
    and public.tiene_consentimiento_salud(socio_id)
  );
