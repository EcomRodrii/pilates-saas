-- ═══════════════════════════════════════════════════════════════════════════
-- 0057 · TENTARE — un solo enlace vigente por instructora+scope (revocación)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Los deep links de instructora (disponibilidad / reportar_baja) son firmados
-- por HMAC y stateless: cualquier token válido firmado en cualquier momento
-- sigue funcionando hasta su caducidad (30 días), y generar uno nuevo NO
-- invalidaba el anterior. Si un enlace se filtra (reenviado por error,
-- capturado en un grupo), no había forma de matarlo antes de que caducara solo.
--
-- Esta tabla guarda el ÚNICO token que reconocemos como vigente para cada
-- (instructora, scope). Al generar un enlace: si el guardado sigue siendo
-- válido, se REUTILIZA (así reabrir el menú del panel para volver a copiarlo
-- no rompe el que ya se mandó por WhatsApp); si ha caducado, se firma uno
-- nuevo y se sobreescribe — ese "sobreescribe" es la revocación: el string
-- antiguo deja de reconocerse aunque su firma siga siendo criptográficamente
-- válida hasta su exp.
--
-- Deliberadamente NO cubre el scope 'aceptar_sustitucion': esos tokens los
-- emite el propio motor (contactarCandidata/recordatorioPorMensaje) en cada
-- paso del escalado, ligados a una sustitución concreta (ref), de vida corta
-- (3h) y sin botón de "regenerar" en el panel — no hay una acción de la
-- propietaria que deba invalidar nada ahí.
--
-- RLS habilitada sin políticas: solo la escribe/lee el service-role desde las
-- rutas de servidor (igual que sustitucion_contactos, rate_limits, etc.).
--
-- Reversible: DROP TABLE public.instructor_enlaces_vigentes;
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.instructor_enlaces_vigentes (
  instructor_id text NOT NULL,
  studio_id text NOT NULL,
  scope text NOT NULL,
  token text NOT NULL,
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT instructor_enlaces_vigentes_pkey PRIMARY KEY (instructor_id, scope),
  CONSTRAINT instructor_enlaces_vigentes_instructor_fkey
    FOREIGN KEY (instructor_id) REFERENCES public.instructores(id) ON DELETE CASCADE,
  CONSTRAINT instructor_enlaces_vigentes_studio_fkey
    FOREIGN KEY (studio_id) REFERENCES public.studios(id) ON DELETE CASCADE,
  CONSTRAINT instructor_enlaces_vigentes_scope_check
    CHECK (scope IN ('disponibilidad', 'reportar_baja'))
);

ALTER TABLE public.instructor_enlaces_vigentes ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.instructor_enlaces_vigentes IS
  'El único token de deep link (disponibilidad/reportar_baja) que reconocemos como vigente por instructora. Generar uno nuevo sobreescribe la fila y revoca el anterior.';
