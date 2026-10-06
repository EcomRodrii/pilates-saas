-- `pagos_clase.socio_id` es una FK (`on delete set null`) y no tenía índice: al borrar una
-- ficha, Postgres recorría la tabla entera para ponerla a null (lo marca el advisor
-- `unindexed_foreign_keys`). ADITIVA y repetible.
create index if not exists pagos_clase_por_socio on public.pagos_clase (socio_id);
