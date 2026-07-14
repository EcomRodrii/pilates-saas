-- ═══════════════════════════════════════════════════════════════════════════
-- 0017 · FIX de drift: aplica realmente las columnas de Marca + IVA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- CONTEXTO (incidencia)
-- La migración 0014_marca_e_iva.sql (logo_url + iva_por_defecto) NUNCA llegó a
-- producción: en prod la versión "0014" del historial ya estaba ocupada por
-- 0014_rls_ficha_clinica_salud.sql (un fix de seguridad aplicado antes y no
-- commiteado a git). `supabase migration list` cuadra por NÚMERO, así que 0014
-- aparecía como aplicada aunque su contenido real fuera otro → las columnas no
-- existían y el sellado de factura (`api/facturas/sellar` hace
-- select('nif, iva_por_defecto')) fallaba en producción.
--
-- Esta migración re-aplica el DDL de 0014_marca_e_iva bajo un número libre.
-- Es idempotente (ADD COLUMN IF NOT EXISTS): si algún entorno ya tenía las
-- columnas, no hace nada. Reversible: DROP COLUMN.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.studios
  ADD COLUMN IF NOT EXISTS logo_url text;

ALTER TABLE public.studios
  ADD COLUMN IF NOT EXISTS iva_por_defecto numeric(5,2) NOT NULL DEFAULT 21;
