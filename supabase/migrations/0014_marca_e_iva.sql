-- ═══════════════════════════════════════════════════════════════════════════
-- 0014 · Marca (logo) + IVA configurable por estudio
-- ═══════════════════════════════════════════════════════════════════════════
--
-- CONTEXTO (Tanda 1 del checklist de onboarding — adaptar Momence a Tentare)
--
-- 1) MARCA/LOGO. El estudio ya podía elegir un tema de color para la app de
--    socias (`tema_portal` → presets con nombre), pero NO había forma de subir
--    su LOGO. `logo_url` guarda la URL pública (Supabase Storage, bucket
--    "avatars", path `logo-<studioId>`) para pintarlo en el portal público de
--    reservas. NULL = sin logo → se sigue mostrando el nombre del estudio.
--
-- 2) IVA CONFIGURABLE. Hasta ahora el tipo de IVA estaba fijado a 21 % a fuego
--    en dos sitios (cliente `buildFactura` y servidor `api/facturas/sellar`, que
--    es el autoritativo y sella la huella Veri*Factu). `iva_por_defecto` permite
--    que cada estudio fije su tipo general (21 general / 10 reducido / 4
--    superreducido / 0 exento). El precio del recibo se sigue tratando como IVA
--    INCLUIDO: cambia solo el desglose base/cuota, no el total cobrado.
--    NOTA: la exención (0 %) calcula cuota 0, pero el régimen de exención de la
--    AEAT (causa de exención en el registro Veri*Factu) queda como follow-up.
--
-- Ambas columnas son additivas y con DEFAULT seguro → no rompen filas
-- existentes (todas quedan con logo_url NULL e iva_por_defecto 21, el valor que
-- estaba hardcodeado). Reversible: DROP COLUMN.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.studios
  ADD COLUMN IF NOT EXISTS logo_url text;

ALTER TABLE public.studios
  ADD COLUMN IF NOT EXISTS iva_por_defecto numeric(5,2) NOT NULL DEFAULT 21;
