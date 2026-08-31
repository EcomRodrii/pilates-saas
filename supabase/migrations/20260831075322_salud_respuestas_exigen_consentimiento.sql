-- respuestas_cuestionario_salud: SELECT/UPDATE/DELETE no comprobaban el
-- consentimiento de salud; su gemela condiciones_salud SÍ lo hace en las
-- cuatro operaciones, y el propio INSERT de esta tabla también.
--
-- Es el fallo de gemelos de siempre: se cerró una tabla y no la hermana.
-- lib/types.ts documenta la intención ("Misma RLS que condiciones_salud …
-- rol + tiene_consentimiento_salud") y la implementación no la cumplía.
--
-- Hoy la tabla tiene 0 filas en producción, así que no hay fuga consumada:
-- es una mina que estalla en cuanto la funcionalidad se use. De referencia,
-- condiciones_salud tiene 4 filas y 2 SIN consentimiento — el caso ocurre en
-- datos reales, solo que en la tabla que sí está protegida.
--
-- Se replica literalmente el predicado de salud_condiciones_salud_*.
--
-- Verificado en producción con control POSITIVO (INSERT temporal + rollback
-- por `raise exception`, como INSTRUCTOR del estudio):
--   con consentimiento = 1 fila · sin consentimiento = 0 · otro estudio = 0.

drop policy if exists respuestas_cuestionario_salud_lectura on public.respuestas_cuestionario_salud;
create policy respuestas_cuestionario_salud_lectura
  on public.respuestas_cuestionario_salud for select to authenticated
  using (
    studio_id = current_studio_id()
    and current_rol() = any (array['PROPIETARIO', 'INSTRUCTOR'])
    and tiene_consentimiento_salud(socio_id)
  );

drop policy if exists respuestas_cuestionario_salud_update on public.respuestas_cuestionario_salud;
create policy respuestas_cuestionario_salud_update
  on public.respuestas_cuestionario_salud for update to authenticated
  using (
    studio_id = current_studio_id()
    and current_rol() = any (array['PROPIETARIO', 'INSTRUCTOR'])
    and tiene_consentimiento_salud(socio_id)
  )
  with check (
    studio_id = current_studio_id()
    and current_rol() = any (array['PROPIETARIO', 'INSTRUCTOR'])
    and tiene_consentimiento_salud(socio_id)
  );

drop policy if exists respuestas_cuestionario_salud_delete on public.respuestas_cuestionario_salud;
create policy respuestas_cuestionario_salud_delete
  on public.respuestas_cuestionario_salud for delete to authenticated
  using (
    studio_id = current_studio_id()
    and current_rol() = any (array['PROPIETARIO', 'INSTRUCTOR'])
    and tiene_consentimiento_salud(socio_id)
  );
