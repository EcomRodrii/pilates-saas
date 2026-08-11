-- ═══════════════════════════════════════════════════════════════════════════
-- Que se vea que una devolución está EN CAMINO
-- ═══════════════════════════════════════════════════════════════════════════
-- Al pulsar "Devolver" no pasaba nada visible: la fila seguía diciendo
-- "Cobrado" hasta que el webhook de Stripe llegaba (segundos después) y la
-- ponía "Devuelto". Entre medias, la propietaria no sabía si se había enviado,
-- si estaba en curso o si se había quedado colgado. Y si el webhook NO llegara,
-- la fila se quedaría en "Cobrado" para siempre: parecería que falló cuando el
-- dinero sí salió — exactamente el patrón que costó el cobro perdido del 8-ago.
--
-- `reembolso_solicitado_en` es un hecho DISTINTO de `fecha_devolucion`:
--   · reembolso_solicitado_en → Tentare se lo PIDIÓ a Stripe (lo escribe el endpoint)
--   · fecha_devolucion        → Stripe lo CONFIRMÓ (lo escribe el webhook)
--
-- Por eso esto no rompe la regla de "el endpoint no marca el recibo, lo marca
-- el webhook": el endpoint sigue sin decidir si está devuelto. Solo deja
-- constancia de que preguntó. Con esta columna puesta y el estado todavía
-- COBRADO, la devolución está EN VUELO, y la pantalla puede decirlo — también
-- después de recargar, que es lo que un estado en memoria no aguanta.
--
-- `reembolso_stripe_id` (re_…) es para poder seguir una que se quede a medias
-- sin tener que buscarla por importe y fecha en el panel de Stripe.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.recibos
  add column if not exists reembolso_solicitado_en timestamptz,
  add column if not exists reembolso_stripe_id text;

comment on column public.recibos.reembolso_solicitado_en is
  'Cuando Tentare PIDIO la devolucion a Stripe. Distinto de fecha_devolucion, que la escribe el webhook cuando Stripe confirma. Con esta puesta y estado todavia COBRADO, la devolucion esta en vuelo.';
comment on column public.recibos.reembolso_stripe_id is
  'Id del refund de Stripe (re_...). Para poder seguirlo si se queda a medias.';

-- Sin RLS nueva: son columnas de `recibos`, que ya tiene la suya (lectura de
-- dinero acotada a PROPIETARIO/RECEPCION, migr 20260727163759). Y la escritura
-- la hace el endpoint con service-role tras comprobar `puedeMoverDinero`.
