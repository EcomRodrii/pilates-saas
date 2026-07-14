-- ═══════════════════════════════════════════════════════════════════════════
-- 0020 · Configuración de menú por estudio (Fase 4 del white-label)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- CONTEXTO
-- El menú lateral del panel era fijo (mismo orden y módulos para todos). Esta
-- tabla permite que cada estudio (la propietaria) REORDENE los módulos, OCULTE
-- los que no usa y elija la POSICIÓN del menú (lateral/superior). A diferencia
-- del tema (studio_theme), el menú se aplica en vivo → sin borrador/publicado.
--
-- FORMA (validada en la app con zod, ver lib/layout-schema.ts; jsonb libre para
-- no acoplar el esquema de DB a cada módulo nuevo):
--   { orden: string[] (hrefs), ocultos: string[] (hrefs), menuPosition: 'lateral'|'superior' }
--
-- Una fila por estudio (PK = studio_id). Sin fila o jsonb NULL/parcial → menú
-- por defecto (resolveLayout rellena). Additiva y reversible (DROP TABLE).
--
-- Lecturas: el propio panel (staff) por anon key con RLS. Escritura: solo
-- PROPIETARIO. No se concede a anon (el menú es del panel, no público).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.studio_layout (
  studio_id text NOT NULL,
  config jsonb,
  actualizado_en timestamp with time zone DEFAULT now(),
  CONSTRAINT studio_layout_pkey PRIMARY KEY (studio_id)
);

ALTER TABLE ONLY public.studio_layout
  ADD CONSTRAINT studio_layout_studio_id_fkey
  FOREIGN KEY (studio_id) REFERENCES public.studios(id) ON DELETE CASCADE;

ALTER TABLE public.studio_layout ENABLE ROW LEVEL SECURITY;

CREATE POLICY read_studio_layout ON public.studio_layout
  FOR SELECT
  TO authenticated
  USING ((studio_id = public.current_studio_id()));

CREATE POLICY write_studio_layout ON public.studio_layout
  FOR ALL
  TO authenticated
  USING ((studio_id = public.current_studio_id() AND public.current_rol() = 'PROPIETARIO'))
  WITH CHECK ((studio_id = public.current_studio_id() AND public.current_rol() = 'PROPIETARIO'));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.studio_layout TO authenticated;
GRANT ALL ON TABLE public.studio_layout TO service_role;
