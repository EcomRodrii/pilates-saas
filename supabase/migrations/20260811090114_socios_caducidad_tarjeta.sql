-- ═══════════════════════════════════════════════════════════════════════════
-- Tentare Brain · Fase 3 — la caducidad de la tarjeta guardada
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Hoy se guarda `socios.stripe_payment_method_id` y nada más: cuándo caduca esa
-- tarjeta no está en ninguna parte. Así que la causa de impago más predecible
-- que existe —y la más fácil de evitar, con un mensaje una semana antes— es
-- estructuralmente invisible para el motor.
--
-- Solo datos que Stripe devuelve para MOSTRAR (marca, últimos 4, mes/año de
-- caducidad). Nada de PAN ni CVC: eso no puede tocar esta base de datos, y
-- Stripe tampoco lo entrega.
--
-- Los últimos 4 y la marca no son decorativos: "tu Visa ···4242 caduca este
-- mes" es accionable y "tu tarjeta caduca" no, porque la socia no sabe cuál de
-- las suyas tiene guardada aquí.
--
-- Aditiva y nullable: `null` = todavía no lo sabemos (toda tarjeta guardada
-- antes de esto). El relleno va por goteo desde el cron de dunning, que ya
-- habla con Stripe — ver lib/inngest/dunning.ts.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.socios
  ADD COLUMN IF NOT EXISTS tarjeta_exp_mes smallint,
  ADD COLUMN IF NOT EXISTS tarjeta_exp_anio smallint,
  ADD COLUMN IF NOT EXISTS tarjeta_marca text,
  ADD COLUMN IF NOT EXISTS tarjeta_ultimos4 text;

ALTER TABLE public.socios
  DROP CONSTRAINT IF EXISTS socios_tarjeta_exp_mes_check;
ALTER TABLE public.socios
  ADD CONSTRAINT socios_tarjeta_exp_mes_check
  CHECK (tarjeta_exp_mes IS NULL OR (tarjeta_exp_mes BETWEEN 1 AND 12));

ALTER TABLE public.socios
  DROP CONSTRAINT IF EXISTS socios_tarjeta_ultimos4_check;
ALTER TABLE public.socios
  ADD CONSTRAINT socios_tarjeta_ultimos4_check
  CHECK (tarjeta_ultimos4 IS NULL OR tarjeta_ultimos4 ~ '^[0-9]{4}$');

COMMENT ON COLUMN public.socios.tarjeta_exp_mes IS
  'Mes de caducidad (1-12) de la tarjeta guardada. NULL = aún sin consultar a Stripe.';
COMMENT ON COLUMN public.socios.tarjeta_exp_anio IS
  'Año de caducidad (4 dígitos) de la tarjeta guardada.';
COMMENT ON COLUMN public.socios.tarjeta_marca IS
  'Marca para mostrar (visa, mastercard...). Solo presentación, nunca decisión de cobro.';
COMMENT ON COLUMN public.socios.tarjeta_ultimos4 IS
  'Últimos 4 dígitos, para que la socia sepa QUÉ tarjeta tiene que actualizar.';

-- Índice parcial para el barrido de relleno: las que tienen tarjeta y aún no
-- sabemos su caducidad. Se vacía solo según converge, y entonces no cuesta nada.
CREATE INDEX IF NOT EXISTS idx_socios_tarjeta_sin_caducidad
  ON public.socios (studio_id)
  WHERE stripe_payment_method_id IS NOT NULL AND tarjeta_exp_anio IS NULL;
