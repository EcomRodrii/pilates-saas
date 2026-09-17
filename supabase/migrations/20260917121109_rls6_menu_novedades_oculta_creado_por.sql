-- RLS-6 (auditoría 2026-09-16): `menu_novedades` tiene una única policy
-- `USING(true)` (es una tabla global a propósito, sin studio_id — el badge
-- "Nuevo" del menú es el mismo para todo el mundo) y GRANT SELECT de tabla
-- completa a `authenticated`, así que cualquier sesión de staff puede leer
-- `creado_por` (el UUID del admin interno que dio de alta la novedad) con
-- una query REST directa, aunque el cliente real
-- (lib/menu-novedades-cliente.ts) solo pida `href`.
--
-- ⚠️ Un `REVOKE SELECT (creado_por)` a secas NO basta — trampa ya documentada
-- en este repo (memoria de sesión "revoke-columna-no-resta-de-grant-tabla"):
-- `authenticated` tiene un GRANT de TABLA completa (`relacl` = `rm`, no por
-- columnas), y un REVOKE por columna no resta nada de un GRANT que ya cubre
-- la tabla entera. Verificado en vivo: tras el REVOKE de columna a secas,
-- `has_column_privilege('authenticated', ..., 'creado_por', 'SELECT')` seguía
-- devolviendo `true`. La forma correcta es revocar la TABLA y volver a
-- conceder SOLO las columnas seguras — verificado en vivo antes y después.
revoke select on public.menu_novedades from authenticated;
grant select (href, creado_en) on public.menu_novedades to authenticated;
