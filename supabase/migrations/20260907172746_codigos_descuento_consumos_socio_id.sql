-- Auditoría 26ª pasada, P-5: un código de descuento sin tope global
-- (`usos_max`) era reutilizable indefinidamente por la MISMA socia —
-- `codigos_descuento_consumos` no tenía ninguna columna que lo impidiera.
-- Decisión de producto explícita: cada código es como mucho una vez por
-- socia, tenga o no tope global (que sigue limitando el total de la
-- campaña, sin cambios ahí). 0 filas en la tabla hoy — sin backfill.
alter table public.codigos_descuento_consumos
  add column socio_id text not null references public.socios(id) on delete cascade;

create unique index codigos_descuento_consumos_codigo_socio_unq
  on public.codigos_descuento_consumos (codigo_id, socio_id);

comment on table public.codigos_descuento_consumos is 'Consumo de un código de descuento: una fila por recibo (PK) y como mucho una fila por (codigo_id, socio_id) — cada socia puede usar cada código como máximo una vez, además del tope global de usos_max en codigos_descuento.';
