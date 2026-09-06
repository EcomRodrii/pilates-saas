-- Cobrar la PRIMERA venta de un bono regalaba otra tanda de sesiones.
--
-- `aplicarRenovacionServidor` daba por hecho que TODO recibo con
-- `suscripcion_id` era una renovación. No lo es: recepción asigna un «Bono 10»
-- desde la ficha y `assignPlan` crea la suscripción YA con sus 10 sesiones más
-- un recibo PENDIENTE. Si luego se pulsa «Cobrar online», la RPC
-- `renovar_bono_idempotente` SUMA (`sesiones_restantes + p_sesiones`) y la
-- socia acaba con 20 sesiones habiendo pagado una vez. Con PUNTUAL son dos
-- clases sueltas por el precio de una.
--
-- La idempotencia de la RPC es POR RECIBO, así que no lo frena: para ese
-- recibo es la primera entrega. Y el guard viejo
-- (`if (sus.sesiones_restantes !== 0) return`) se quitó a propósito en I-6,
-- porque confundía «ya recargué» con «todavía no se había agotado» y hacía que
-- una renovación anticipada cobrase sin entregar.
--
-- Lo que faltaba no era un guard sobre el saldo, sino saber QUÉ ES el recibo.
-- Se marca explícitamente en vez de deducirlo del concepto: el texto
-- «Renovación …» es copy, y una decisión de dinero no puede depender de que
-- nadie lo traduzca ni lo reescriba.
alter table public.recibos
  add column if not exists es_renovacion boolean not null default false;

comment on column public.recibos.es_renovacion is
  'true = este recibo renueva un ciclo ya entregado (refill de bono / extensión de mensual). false = venta inicial: las sesiones se entregaron al crear la suscripción y cobrarlo NO debe volver a darlas.';

-- Los que ya existen: renovación es exactamente lo que hasta hoy se distinguía
-- por el concepto, y así los pendientes se siguen comportando igual tras el
-- despliegue en vez de dejar de entregar de golpe.
update public.recibos
   set es_renovacion = true
 where concepto like 'Renovación%';
