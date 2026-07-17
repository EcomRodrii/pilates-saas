-- Fase 7 — campos adicionales de Marketing.
-- Aditivo y no destructivo: nuevas columnas nullable, sin tocar datos ni RLS
-- existente (heredan las políticas de sus tablas). Seguro de re-ejecutar.

-- Campañas: objetivo (texto libre) y presupuesto asignado.
ALTER TABLE public.campanas
  ADD COLUMN IF NOT EXISTS objetivo text,
  ADD COLUMN IF NOT EXISTS presupuesto numeric(10,2);

-- Códigos de descuento: restricciones de uso.
--  · min_importe: importe mínimo de compra para poder aplicar el código.
--  · solo_nuevas: el código solo es válido para clientas nuevas.
ALTER TABLE public.codigos_descuento
  ADD COLUMN IF NOT EXISTS min_importe numeric(10,2),
  ADD COLUMN IF NOT EXISTS solo_nuevas boolean NOT NULL DEFAULT false;
