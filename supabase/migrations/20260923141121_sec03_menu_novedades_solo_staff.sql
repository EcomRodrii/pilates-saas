-- SEC-03 (auditoría 23-sep): `menu_novedades_lectura_staff` era la ÚNICA policy
-- con `USING (true)` de todo el esquema. El nombre y el comentario de
-- `lib/menu-novedades-cliente.ts` dicen "para cualquier STAFF", pero la
-- condición dejaba leerla a cualquier `authenticated` — incluida una alumna
-- con sesión. Es contenido de changelog (qué novedades destacar en el menú
-- del panel), no datos de cliente: severidad baja, pero es exactamente el
-- tipo de policy que una revisión rápida da por buena por su nombre.
--
-- `current_rol()` devuelve el rol del que llama en el estudio activo
-- (PROPIETARIO/MANAGER/RECEPCION/INSTRUCTOR) o NULL si no tiene ninguno, así
-- que `IS NOT NULL` = "es personal de algún estudio". Envuelta en
-- `(select …)` para que Postgres la evalúe una vez por consulta y no por fila
-- (el mismo patrón de initplan que ya corrigieron `rls_auth_initplan_fix`).
--
-- Verificado en vivo con roles reales (SET LOCAL ROLE authenticated +
-- request.jwt.claims) dentro de una transacción revertida: una socia pura
-- (sin fila en `instructores` ni estudio propio) pasa de ver 1 fila a 0; la
-- propietaria sigue viendo 1. Sin cambio de firma ni de grants: solo la
-- condición de la policy.
drop policy if exists menu_novedades_lectura_staff on public.menu_novedades;
create policy menu_novedades_lectura_staff on public.menu_novedades
  for select to authenticated
  using ((select public.current_rol()) is not null);
