-- ─────────────────────────────────────────────────────────────────────────────
-- Qué pasa cuando alguien compra un bono desde el enlace público SIN ser socia.
--
-- Hasta ahora el botón "Contratar" de /reservar/[slug] llamaba al checkout con
-- `metadata.planId`… y el webhook NUNCA leía ese campo (0 apariciones en sus 453
-- líneas). Stripe cobraba, el dinero entraba en la cuenta del estudio y no se
-- creaba ni suscripción, ni bono, ni recibo, ni factura. Cobrar sin entregar.
--
-- Al arreglarlo hay que decidir qué hacer con quien paga sin tener ficha, y eso
-- es decisión de cada estudio, no nuestra:
--
--   EXIGIR_REGISTRO (por defecto) — no se cobra a quien no se ha registrado.
--     Se le pide el alta (magic link + nombre + aceptar el contrato) y luego
--     paga. Es lo coherente con el consentimiento: sin ficha no hay contrato
--     aceptado, así que cobrar antes sería cobrar sin consentimiento.
--
--   CREAR_FICHA — se cobra primero y la ficha se crea con el email verificado
--     por Stripe. Menos fricción para vender; a cambio, esa socia entra sin
--     contrato aceptado y habrá que pedírselo cuando entre al portal (que ya
--     lo hace: reservar/[slug] comprueba !aceptacionContrato).
--
-- Por defecto el modo prudente: es el que no cobra sin consentimiento. Quien
-- prefiera vender sin fricción lo cambia en Configuración › Estudio.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.studios
  add column if not exists compra_publica_modo text
    not null default 'EXIGIR_REGISTRO'
    check (compra_publica_modo in ('EXIGIR_REGISTRO', 'CREAR_FICHA'));

comment on column public.studios.compra_publica_modo is
  'Compra desde el enlace público sin ficha previa. EXIGIR_REGISTRO = se registra antes de pagar (por defecto). CREAR_FICHA = se cobra y la ficha se crea con el email de Stripe.';
