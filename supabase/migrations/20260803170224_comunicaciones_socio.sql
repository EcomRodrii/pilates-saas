-- Historial real de comunicaciones a socias. Antes, la ficha de clienta
-- (app/(dashboard)/clientas/[id]/page.tsx) llevaba un comentario literal
-- "Fake communications log (stored locally per clienta)": un useState de
-- React que nunca se persistía. Se perdía al navegar/recargar y nadie podía
-- comprobar si un email realmente salió. Se persiste tanto el éxito como el
-- fallo (mismo criterio que 'cero escritura optimista sin comprobar el
-- resultado real' de este repo): un email que Resend rechaza debe quedar
-- registrado como FALLIDO, no desaparecer sin más.
CREATE TABLE IF NOT EXISTS public.comunicaciones_socio (
  id                 text PRIMARY KEY,
  studio_id          text NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  socio_id           text NOT NULL REFERENCES public.socios(id) ON DELETE CASCADE,
  tipo               text NOT NULL CHECK (tipo IN ('recibo', 'bienvenida', 'reserva', 'automatizacion', 'promocion', 'cancelacion', 'cambio', 'recordatorio')),
  asunto             text NOT NULL,
  estado             text NOT NULL DEFAULT 'ENVIADO' CHECK (estado IN ('ENVIADO', 'FALLIDO')),
  error              text,
  resend_id          text,
  creado_por         uuid,
  creado_por_nombre  text,
  creado_en          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comunicaciones_socio_socio ON public.comunicaciones_socio (socio_id, creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_comunicaciones_socio_studio ON public.comunicaciones_socio (studio_id);

ALTER TABLE public.comunicaciones_socio ENABLE ROW LEVEL SECURITY;

-- Solo lectura para authenticated, y solo para quien ya gestiona clientas
-- (espejo de puedeGestionarClientas en lib/permisos-reglas.ts) — INSTRUCTOR no
-- gestiona clientas y no debe ver a quién se le escribió ni con qué asunto.
-- Sin política de escritura para authenticated a propósito: el INSERT solo lo
-- hace el servidor (service-role) tras comprobar el resultado real de Resend
-- en app/api/emails/send — nadie desde el cliente puede insertar un "le
-- mandé esto" falso.
CREATE POLICY comunicaciones_socio_lectura ON public.comunicaciones_socio
  FOR SELECT TO authenticated
  USING (
    studio_id = public.current_studio_id()
    AND public.current_rol() IN ('PROPIETARIO', 'MANAGER', 'RECEPCION')
  );

GRANT SELECT ON public.comunicaciones_socio TO authenticated;
GRANT SELECT, INSERT ON public.comunicaciones_socio TO service_role;
