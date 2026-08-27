-- Social graph — compañeras de clase (Community & Messaging OS, P2, última pieza).
--
-- Opt-in explícito de la propia socia para que otras alumnas del mismo
-- estudio vean su nombre en "quién más va a esta clase" (reservas), sin
-- necesidad de que sean ya compañeras aceptadas (`socio_companeras`, ver
-- migración siguiente). Por defecto oculta.

alter table public.socios
  add column if not exists visible_en_clase boolean not null default false;

comment on column public.socios.visible_en_clase is
  'Opt-in de la socia: ¿su nombre es visible para otras alumnas en "quién más va" a una clase? Escritura de la propia socia SIEMPRE vía API route + service-role (socioAutenticado), mismo criterio que el resto de este proyecto — socios ya tiene policies authenticated solo para STAFF (puede_gestionar_clientas), no para la socia sobre su propia fila.';
