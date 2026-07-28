-- Suspensión de un estudio desde el panel interno.
--
-- Es un acto ADMINISTRATIVO explícito (impago persistente, abuso, petición del
-- propio cliente), distinto de "la suscripción no está activa", que es una
-- inferencia de billing. Por eso va en columnas propias y NO reutiliza
-- subscription_status: mezclarlos haría que el webhook de Stripe pudiera
-- levantar una suspensión puesta a mano, o al revés.
--
-- Consecuencia importante en el código: la suspensión se comprueba ANTES que
-- el billing y **ignora BILLING_ENFORCED**. Si decidimos cortarle el acceso a
-- alguien, eso tiene que surtir efecto aunque el cobro forzoso esté apagado.
alter table studios
  add column if not exists suspendido_en     timestamptz,
  add column if not exists suspendido_motivo text,
  add column if not exists suspendido_por    uuid references auth.users(id);

comment on column studios.suspendido_en is
  'Fecha en que el equipo de Tentare suspendió el acceso. NULL = activo.';
comment on column studios.suspendido_motivo is
  'Motivo escrito por quien suspende. Obligatorio en el panel: se le enseña al cliente.';

create index if not exists idx_studios_suspendidos on studios (suspendido_en)
  where suspendido_en is not null;
