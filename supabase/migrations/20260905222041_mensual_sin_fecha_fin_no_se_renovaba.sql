-- Una suscripción MENSUAL con `fecha_fin` a NULL no se cobra NUNCA más.
--
-- Los tres caminos de alta calculaban la fecha con
-- `calcularFechaFinBono(ahora, plan.validezDias)` sin mirar el tipo, y un
-- MENSUAL tiene `validezDias` null por definición (se renueva, no caduca por
-- días). El NULL resultante significa aguas abajo «no caduca nunca»:
-- `tieneEntitlementActivo` la da por vigente para siempre y el cron de
-- renovaciones filtra `fecha_fin is not null`, así que jamás genera el recibo
-- del mes 2. Se cobraba un mes y la socia seguía reservando gratis, sin error
-- ni recibo pendiente ni nada raro que mirar.
--
-- Arreglado en código con `cicloInicialDe` (lib/bono-logic.ts), que ya es el
-- único sitio donde se decide el primer ciclo de cualquier plan. Aquí se
-- reparan las 4 filas que ya estaban así en producción (172 €/mes).
--
-- ⚠️ Se arranca el ciclo HOY, no en `fecha_inicio + 1 mes`, que ya está
-- pasado. Poner una fecha vencida haría que el cron generase de golpe el
-- recibo de un mes que a la socia nadie le avisó de que se le debía. Los meses
-- que no se cobraron no se recuperan por aquí: eso es una conversación del
-- estudio con su clienta, no un UPDATE. Ninguna de las cuatro tiene tarjeta ni
-- SEPA guardados, así que esto tampoco puede disparar un cobro automático —
-- el recibo nacerá PENDIENTE y visible en /cobros.
update public.suscripciones s
   set fecha_fin = (current_date + interval '1 month')::date
  from public.planes_tarifa p
 where p.id = s.plan_id
   and p.tipo = 'MENSUAL'
   and s.estado = 'ACTIVA'
   and s.fecha_fin is null;
