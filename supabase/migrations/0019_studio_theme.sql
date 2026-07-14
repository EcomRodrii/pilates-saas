-- ═══════════════════════════════════════════════════════════════════════════
-- 0019 · Tema white-label por estudio (Fase 1 del theming multi-tenant)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- CONTEXTO
-- Hasta ahora el estudio solo podía elegir un PRESET de color con nombre para la
-- app de socias (`studios.tema_portal`, 6 opciones fijas) y subir su logo
-- (`studios.logo_url`, migr. 0014/0017). Esta tabla habilita el white-label
-- completo: colores arbitrarios, tipografía (set curado), radio de componentes
-- y favicon, con flujo BORRADOR vs PUBLICADO para no romper producción mientras
-- el propietario edita.
--
-- FORMA (validada en la app con zod, ver lib/theme-schema.ts; aquí se guarda
-- como jsonb libre para no acoplar el esquema de DB a cada cambio de tokens):
--   { primary, secondary, accent, background, text,   -- hex
--     fontId, radius, faviconUrl }
--
-- Una fila por estudio (PK = studio_id):
--   config_draft     → lo que edita el propietario (editor + preview en vivo)
--   config_published → lo que ve producción (runtime lee SIEMPRE esta)
-- Sin fila, o con jsonb NULL/parcial → la app cae al tema por defecto del
-- sistema (resolveTheme rellena por token). Retrocompatible y additiva.
--
-- LECTURAS públicas (portal/reservas) van por service-role (getSupabaseAdmin),
-- igual que plantillas_email y studio-seo → NO se concede a anon. La edición
-- desde el panel va por anon key con RLS por estudio.
--
-- Reversible: DROP TABLE.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.studio_theme (
  studio_id text NOT NULL,
  config_draft jsonb,
  config_published jsonb,
  actualizado_en timestamp with time zone DEFAULT now(),
  publicado_en timestamp with time zone,
  CONSTRAINT studio_theme_pkey PRIMARY KEY (studio_id)
);

ALTER TABLE ONLY public.studio_theme
  ADD CONSTRAINT studio_theme_studio_id_fkey
  FOREIGN KEY (studio_id) REFERENCES public.studios(id) ON DELETE CASCADE;

-- RLS por estudio. Cualquier miembro del staff del estudio puede LEER (para el
-- preview); solo el PROPIETARIO puede ESCRIBIR (crear/editar/publicar/borrar).
ALTER TABLE public.studio_theme ENABLE ROW LEVEL SECURITY;

CREATE POLICY read_studio_theme ON public.studio_theme
  FOR SELECT
  TO authenticated
  USING ((studio_id = public.current_studio_id()));

CREATE POLICY write_studio_theme ON public.studio_theme
  FOR ALL
  TO authenticated
  USING ((studio_id = public.current_studio_id() AND public.current_rol() = 'PROPIETARIO'))
  WITH CHECK ((studio_id = public.current_studio_id() AND public.current_rol() = 'PROPIETARIO'));

-- Sin GRANT a anon: las lecturas públicas se sirven vía service-role.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.studio_theme TO authenticated;
GRANT ALL ON TABLE public.studio_theme TO service_role;
