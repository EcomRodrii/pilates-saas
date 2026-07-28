-- 0086 · Pentest L1 — cerrar la lectura anónima cross-tenant de horarios y tarifas.
--
-- `public_read_sesiones` y `public_read_planes_tarifa` (definidas en 0000_base)
-- daban SELECT a `anon` con USING (true): cualquiera con la anon key pública
-- podía leer las sesiones y las tarifas de TODOS los estudios, no solo el que
-- se está reservando (verificado en el pentest: 56 sesiones + 4 tarifas legibles
-- como anónimo cross-tenant).
--
-- La página pública /reservar NO lee estas tablas con la anon key: los datos
-- llegan por la ruta de servidor `fetchPublicStudioData` (service-role), que no
-- pasa por RLS. Estas políticas eran, por tanto, código muerto. Se eliminan:
--   · anon  -> deja de tener lectura directa (RLS activo sin política = denegado).
--   · panel (authenticated) -> sigue acotado por estudio (admin_*).
--   · servidor (service-role) -> sin cambios (ignora RLS).
-- Idempotente.

drop policy if exists public_read_sesiones on public.sesiones;
drop policy if exists public_read_planes_tarifa on public.planes_tarifa;
