-- productos_pos tenía ALL para authenticated con solo studio_id, sin rol —
-- a diferencia de ventas_pos, que ya exige puede_mover_dinero() para
-- escribir y puede_ver_finanzas() para leer. Cualquier staff autenticado
-- (incluida INSTRUCTOR) podía crear/editar/borrar el catálogo de productos
-- POS (nombre, precio, stock) desde la consola del navegador. Impacto bajo
-- (Kiosko/POS está en feature-freeze, sin UI viva, y esta tabla no mueve
-- dinero directamente — ventas_pos sí está bien cerrada), pero es el mismo
-- patrón "rol no comprobado" que el resto de esta sesión, y barato de cerrar.
-- Se le da exactamente el mismo shape que ventas_pos para que ambas tablas
-- del mismo módulo compartan la misma regla.

drop policy if exists admin_productos_pos on productos_pos;

create policy productos_pos_lectura on productos_pos
  for select using (studio_id = current_studio_id() and puede_ver_finanzas());

create policy productos_pos_escritura_insert on productos_pos
  for insert with check (studio_id = current_studio_id() and puede_mover_dinero());

create policy productos_pos_escritura_update on productos_pos
  for update using (studio_id = current_studio_id() and puede_mover_dinero())
  with check (studio_id = current_studio_id() and puede_mover_dinero());

create policy productos_pos_escritura_delete on productos_pos
  for delete using (studio_id = current_studio_id() and puede_mover_dinero());
