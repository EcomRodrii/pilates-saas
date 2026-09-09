-- 20260910000000 · TENTARE — penalizaciones.estado admite REEMBOLSADA;
-- liquidaciones_instructoras gana requiere_revision
--
-- 44ª pasada de auditoría (2026-09-09), hallazgo H-2. Una penalización ya
-- COBRADA (y su reparto ya sumado a la liquidación de la instructora de esa
-- clase) puede devolverse a la socia por el módulo genérico de reembolsos
-- (app/api/reembolsos, que ya funciona sobre CUALQUIER recibo — y una
-- penalización cobrada crea un recibo real, `rec-penaliz-<id>`,
-- lib/inngest/penalizaciones.ts). Hasta ahora, cuando el webhook de Stripe
-- marcaba ese recibo DEVUELTO, `penalizaciones.estado` se quedaba en
-- 'COBRADA' para siempre — sin ningún rastro del lado de la nómina — y una
-- liquidación ya CONFIRMADA que había repartido esa penalización no se
-- avisaba de la discrepancia.
--
-- Este cambio añade el estado que faltaba y una señal de "requiere
-- revisión" sobre la liquidación afectada — nunca sobre una ya PAGADA
-- (ajuste manual en frío, como el resto del sistema; mismo criterio que
-- "límite conocido, no resuelto por diseño" ya documentado para
-- OMITIDA_REVERTIDA en la Fase 3 de penalizaciones).

alter table public.penalizaciones drop constraint if exists penalizaciones_estado_check;
alter table public.penalizaciones add constraint penalizaciones_estado_check
  check (estado in (
    'DETECTADA', 'OMITIDA_SIN_TARJETA', 'OMITIDA_SIN_CONSENTIMIENTO',
    'OMITIDA_COMPENSADA', 'OMITIDA_REVERTIDA',
    'PENDIENTE_APROBACION', 'RECIBO_CREADO', 'COBRADA', 'FALLIDA', 'REEMBOLSADA'
  ));

alter table public.liquidaciones_instructoras add column if not exists requiere_revision boolean not null default false;
alter table public.liquidaciones_instructoras add column if not exists revision_motivo text;

comment on column public.liquidaciones_instructoras.requiere_revision is
  'true = una penalización que esta liquidación ya repartió (CONFIRMADA, no PAGADA) se reembolsó después. No se toca en frío: la propietaria decide el ajuste al verlo.';
comment on column public.liquidaciones_instructoras.revision_motivo is
  'Texto corto explicando por qué requiere_revision es true. NULL cuando requiere_revision es false.';
