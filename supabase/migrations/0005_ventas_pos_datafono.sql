-- ═══════════════════════════════════════════════════════════════════════════
-- 0005 · C-4: admitir 'DATAFONO' como método de pago en ventas_pos
-- ═══════════════════════════════════════════════════════════════════════════
--
-- CONTEXTO (due diligence, hallazgo C-4)
-- El TPV (app/(dashboard)/pos/page.tsx:39,337) ofrece "Datáfono" y persiste la
-- venta con metodo_pago = 'DATAFONO' (lib/types.ts:294). Pero el CHECK de
-- producción solo admite EFECTIVO/TARJETA/BIZUM/TRANSFERENCIA
-- (0000_base.sql:1086), así que el INSERT viola la restricción y falla. El
-- error lo traga reportDbError mientras la UI ya mostró el overlay de éxito
-- (y, en el flujo con datáfono físico, la tarjeta YA se cobró) → cada venta
-- con datáfono se pierde del registro de ventas y de la facturación: dinero
-- cobrado sin fila ni factura, e IVA no registrado.
--
-- Fix: recrear el CHECK incluyendo 'DATAFONO'. Compatible hacia atrás (solo
-- amplía el conjunto permitido; ninguna fila existente lo incumple).
--
-- Nota: la integración con Stripe Terminal sigue rota en prod por columnas
-- ausentes en `studios` (hallazgo A-1/C-7) — eso se arregla aparte. Este CHECK
-- desbloquea también el datáfono NO integrado (el estudio marca "Datáfono"
-- manualmente tras cobrar en su TPV externo), que es un caso real e inmediato.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.ventas_pos
  DROP CONSTRAINT IF EXISTS ventas_pos_metodo_pago_check;

ALTER TABLE public.ventas_pos
  ADD CONSTRAINT ventas_pos_metodo_pago_check
  CHECK (metodo_pago = ANY (ARRAY['EFECTIVO'::text, 'TARJETA'::text, 'BIZUM'::text, 'TRANSFERENCIA'::text, 'DATAFONO'::text]));
