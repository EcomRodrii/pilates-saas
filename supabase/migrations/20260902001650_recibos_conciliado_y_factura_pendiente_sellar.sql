-- F-12/F-13, rediseño de fondo (ciclo cobro→factura→devolución→conciliación).
--
-- Dimensión "conciliación" (¿el sistema ha verificado el estado de este cobro
-- contra el proveedor de pago?): antes no existía en ningún sitio. Se escribe
-- SIEMPRE que el flujo unificado (lib/billing/confirmar-cobro.ts) termina con
-- éxito, sea porque lo disparó el webhook o el conciliador — no es "solo el
-- conciliador la pone". `estado='COBRADO' AND conciliado_en IS NULL` pasa a
-- ser, literalmente, "dinero cobrado que el sistema nunca ha verificado de
-- punta a punta".
--
-- `factura_pendiente_sellar`: NO es la dimensión "factura" (esa sigue siendo
-- `facturas.verifactu_hash`, ya bien modelada). Es una TAREA sobre un cobro ya
-- cerrado — el sellado falló pero el cobro no se deshace nunca por eso (el
-- dinero ya entró). El conciliador horario la usa para reintentar el sellado
-- suelto sin tener que releer Sentry para saber qué falta.
alter table public.recibos
  add column conciliado_en timestamptz null,
  add column conciliado_por text null check (conciliado_por in ('webhook','conciliador','manual')),
  add column factura_pendiente_sellar boolean not null default false;

comment on column public.recibos.conciliado_en is
  'F-12/F-13: cuándo se verificó este cobro de punta a punta (marcar cobrado + renovar + intentar sellar). NULL = nunca verificado.';
comment on column public.recibos.conciliado_por is
  'webhook = lo confirmó el webhook de Stripe en tiempo real. conciliador = lo recuperó el barrido horario porque el webhook falló. manual = una persona.';
comment on column public.recibos.factura_pendiente_sellar is
  'true = el cobro se confirmó pero el sellado de la factura falló (Fiskaly/red/etc). El cobro NO se deshace por esto. El conciliador reintenta el sellado (nunca el cobro) sobre las filas recientes.';
