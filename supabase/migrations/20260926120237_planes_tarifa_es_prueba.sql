-- «Clase de prueba» (Tentare Widgets): una tarifa marcada como oferta de
-- primera visita. Solo la usa, una vez, quien no tiene historial en el estudio,
-- y siempre junto a una clase concreta. Las reglas de QUIÉN y CUÁNDO viven en
-- servidor (lib/billing/clase-prueba.ts); aquí solo la FORMA que la hace
-- imposible de configurar mal:
--  - solo PUNTUAL o BONO: una prueba MENSUAL se renovaría a precio de prueba
--    para siempre (el cron cobra `plan.precio`);
--  - sin matrícula ni cupo de matrícula gratis (la prueba no puede gastar el
--    cupo ni cobrar un alta);
--  - con caducidad y con sesiones: una prueba sin fin es un bono regalado.
--
-- Sin RLS nueva: la escritura de `planes_tarifa` ya exige `puede_mover_dinero()`
-- (0126) y la lectura pública va por service role. Sin funciones nuevas.
alter table public.planes_tarifa
  add column if not exists es_prueba boolean not null default false;

alter table public.planes_tarifa
  drop constraint if exists planes_tarifa_prueba_forma;
alter table public.planes_tarifa
  add constraint planes_tarifa_prueba_forma check (
    not es_prueba or (
      tipo in ('PUNTUAL', 'BONO')
      and coalesce(matricula, 0) = 0
      and matricula_gratis_cupos is null
      and validez_dias is not null and validez_dias > 0
      and sesiones is not null and sesiones > 0
    )
  );

comment on column public.planes_tarifa.es_prueba is
  'Oferta de primera visita: solo la usa quien no tiene historial en el estudio, una vez, y siempre con una clase. No se vende en el catálogo normal.';
