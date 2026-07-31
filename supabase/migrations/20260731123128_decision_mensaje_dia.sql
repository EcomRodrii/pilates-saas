-- El Umbral (lib/decision/umbral.ts): como mucho un mensaje del día por
-- estudio, o silencio. Esta tabla es el registro de esa decisión — sirve a
-- la puerta de novedad (no repetir sin cambios), a la vista "semana
-- tranquila" y como fuente del veredicto que pinta Centro de Control.
-- UNIQUE(studio_id, fecha) refuerza "nunca dos mensajes el mismo día" también
-- en el esquema, no solo en la función pura.

CREATE TABLE public.decision_mensajes_dia (
    id text PRIMARY KEY,
    studio_id text NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
    fecha date NOT NULL,
    tipo text NOT NULL CHECK (tipo IN ('MENSAJE','SILENCIO')),
    recomendacion_id text,
    dedupe_key text,
    motivo_motor text,
    motivo_silencio text,
    enviado_en timestamptz,
    creado_en timestamptz DEFAULT now(),
    UNIQUE (studio_id, fecha)
);
CREATE INDEX decision_mensajes_dia_reciente ON public.decision_mensajes_dia (studio_id, fecha DESC);

ALTER TABLE public.decision_mensajes_dia ENABLE ROW LEVEL SECURITY;

-- Mismo patrón owner-only que el resto de tablas del Decision OS (0003):
-- Decision OS escribe con el cliente service-role (salta RLS); esta policy
-- solo protege una hipotética escritura/lectura desde el cliente autenticado.
CREATE POLICY owner_decision_mensajes_dia ON public.decision_mensajes_dia TO authenticated
  USING ((current_rol() = 'PROPIETARIO'::text) AND (studio_id = current_studio_id()))
  WITH CHECK ((current_rol() = 'PROPIETARIO'::text) AND (studio_id = current_studio_id()));

-- El Contrato del Decision OS (componente contrato-decision-os.tsx), mostrado
-- UNA sola vez. Mismo patrón que bienvenida_vista_en (0127)/
-- onboarding_descartado_en (0058): NULL = aún no lo ha visto.
ALTER TABLE public.studios ADD COLUMN IF NOT EXISTS decision_contrato_visto_en timestamptz;

-- Backfill CRÍTICO: sin esto, todo estudio que YA usa Decision OS vería el
-- Contrato en su próxima visita como si fuera nuevo. Solo se salta el
-- Contrato quien ya tiene resumen_diario (ya lleva tiempo usándolo); un
-- estudio genuinamente nuevo sigue viéndolo la primera vez.
UPDATE public.studios s SET decision_contrato_visto_en = now()
WHERE decision_contrato_visto_en IS NULL
  AND EXISTS (SELECT 1 FROM public.resumen_diario rd WHERE rd.studio_id = s.id);

COMMENT ON TABLE public.decision_mensajes_dia IS
  'El Umbral: registro del mensaje único diario (o silencio) por estudio. UNIQUE(studio_id,fecha).';
COMMENT ON COLUMN public.studios.decision_contrato_visto_en IS
  'Cuándo se cerró el Contrato del Decision OS. NULL = aún no lo ha visto.';
