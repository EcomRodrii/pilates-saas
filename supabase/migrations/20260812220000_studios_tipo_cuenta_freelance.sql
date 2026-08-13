-- Feature #9 (ficha Lorari-vs-Tentare): enlace público de instructora
-- freelance. Decisión de producto explícita del fundador (2026-08-13,
-- overrides la recomendación por defecto de tentare-producto de no atender
-- este ICP) — diseño con tentare-arquitecto: NO tocar `current_studio_id()`
-- ni el NOT NULL de `instructores.studio_id` (eje de 117 migraciones). Una
-- cuenta freelance es un `studios` real de un solo miembro: la misma
-- instructora es su propia fila en `instructores` con rol PROPIETARIO.
-- Único cambio de esquema necesario: distinguir el tipo de cuenta para poder
-- apagar selectivamente lo que no aplica a una sola persona (alerta de
-- concentración por instructor, ver EspecialistaCartera).
--
-- Aditiva, sin tocar RLS ni ninguna función existente — `owner_write_instructores`
-- (FOR ALL, `current_rol()='PROPIETARIO' AND studio_id=current_studio_id()`,
-- verificado en vivo) ya permite que la propia freelance se inserte a sí
-- misma como PROPIETARIO en su estudio nuevo, sin RPC ni service-role.

alter table public.studios
  add column if not exists tipo_cuenta text not null default 'ESTUDIO'
  check (tipo_cuenta in ('ESTUDIO', 'FREELANCE'));

comment on column public.studios.tipo_cuenta is
  'ESTUDIO = negocio con equipo (caso normal). FREELANCE = instructora sin estudio detrás, único miembro y PROPIETARIO de su propia cuenta (feature #9, ficha Lorari-vs-Tentare). Usar para apagar selectivamente features sin sentido con un solo miembro (p.ej. alerta de concentración por instructor), nunca para gatear RLS — la RLS sigue siendo por studio_id/rol, no por tipo_cuenta.';
