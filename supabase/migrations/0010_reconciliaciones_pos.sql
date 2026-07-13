-- ═══════════════════════════════════════════════════════════════════════════
-- 0010 · A-14 (parte 2): backstop de cobros por datáfono no reconciliados
-- ═══════════════════════════════════════════════════════════════════════════
--
-- CONTEXTO (due diligence, hallazgo A-14)
-- El cobro por datáfono es server-driven (app/api/terminal/cobrar) pero la VENTA
-- (fila ventas_pos + recibo COBRADO + factura) la crea el cliente en el POS solo
-- cuando su polling ve el PaymentIntent en 'succeeded' (pos/page.tsx). Si la
-- clienta pasa la tarjeta y el cobro se confirma en Stripe pero el navegador se
-- cierra o pierde red antes de registrar la venta, el dinero se cobró y NO queda
-- ningún registro: descuadre de caja y factura/IVA no emitidos.
--
-- Backstop: un webhook payment_intent.succeeded (origen='pos_terminal') deja un
-- marcador de "cobro pendiente de reconciliar" idempotente por PaymentIntent. El
-- POS lo muestra para que el staff complete la venta con un clic; el flujo normal
-- lo marca RECONCILIADO al registrar la venta, así que solo quedan los huérfanos.
--
-- Acceso: SOLO service_role (webhook + endpoints con verificarSesionStaff). RLS
-- activada sin políticas → deny-by-default para anon/authenticated, coherente con
-- la dirección server-authoritative (A-1/A-2). Reversible: el DROP no afecta a
-- ninguna tabla existente.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE public.reconciliaciones_pos (
    payment_intent_id text PRIMARY KEY,
    studio_id         text NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
    importe           numeric(10,2) NOT NULL,
    concepto          text,
    estado            text NOT NULL DEFAULT 'PENDIENTE'
                        CHECK (estado IN ('PENDIENTE','RECONCILIADO','DESCARTADO')),
    venta_id          text,
    creado_en         timestamptz NOT NULL DEFAULT now(),
    reconciliado_en   timestamptz
);

-- Lo único que se consulta: los pendientes de un estudio, más recientes primero.
CREATE INDEX reconciliaciones_pos_pendientes
  ON public.reconciliaciones_pos (studio_id, creado_en DESC)
  WHERE estado = 'PENDIENTE';

-- Deny-by-default: RLS activa y sin políticas bloquea a anon/authenticated; el
-- service_role (webhook + endpoints de servidor) la salta (BYPASSRLS en Supabase).
-- El base hace ALTER DEFAULT PRIVILEGES ... GRANT ALL a anon/authenticated para
-- las tablas nuevas de public, así que se REVOCA explícitamente: sin la RLS (ya
-- de por sí suficiente) tampoco hay grant de tabla para el cliente.
ALTER TABLE public.reconciliaciones_pos ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.reconciliaciones_pos TO service_role;
REVOKE ALL ON TABLE public.reconciliaciones_pos FROM anon, authenticated;
