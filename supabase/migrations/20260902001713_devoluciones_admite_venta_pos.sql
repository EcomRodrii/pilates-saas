-- F-12/F-13, rediseño de fondo. `devoluciones` ya modelaba bien la dimensión
-- "reembolso parcial vs total" (origen + importe_devuelto acumulado monótono,
-- F-6) — solo faltaba que supiera hablar de POS, no solo de recibos. Se
-- generaliza a "la tabla única de reembolsos de cualquier canal" en vez de
-- mantener un mecanismo aparte y más pobre (procesarReembolsoVentaPos solo
-- escribía ventas_pos.devuelta_en/importe_devuelto, sin fila de auditoría ni
-- distinguir parcial de total). ventas_pos.devuelta_en/importe_devuelto se
-- conservan como espejo de lectura rápida — no se borran, mismo patrón que
-- recibos.importe_devuelto ya es espejo de esta misma tabla.
--
-- La policy de lectura existente (devoluciones_lectura) no referencia
-- recibo_id, así que no hace falta tocarla. Verificado antes de aplicar
-- (pg_policies) que ninguna otra policy/vista depende de recibo_id siendo
-- obligatorio.
alter table public.devoluciones
  alter column recibo_id drop not null,
  add column venta_pos_id text null references public.ventas_pos(id),
  add constraint devoluciones_entidad_unica
    check ((recibo_id is not null) <> (venta_pos_id is not null));

create index idx_devoluciones_venta_pos_id on public.devoluciones(venta_pos_id) where venta_pos_id is not null;

comment on column public.devoluciones.venta_pos_id is
  'F-12/F-13: alternativa a recibo_id para reembolsos de venta POS. Exactamente uno de los dos está informado (constraint devoluciones_entidad_unica).';
