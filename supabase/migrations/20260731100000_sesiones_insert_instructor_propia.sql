-- ─────────────────────────────────────────────────────────────────────────────
-- Segundo tramo del autoservicio de instructora (tras 20260730109000, que abrió
-- UPDATE en su propia clase): ahora puede CREAR clases nuevas, siempre y
-- solamente asignadas a sí misma. Crear la clase de OTRA instructora, o de
-- cualquier sala/estudio ajeno, sigue vedado — sin cambios para
-- PROPIETARIO/MANAGER/RECEPCION, que mantienen control total.
--
-- Mismo patrón exacto que `sesiones_escritura_update` (20260730109000): el
-- `with_check` exige que la fila NUEVA sea de su propia ficha
-- (`instructor_id = current_instructor_id()`), reutilizando esa función sin
-- tocarla. Las exclusion constraints ya existentes (`sesiones_instructor_sin_
-- solape`, 0048; `sesiones_sala_sin_solape`, 0074) siguen aplicando igual a
-- este INSERT: no hace falta reimplementar la comprobación de choque de
-- horario.
--
-- Crear SERIES (clases recurrentes) queda FUERA de este cambio a propósito:
-- `editar_serie_desde` ya decidió en 20260730110000 que gestionar series es
-- territorio de `puede_gestionar_calendario()` — abrirlo aquí de rebote
-- reabriría esa decisión sin que se haya pedido.
--
-- Reversible: volver al `with_check` de solo `puede_gestionar_calendario()`.
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists sesiones_escritura_insert on public.sesiones;

create policy sesiones_escritura_insert on public.sesiones
  for insert to authenticated
  with check (
    studio_id = public.current_studio_id()
    and (
      public.puede_gestionar_calendario()
      or (public.current_rol() = 'INSTRUCTOR' and instructor_id = public.current_instructor_id())
    )
  );
