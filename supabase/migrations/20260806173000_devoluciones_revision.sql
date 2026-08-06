-- ─────────────────────────────────────────────────────────────────────────────
-- Devoluciones: que el estudio se entere, y quede por qué NO se deshizo.
--
-- Hoy un reembolso TOTAL marca el recibo DEVUELTO y nada más — la socia se queda
-- con el bono recargado. Y un reembolso PARCIAL no entra siquiera al handler:
-- no marca nada, no avisa a nadie, no deja rastro. El comentario del código dice
-- que los parciales "requieren ajuste manual del estudio", pero nada le dice al
-- estudio que haya algo que ajustar. Y el parcial es justo lo que hace una
-- propietaria sensata cuando la socia ya usó parte del bono: el caso más
-- correcto es el más invisible.
--
-- Tabla propia y no columnas en `recibos`, por tres razones:
--  1. Una devolución NO es 1:1 con el recibo. Dos parciales, o parcial +
--     chargeback posterior, son N filas sobre el mismo cobro.
--  2. El parcial no puede marcar el recibo: `recibos_estado_check` no tiene un
--     estado "devuelto en parte", y añadirlo obligaría a revisar todo lo que
--     ramifica por `estado` (informes, dunning, cierre, facturas, /cobros).
--  3. Hace falta auditar POR QUÉ no se propuso deshacer nada — el mismo valor
--     que tienen los OMITIDA_* de `penalizaciones` (migr 20260730225253), que
--     es el patrón que esta tabla copia.
--
-- ⚠️ `unique (studio_id, referencia)` NO es decorativo. `reclamarWebhookEvent`
-- expira a los 120 s y falla ABIERTO, así que el handler se re-ejecuta de
-- verdad; hoy eso da igual solo porque el UPDATE del recibo es idempotente, y un
-- INSERT no lo es. Con la referencia como clave natural:
--   · un reintento de Stripe no duplica,
--   · un SEGUNDO reembolso parcial sí crea fila (el acumulado es distinto),
--   · y un reembolso hecho DURANTE una disputa —que dispara `charge.refunded` Y
--     `charge.dispute.closed` con status `charge_refunded` por el mismo dinero—
--     colapsa en UNA sola tarjeta en vez de dos.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.devoluciones (
  id             text PRIMARY KEY,
  studio_id      text NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  recibo_id      text NOT NULL REFERENCES public.recibos(id) ON DELETE CASCADE,
  socio_id       text REFERENCES public.socios(id) ON DELETE SET NULL,
  -- Copia congelada: la suscripción puede cambiar de manos o desaparecer, y la
  -- devolución tiene que seguir contando lo que pasó.
  suscripcion_id text,
  origen         text NOT NULL CHECK (origen IN ('REEMBOLSO_TOTAL', 'REEMBOLSO_PARCIAL', 'CHARGEBACK')),
  -- Foto del recibo al detectar, para que la aritmética de la card no dependa
  -- de que nadie haya tocado el recibo después.
  importe_cobrado  numeric(10,2) NOT NULL,
  importe_devuelto numeric(10,2) NOT NULL,
  stripe_charge_id text,
  -- Clave natural del hecho de Stripe. Ver el comentario de arriba.
  referencia     text NOT NULL,
  estado         text NOT NULL DEFAULT 'PENDIENTE_REVISION' CHECK (estado IN (
    'PENDIENTE_REVISION',
    'REVERTIDA',
    'DESCARTADA',                 -- decisión explícita: doble cargo, cortesía…
    'OMITIDA_SIN_ENTREGA',        -- el cobro no entregó nada (entrega_aplicada = false)
    'OMITIDA_SIN_INSTRUMENTAR',   -- cobro anterior al snapshot (entrega_aplicada IS NULL)
    'OMITIDA_ESTADO_CAMBIADO'     -- la suscripción se movió desde la entrega
  )),
  -- Qué se le enseñó y qué se escribió de verdad. Sin esto, un "revertida" no
  -- dice cuánto se quitó ni sobre qué números se decidió.
  propuesta      jsonb,
  aplicado       jsonb,
  detectada_en   timestamptz NOT NULL DEFAULT now(),
  resuelta_en    timestamptz,
  resuelta_por   uuid,
  UNIQUE (studio_id, referencia)
);

COMMENT ON TABLE public.devoluciones IS
  'Una fila por hecho de devolución de Stripe (reembolso total, parcial o chargeback perdido). Los estados OMITIDA_* existen para poder auditar por que NO se propuso deshacer la entrega, sin leer logs.';
COMMENT ON COLUMN public.devoluciones.referencia IS
  'Clave natural del hecho en Stripe: <charge_id>:<amount_refunded> para reembolsos, dispute:<id> para el chargeback perdido. Con el UNIQUE, un reintento del webhook no duplica y un reembolso durante una disputa no genera dos tarjetas.';

-- Solo los pendientes se consultan desde la card: índice parcial, mismo criterio
-- que `idx_penalizaciones_pendientes`.
CREATE INDEX IF NOT EXISTS idx_devoluciones_pendientes
  ON public.devoluciones (studio_id, detectada_en)
  WHERE estado = 'PENDIENTE_REVISION';
-- Los FK, por el advisor `unindexed_foreign_keys`.
CREATE INDEX IF NOT EXISTS idx_devoluciones_recibo ON public.devoluciones (recibo_id);
CREATE INDEX IF NOT EXISTS idx_devoluciones_socio ON public.devoluciones (socio_id);

ALTER TABLE public.devoluciones ENABLE ROW LEVEL SECURITY;

-- Lectura: quien puede ver el dinero del estudio. `puede_ver_finanzas()` (0114)
-- ya deja fuera a MANAGER — se reutiliza en vez de repetir la lista de roles a
-- mano, que es lo que hace `penalizaciones` y que ya obliga a mantener dos
-- sitios cuando cambia el criterio.
CREATE POLICY devoluciones_lectura ON public.devoluciones
  FOR SELECT TO authenticated
  USING (studio_id = public.current_studio_id() AND public.puede_ver_finanzas());

-- Sin política de escritura A PROPÓSITO: todo el ciclo lo escribe service_role
-- (el webhook detecta, el endpoint resuelve), y ese endpoint ya comprueba
-- `puedeMoverDinero` en el servidor. Mismo criterio que `penalizaciones`.
