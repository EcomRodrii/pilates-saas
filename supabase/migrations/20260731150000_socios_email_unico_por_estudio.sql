-- El alta manual de clienta ("Nueva clienta" en /clientas) no comprobaba
-- duplicados de email antes de insertar — solo el importador CSV deduplicaba
-- (`app/api/socios/import/route.ts:65-78`). Cualquiera con permiso de
-- clientas podía crear la misma persona N veces con el mismo email desde el
-- alta manual, sin ningún aviso: fichas repetidas, cada una con su propia
-- suscripción/recibo si se le asignaba plan.
--
-- `email` es NOT NULL en `socios` (0000_base.sql) — sin nulos que gestionar.
-- Verificado en producción antes de aplicar: 0 filas duplicadas hoy
-- (studio_id, lower(email)), así que el constraint entra limpio.
--
-- Sustituye al índice normal `idx_socios_studio_email` por uno único sobre
-- las mismas columnas (mismo coste de mantenimiento, cierra el hueco) en vez
-- de mantener los dos.
drop index if exists public.idx_socios_studio_email;

create unique index socios_studio_email_unico on public.socios (studio_id, lower(email));
