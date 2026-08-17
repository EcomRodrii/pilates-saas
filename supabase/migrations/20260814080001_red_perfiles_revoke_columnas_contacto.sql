-- ⚠️ ESTA MIGRACIÓN NO TUVO NINGÚN EFECTO. Se conserva únicamente porque está
-- registrada como aplicada en producción (versión 20260814080001) y el fichero
-- no existía en ninguna rama; sin él, el catálogo del repo y el de la BD no
-- cuadran en ninguna dirección. NO es el arreglo del agujero que describe.
--
-- En PostgreSQL un privilegio de COLUMNA no se resta de un privilegio de TABLA:
-- como `authenticated` conservaba el GRANT SELECT sobre la tabla entera (el
-- default de Supabase, `authenticated=arwdDxtm` en pg_class.relacl), el
-- `revoke select (columna)` de abajo se ejecutó sin error y dejó el agujero
-- intacto durante 3 días con la ficha marcada como cerrada. Medido el 17 ago:
-- has_column_privilege('authenticated', ..., 'email_contacto','SELECT') => true.
--
-- El cierre real son 20260817144333 (revoke del SELECT de TABLA) y su
-- complemento obligatorio 20260817144931 (grant mínimo para las policies).
-- Lee esas dos, no esta.
--
-- ------------------------------------------------------------------------
-- Cabecera original, tal y como se aplicó (su diagnóstico era correcto; lo que
-- falló fue el remedio):
--
-- red_perfiles: el email y el teléfono dejan de ser legibles por REST
--
-- La policy de lectura (20260813111206:51-53) es correcta en su intención
-- —`for select to authenticated using (estado = 'published')`— pero RLS filtra
-- FILAS, no COLUMNAS. Como `authenticated` conserva el GRANT SELECT de todas las
-- columnas de la tabla, cualquier persona con una cuenta (el alta es abierta:
-- app/network/unirse) podía pedir directamente a PostgREST con la anon key:
--
--   /rest/v1/red_perfiles?estado=eq.published&select=nombre,email_contacto,telefono_contacto
--
-- y volcar los datos de contacto de toda la red. Comprobado contra producción el
-- 14 ago 2026: `information_schema.column_privileges` daba SELECT a
-- `authenticated` sobre email_contacto, telefono_contacto y auth_user_id.
--
-- Esto contradecía el diseño ya escrito en 20260813111231:124-125 ("email_contacto
-- /telefono_contacto solo se revelan en el envío de notificación al aceptar, nunca
-- por API a listados"): el flujo de solicitud → aceptación era decorativo mientras
-- la columna fuese legible por REST.
--
-- `auth_user_id` se revoca por lo mismo: permitía enumerar UUIDs de auth.users.
--
-- Por qué esto NO rompe nada: las tres rutas que sí leen estas columnas
-- (app/api/network/perfil/route.ts, perfil/estado/route.ts y
-- contacto/resolver/route.ts) usan getSupabaseAdmin() → service_role, que no pasa
-- por GRANTs ni por RLS. Las rutas de listado ya seleccionaban solo columnas
-- públicas (SELECT_COLUMNAS_PUBLICAS en buscar/route.ts y perfil/[id]/route.ts, y
-- el tipo FilaRedPerfilPublica en lib/network/mapeo.ts:35 las excluye por tipo).
-- Ningún componente de cliente consulta red_perfiles directamente.

revoke select (email_contacto, telefono_contacto, auth_user_id)
  on public.red_perfiles from authenticated;

revoke select (email_contacto, telefono_contacto, auth_user_id)
  on public.red_perfiles from anon;
