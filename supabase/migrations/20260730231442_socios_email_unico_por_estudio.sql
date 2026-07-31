-- El alta manual de clienta ("Nueva clienta" en /clientas) no comprobaba
-- duplicados de email antes de insertar — solo el importador CSV deduplicaba
-- (`app/api/socios/import/route.ts:65-78`). Cualquiera con permiso de
-- clientas podía crear la misma persona N veces con el mismo email desde el
-- alta manual, sin ningún aviso: fichas repetidas, cada una con su propia
-- suscripción/recibo si se le asignaba plan.
--
-- Verificado en producción antes de aplicar: 0 filas duplicadas hoy
-- (studio_id, lower(email)) entre socias vivas, así que el constraint entra
-- limpio. Excluye `borrado_en` a propósito: dar de baja a una socia y luego
-- apuntar a una persona NUEVA con ese mismo email (o que la propia socia
-- vuelva a apuntarse) no debe chocar con su ficha dada de baja.
--
-- Sustituye al índice normal `idx_socios_studio_email` por uno único sobre
-- las mismas columnas (mismo coste de mantenimiento, cierra el hueco) en vez
-- de mantener los dos.
--
-- NOTA (2026-07-31): este fichero se renombró de 20260731150000 a este
-- timestamp porque otra sesión en paralelo ya había aplicado esta misma
-- migración (con este contenido correcto) directamente contra producción
-- bajo el nombre "socios_email_unico_por_estudio" — la versión anterior de
-- este fichero (sin excluir borrado_en) NUNCA llegó a aplicarse; ver
-- 20260731150100_fix_socios_email_unico_excluye_borrado.sql, escrito para
-- corregir precisamente ese fallo antes de que se aplicara.
drop index if exists public.idx_socios_studio_email;

create unique index uq_socios_studio_email on public.socios (studio_id, lower(email))
  where email is not null and borrado_en is null;
