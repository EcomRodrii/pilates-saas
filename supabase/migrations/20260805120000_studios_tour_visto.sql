-- Tour guiado interactivo (Fase 2 del rediseño de onboarding): mostrado UNA
-- sola vez por estudio. NULL = aún no lo ha visto. Mismo patrón exacto que
-- bienvenida_vista_en/decision_contrato_visto_en.
alter table studios add column if not exists tour_visto_en timestamptz;
