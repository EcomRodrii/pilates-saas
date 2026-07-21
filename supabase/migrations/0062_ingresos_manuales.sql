-- ═══════════════════════════════════════════════════════════════════════════
-- 0062 · TENTARE — Ingresos manuales para el Cierre de año
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Ingresos cobrados FUERA de Tentare (efectivo, transferencia, otra plataforma,
-- un taller puntual…) que la propietaria añade a mano para que el cierre anual
-- que entrega a su gestoría esté COMPLETO.
--
-- Importante: NO son facturas de Tentare — no llevan sello Verifactu ni
-- numeración correlativa. Se suman a los totales del año pero se muestran y
-- exportan claramente marcados como "añadido a mano", para que la gestoría
-- distinga lo facturado en Tentare de lo declarado aparte.
--
-- RLS idéntica al resto de tablas por-estudio (0018): acceso solo al propio
-- estudio vía public.current_studio_id(); el service_role (rutas API de staff)
-- la bypassa. Reversible: DROP TABLE public.ingresos_manuales.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.ingresos_manuales (
  id             text PRIMARY KEY,
  studio_id      text NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  fecha          date NOT NULL,
  concepto       text NOT NULL,
  cliente        text,
  nif            text,
  base_imponible numeric NOT NULL,
  tipo_iva       numeric NOT NULL,
  cuota_iva      numeric NOT NULL,
  total          numeric NOT NULL,
  nota           text,
  creado_en      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ingresos_manuales_studio_fecha
  ON public.ingresos_manuales USING btree (studio_id, fecha);

ALTER TABLE public.ingresos_manuales ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_ingresos_manuales ON public.ingresos_manuales
  TO authenticated
  USING ((studio_id = public.current_studio_id()))
  WITH CHECK ((studio_id = public.current_studio_id()));

GRANT ALL ON TABLE public.ingresos_manuales TO anon;
GRANT ALL ON TABLE public.ingresos_manuales TO authenticated;
GRANT ALL ON TABLE public.ingresos_manuales TO service_role;

COMMENT ON TABLE public.ingresos_manuales IS
  'Ingresos cobrados fuera de Tentare que el estudio añade a mano al cierre de año (sin factura Verifactu). Se suman a los totales anuales, marcados como manuales.';
