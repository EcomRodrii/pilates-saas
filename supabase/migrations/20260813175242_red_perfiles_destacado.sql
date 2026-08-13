-- Tentare Network — "destacar perfil" (brief admin §23). Único gap real y
-- acotado de la lista del fundador que no exige ni una cola de aprobación
-- (reabriría la autopublicación ya decidida) ni una tabla de certificaciones
-- entera (no existe modelo de datos para eso todavía). Solo el equipo de
-- Tentare puede escribirlo — nunca la propia instructora.
alter table public.red_perfiles add column if not exists destacado boolean not null default false;
