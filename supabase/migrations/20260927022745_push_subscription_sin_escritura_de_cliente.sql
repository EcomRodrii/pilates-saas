-- Auditoría de notificaciones (27-sep-2026). `push_all` era FOR ALL con solo
-- `user_id = auth.uid()`: cualquier cuenta podía INSERTAR/ACTUALIZAR filas
-- directamente con la clave anónima, saltándose las comprobaciones de
-- /api/notifications/subscribe (pertenencia al estudio de `studio_id`) y
-- pudiendo fijar `failure_count`/`last_used_at` a su gusto. Todas las escrituras
-- reales van por esa ruta con service-role; el cliente solo necesita ver y borrar
-- LO SUYO.
--
-- Verificado en producción con un DO revertido, con el rol `authenticated`:
-- INSERT y UPDATE → 42501; SELECT y DELETE de lo propio → permitidos.

drop policy if exists push_all on public.push_subscription;

create policy push_propia_lectura on public.push_subscription
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy push_propia_borrado on public.push_subscription
  for delete to authenticated
  using (user_id = (select auth.uid()));

revoke insert, update on table public.push_subscription from authenticated;
revoke all on table public.push_subscription from anon;
