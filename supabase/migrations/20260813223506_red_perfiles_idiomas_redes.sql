-- Tentare Network, Fase 2 (wizard 12 pasos) — Paso 10 "Tu perfil": idiomas
-- e enlaces sociales opcionales. Columnas PÚBLICAS a propósito (a diferencia
-- de red_perfiles_identidad): se muestran en el perfil público, mismo
-- criterio que especialidades/tarifa_rango ya existentes en esta tabla.
-- Sin tabla nueva para idiomas: array de texto simple ("Español (nativo)"),
-- mismo patrón que especialidades — sin catálogo fijo por nivel, es campo
-- libre igual que ya lo es "duracion" en red_certificaciones.
alter table public.red_perfiles
  add column if not exists idiomas text[] not null default '{}',
  add column if not exists instagram text,
  add column if not exists linkedin text,
  add column if not exists web text;
