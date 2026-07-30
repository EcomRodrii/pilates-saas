-- 0140 · Fase 1 del roadmap de docs/ARQUITECTURA-LEGAL-PAGOS-FACTURACION.md.
-- Dos gaps sin relación entre sí más que "cerrar lo detectado en la
-- auditoría del 2026-07-29", en la misma migración por conveniencia.

-- ── 1) Disputas/chargebacks de Stripe ────────────────────────────────────────
-- Hoy invisibles para Tentare: app/api/stripe/webhook/route.ts no maneja
-- charge.dispute.* — un chargeback se entera el estudio mirando Stripe
-- directamente, sin ningún rastro ni aviso en el panel.
ALTER TABLE public.recibos
  ADD COLUMN IF NOT EXISTS disputa_estado text,
  ADD COLUMN IF NOT EXISTS disputa_stripe_id text;

-- ── 2) Auditoría de LECTURA de la ficha de salud ─────────────────────────────
-- RGPD art. 5.2/24: trazabilidad de quién accede a datos de categoría especial
-- (art. 9). Hoy se audita quién ESCRIBE una condición (creado_por en
-- condiciones_salud) pero nadie registra quién simplemente ABRE la pestaña de
-- salud de una socia dentro de un estudio. Solo-append por diseño: no hace
-- falta editar ni borrar un registro de auditoría, y permitirlo lo
-- invalidaría como prueba.
CREATE TABLE IF NOT EXISTS public.lecturas_ficha_salud (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id          text NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  socio_id           text NOT NULL REFERENCES public.socios(id) ON DELETE CASCADE,
  leido_por_user_id  uuid NOT NULL,
  leido_por_nombre   text NOT NULL,
  leido_por_rol      text NOT NULL,
  leido_en           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lecturas_ficha_salud_socio
  ON public.lecturas_ficha_salud (studio_id, socio_id, leido_en DESC);

ALTER TABLE public.lecturas_ficha_salud ENABLE ROW LEVEL SECURITY;

-- Solo puede insertar su PROPIA lectura (leido_por_user_id = auth.uid()), y
-- solo si su rol es de los que ven la ficha clínica (mismo criterio que
-- puedeVerFichaClinica en TS) — nadie puede registrar una lectura en nombre
-- de otra persona.
CREATE POLICY lecturas_ficha_salud_insercion ON public.lecturas_ficha_salud
  FOR INSERT TO authenticated
  WITH CHECK (
    studio_id = current_studio_id()
    AND current_rol() IN ('PROPIETARIO','INSTRUCTOR')
    AND leido_por_user_id = (SELECT auth.uid())
  );

-- Solo la propietaria puede AUDITAR (leer el registro completo). Sin policy
-- de UPDATE/DELETE para authenticated: por ausencia, RLS las deniega todas.
CREATE POLICY lecturas_ficha_salud_lectura ON public.lecturas_ficha_salud
  FOR SELECT TO authenticated
  USING (studio_id = current_studio_id() AND current_rol() = 'PROPIETARIO');
