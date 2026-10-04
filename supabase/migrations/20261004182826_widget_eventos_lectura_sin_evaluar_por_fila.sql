-- El embudo del widget (Configuración → Tentare Widgets) daba «statement
-- timeout» con apenas ~2.000 filas en `widget_eventos` (Sentry, 4-oct-2026).
-- Causa: la política llamaba a `current_studio_id()` y `current_rol()` a pelo,
-- y Postgres las evaluaba FILA A FILA (cada una consulta `instructores`/
-- `studios`): 413 ms y 12.000 buffers para contar 221 eventos, con picos de 4 s.
-- Envueltas en `(select …)` se evalúan UNA vez por consulta (InitPlan):
-- 20 ms y 1.800 buffers, medido como la propietaria dentro de una transacción
-- deshecha. Misma regla, mismo resultado: solo cambia cuántas veces se calcula.
--
-- ⚠️ El mismo patrón está en muchas más políticas de `public`; esta es la
-- única que ha llegado a cortar una consulta. Cambiarlas todas es otra pieza.
alter policy widget_eventos_lectura on public.widget_eventos
  using (
    studio_id = (select public.current_studio_id())
    and (select public.current_rol()) = any (array['PROPIETARIO'::text, 'MANAGER'::text])
  );
