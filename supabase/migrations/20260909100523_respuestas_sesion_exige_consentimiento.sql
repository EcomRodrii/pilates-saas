-- 38ª pasada de auditoría (2026-09-09): `respuestas_sesion` era la tercera
-- tabla de datos de salud (art. 9 RGPD) y la única que se había quedado con
-- la RLS original de 0095 (studio_id + rol, sin `tiene_consentimiento_salud`),
-- a diferencia de `condiciones_salud` (20260829235608) y
-- `respuestas_cuestionario_salud` (20260831075322). Un instructor podía
-- registrar MEJOR/IGUAL/MOLESTIAS/DOLOR de una socia sin consentimiento
-- vigente, y ese dato alimenta `nivelRiesgo` (lib/ficha-clinica.ts).
--
-- Impacto real verificado antes de aplicar (execute_sql, solo lectura):
-- 2 filas en toda la tabla, ambas de socias sin consentimiento vigente,
-- 1 solo estudio — impacto teórico, no un problema de negocio en curso.
--
-- A diferencia de la migración gemela de `condiciones_salud` (que solo tocó
-- SELECT/UPDATE/DELETE porque el INSERT ya tenía el gate desde 0138), aquí
-- NINGUNA de las 4 operaciones lo tenía, así que las 4 lo incorporan.

drop policy if exists salud_respuestas_sesion on public.respuestas_sesion;

create policy salud_respuestas_sesion_select on public.respuestas_sesion
  for select to authenticated
  using (
    studio_id = current_studio_id()
    and current_rol() in ('PROPIETARIO', 'INSTRUCTOR')
    and public.tiene_consentimiento_salud(socio_id)
  );

create policy salud_respuestas_sesion_insert on public.respuestas_sesion
  for insert to authenticated
  with check (
    studio_id = current_studio_id()
    and current_rol() in ('PROPIETARIO', 'INSTRUCTOR')
    and public.tiene_consentimiento_salud(socio_id)
  );

create policy salud_respuestas_sesion_update on public.respuestas_sesion
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

create policy salud_respuestas_sesion_delete on public.respuestas_sesion
  for delete to authenticated
  using (
    studio_id = current_studio_id()
    and current_rol() in ('PROPIETARIO', 'INSTRUCTOR')
    and public.tiene_consentimiento_salud(socio_id)
  );
