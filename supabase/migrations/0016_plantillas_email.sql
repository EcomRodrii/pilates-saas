-- ═══════════════════════════════════════════════════════════════════════════
-- 0016 · Plantillas de email transaccional editables (Tanda 2 · Pieza A)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- CONTEXTO
-- Los 7 emails transaccionales se renderizaban desde plantillas React
-- (lib/emails/*) con asunto y textos FIJOS en código, iguales para todos los
-- estudios. Esta tabla guarda el override por estudio y tipo: el estudio puede
-- personalizar el ASUNTO y el TEXTO DE INTRODUCCIÓN; el diseño (cabecera,
-- bloques de datos, pie) se mantiene. Si no hay fila, o `activa=false`, el envío
-- cae a los textos por defecto (retrocompatible).
--
-- Solo los 5 tipos relacionales son editables (bienvenida, reserva,
-- recordatorio, cancelacion, promocion). `recibo` (fiscal) y `automatizacion`
-- (dinámico) se resuelven siempre por defecto — no se guardan aquí.
--
-- Resolución en servidor: /api/emails/send (deriva studioId de la sesión de
-- staff) y lib/emails/send-server.ts (crons/proxy, studioId del evento) leen
-- esta tabla con service-role. La edición desde el panel va por la anon key con
-- RLS por estudio (misma postura que comentarios_comunidad).
--
-- Reversible: DROP TABLE (additiva).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.plantillas_email (
  id text NOT NULL,
  studio_id text NOT NULL,
  tipo text NOT NULL,
  asunto text,
  intro text,
  activa boolean NOT NULL DEFAULT true,
  actualizado_en timestamp with time zone DEFAULT now(),
  CONSTRAINT plantillas_email_pkey PRIMARY KEY (id),
  -- Un override por estudio y tipo: el upsert desde el panel casa por aquí.
  CONSTRAINT plantillas_email_studio_tipo_key UNIQUE (studio_id, tipo)
);

ALTER TABLE ONLY public.plantillas_email
  ADD CONSTRAINT plantillas_email_studio_id_fkey
  FOREIGN KEY (studio_id) REFERENCES public.studios(id) ON DELETE CASCADE;

-- RLS por estudio (misma política que comentarios_comunidad).
ALTER TABLE public.plantillas_email ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_plantillas_email ON public.plantillas_email
  TO authenticated
  USING ((studio_id = public.current_studio_id()))
  WITH CHECK ((studio_id = public.current_studio_id()));

GRANT ALL ON TABLE public.plantillas_email TO anon;
GRANT ALL ON TABLE public.plantillas_email TO authenticated;
GRANT ALL ON TABLE public.plantillas_email TO service_role;
