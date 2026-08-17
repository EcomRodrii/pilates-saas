-- Una sola sesión de Checkout abierta por recibo.
--
-- EL FALLO. app/api/stripe/checkout comprobaba `estado !== 'PENDIENTE'` y creaba
-- la sesión sin escribir nada en el recibo: un TOCTOU de manual. Dos pestañas
-- (o dos clics) sobre el mismo recibo producían DOS sesiones de Stripe pagables,
-- y las dos cobraban de verdad. El webhook marca la primera COBRADO; la segunda
-- casa 0 filas por el `.in('estado', [...])` y desaparece sin dejar rastro.
--
-- POR QUÉ UNA COLUMNA Y NO UN ESTADO NUEVO. La opción evidente era pasar el
-- recibo a un estado "reservado" al crear la sesión, pero `EN_CURSO` ya
-- significa otra cosa (adeudo SEPA en vuelo, lib/billing/stripe-cobros.ts) y
-- lib/billing/politica-reembolso.ts lo trata como caso propio: reutilizarlo
-- mezclaría dos situaciones distintas y cambiaría el comportamiento de los
-- reembolsos. Y un estado reservado nuevo obliga a inventar cuándo se libera
-- (¿30 min?, ¿lo desbloquea un cron?), con el riesgo de dejar a una socia sin
-- poder pagar porque cerró una pestaña.
--
-- Guardar la sesión no necesita nada de eso: STRIPE es la fuente de verdad de
-- si sigue abierta (`status === 'open'`). Al volver a pedir checkout del mismo
-- recibo se recupera la sesión guardada y se le devuelve LA MISMA, en vez de
-- crear otra — que además es mejor para la socia que un error. Si pide otro
-- método de pago (Bizum vs tarjeta, que cambia `payment_method_types`), se
-- expira la anterior antes de crear la nueva: expirada ya no se puede pagar,
-- así que en ningún momento hay dos sesiones cobrables vivas.
--
-- Aditiva y nullable: los recibos existentes se quedan a NULL y siguen su
-- camino de siempre. Sin RLS nueva — `recibos` ya la tiene, y esta columna la
-- escribe solo el servidor con service_role.
alter table public.recibos
  add column if not exists checkout_session_id text;

comment on column public.recibos.checkout_session_id is
  'Sesión de Stripe Checkout abierta para este recibo, si la hay. La escribe '
  '/api/stripe/checkout al crearla y la limpia el webhook al cobrarla. Sirve '
  'para no crear una segunda sesión pagable del mismo recibo (doble cobro).';
