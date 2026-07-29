-- Tier 1 del backlog priorizado: no existía ninguna columna de consentimiento
-- para procesar datos de salud de una socia (lesiones, embarazo, condiciones
-- crónicas — art. 9 RGPD, "categoría especial de datos"). El consentimiento
-- general del contrato (aceptacion_fecha/firma/version, migr 0000/0104) cubre
-- el servicio en general, no el tratamiento de dato de salud específicamente.
--
-- Se registra en `socios` (uno por persona, no por episodio) y lo captura
-- lib/studio-context.tsx `updateSocio` — la app exige rellenarlo ANTES de
-- guardar la primera condición en `condiciones_salud` (ver ficha-salud.tsx),
-- no al alta general: pedirlo a TODAS las socias sin que se vaya a usar
-- violaría minimización de datos.

alter table public.socios
  add column if not exists consentimiento_salud_fecha timestamptz,
  add column if not exists consentimiento_salud_registrado_por text;

comment on column public.socios.consentimiento_salud_fecha is
  'Cuándo la socia autorizó el tratamiento de sus datos de salud (art. 9 RGPD). NULL = no lo ha dado, no se debe guardar ninguna condición en condiciones_salud.';
comment on column public.socios.consentimiento_salud_registrado_por is
  'Quién lo recogió (la propia socia, o el nombre de quien del estudio lo registró en su nombre estando ella presente).';
