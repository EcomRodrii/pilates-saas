-- ═══════════════════════════════════════════════════════════════════════════
-- 0050 · TENTARE — consumir un código de descuento de forma ATÓMICA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Bug encontrado probando el canje en vivo: la venta aplicaba el descuento
-- correctamente pero `usos` NUNCA subía, así que un código de un solo uso se
-- podía canjear infinitas veces.
--
-- Causa: el store hacía
--     let usos = 0;
--     setCodigosDescuento(prev => ...)   -- el updater de React corre DESPUÉS
--     dbUpdateCodigoDescuento(id, { usos })  -- usos seguía valiendo 0
-- y escribía 0 en la base de datos.
--
-- Se arregla en el cliente, pero el incremento se mueve aquí porque es dinero y
-- el POS puede estar abierto en dos sitios a la vez:
--   · `usos = usos + 1` en el propio UPDATE evita perder incrementos simultáneos
--     (leer-modificar-escribir desde el cliente sí los pierde),
--   · el WHERE hace cumplir `usos_max` EN LA BASE DE DATOS: si el código ya está
--     agotado no se consume y devuelve NULL, así que dos terminales no pueden
--     canjear a la vez el último uso.
--
-- Sin SECURITY DEFINER a propósito: corre con los permisos de quien llama, así
-- que la RLS de codigos_descuento sigue aplicando (cada estudio, lo suyo).
-- Reversible: DROP FUNCTION.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.consumir_codigo_descuento(p_codigo_id text)
RETURNS integer
LANGUAGE sql
SET search_path = public, pg_temp
AS $$
  UPDATE public.codigos_descuento
     SET usos = COALESCE(usos, 0) + 1
   WHERE id = p_codigo_id
     AND activo = true
     AND (usos_max IS NULL OR COALESCE(usos, 0) < usos_max)
  RETURNING usos;
$$;

GRANT EXECUTE ON FUNCTION public.consumir_codigo_descuento(text) TO authenticated, service_role;
