-- ═══════════════════════════════════════════════════════════════════════════
-- 0008 · C-7/A-1: añadir a prod las columnas de Stripe Terminal
-- ═══════════════════════════════════════════════════════════════════════════
--
-- CONTEXTO (due diligence, hallazgos C-7 y A-1)
-- El código (lib/supabase-data.ts:227-240 dbSetTerminalReader,
-- app/api/terminal/lector/route.ts:31) y los tipos (lib/db-types.ts:27-28)
-- referencian studios.stripe_terminal_reader_id / _location_id, y
-- supabase/schema.sql:551-552 las declara — pero NUNCA se migraron a producción
-- (no están en 0000_base ni en 0001-0007). Resultado: leer/escribir esas
-- columnas en prod da `42703 column does not exist` → toda la feature de Stripe
-- Terminal (datáfono) estaba rota, y era una de las tres discrepancias del drift
-- prod ↔ schema.sql ↔ tipos (C-7).
--
-- Fix: añadirlas (additive, seguro). Tras esto prod coincide con schema.sql y
-- con los tipos en estas columnas, y la feature Terminal puede configurarse.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.studios ADD COLUMN IF NOT EXISTS stripe_terminal_reader_id text;
ALTER TABLE public.studios ADD COLUMN IF NOT EXISTS stripe_terminal_location_id text;
