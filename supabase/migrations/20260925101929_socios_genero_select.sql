-- TENTARE — corrección de 20260925013446_socios_genero.sql.
--
-- Aquella migración concedió INSERT y UPDATE de `genero` a `authenticated` pero no
-- SELECT. `authenticated` lee `socios` SOLO por lista de columnas (no tiene SELECT de
-- tabla), así que la consulta del panel que pide `genero` fallaba entera con
-- «permission denied for column genero» y la lista de Clientas salía vacía
-- («Aún no hay clientas») aunque las tarjetas contaran 21.
--
-- Una columna nueva de `socios` necesita los TRES grants por columna.
grant select (genero) on public.socios to authenticated;
