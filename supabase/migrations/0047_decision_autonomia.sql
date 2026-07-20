-- ═══════════════════════════════════════════════════════════════════════════
-- 0047 · TENTARE — Decision OS: piloto automático (ejecución autónoma)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- El Decision OS ya calcula un `nivel_autonomia` (0-3) por recomendación pero
-- HOY nunca se usa: todo pasa por aprobación manual del dueño. Esta tabla guarda,
-- por estudio, la configuración del "piloto automático": si está activo, qué
-- tipos de acción pueden ejecutarse solos y cuántos como máximo al día.
--
-- SEGURIDAD: OFF por defecto (opt-in explícito del propietario). El código nunca
-- deja auto-ejecutar cobros a tarjeta (COBRAR_RECIBOS): solo mensajes
-- (ENVIAR_EMAIL / CONTACTO_MANUAL), y solo recomendaciones de ALTA confianza con
-- autonomía declarada ≥2. Ver lib/decision/autonomia.ts (allowlist + saneo).
--
-- Patrón RLS/grants idéntico a las 6 tablas de 0003 (propietario del estudio).
-- Reversible: DROP TABLE.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.decision_autonomia_config (
  studio_id text NOT NULL,
  activa boolean NOT NULL DEFAULT false,
  -- Tipos de AccionDecision que el estudio autoriza a ejecutarse solos. El código
  -- lo acota a {ENVIAR_EMAIL, CONTACTO_MANUAL}; nunca COBRAR_RECIBOS.
  tipos_permitidos text[] NOT NULL DEFAULT ARRAY['ENVIAR_EMAIL']::text[],
  max_diario integer NOT NULL DEFAULT 5,
  actualizado_en timestamp with time zone DEFAULT now(),
  actualizado_por text,
  CONSTRAINT decision_autonomia_config_pkey PRIMARY KEY (studio_id),
  CONSTRAINT decision_autonomia_max_diario_check CHECK (max_diario BETWEEN 0 AND 50)
);

ALTER TABLE ONLY public.decision_autonomia_config
  ADD CONSTRAINT decision_autonomia_config_studio_id_fkey
  FOREIGN KEY (studio_id) REFERENCES public.studios(id) ON DELETE CASCADE;

ALTER TABLE public.decision_autonomia_config ENABLE ROW LEVEL SECURITY;
-- Solo el propietario del estudio (mismo patrón que las tablas del Decision OS).
CREATE POLICY admin_decision_autonomia_config ON public.decision_autonomia_config
  TO authenticated
  USING ((public.current_rol() = 'PROPIETARIO') AND (studio_id = public.current_studio_id()))
  WITH CHECK ((public.current_rol() = 'PROPIETARIO') AND (studio_id = public.current_studio_id()));
GRANT ALL ON TABLE public.decision_autonomia_config TO anon, authenticated, service_role;
