-- CAL-5 (auditoría 62), Fase 0: zona horaria por estudio, sin efecto hasta que
-- se enchufe en algún call site. Default = lo que ya vale hoy para todo
-- estudio real, así que esta columna no cambia ningún comportamiento visible.
-- No es una regla de reserva (no sigue el patrón heredaOverride de tipos_clase):
-- es una propiedad física del local, una por sede, nunca por tipo de clase ni
-- por sala. Sin CHECK de zonas IANA todavía — con 2 valores reales (Madrid,
-- Canarias) se valida en la UI del selector, no en SQL.
alter table studios
  add column if not exists zona_horaria text not null default 'Europe/Madrid';

comment on column studios.zona_horaria is
  'Zona horaria IANA del estudio (CAL-5). Por sede, nunca por cadena ni por tipo de clase. Default Europe/Madrid = el valor de todo estudio real hoy.';
