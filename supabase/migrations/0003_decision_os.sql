-- Decision OS — Fase A (núcleo). Migración solo de esquema, sin backfill: el
-- sistema arranca frío por diseño (modo aprendizaje, DECISION-OS-NUCLEO.md §9).
-- Definición definitiva: DECISION-OS-MODELO-DATOS.md §4 (enmienda a
-- DECISION-OS-ARQUITECTURA.md §4 tras la revisión adversarial de las Fases 1-8).
-- Reversible: DROP de las 6 tablas no afecta a ninguna tabla existente.

CREATE TABLE public.decision_sessions (
    id text PRIMARY KEY,
    studio_id text NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
    disparado_por text NOT NULL CHECK (disparado_por IN ('CRON','MANUAL','REACTIVO')),
    algorithm_version text NOT NULL,
    iniciado_en timestamptz DEFAULT now(),
    finalizado_en timestamptz,
    snapshot_stats jsonb,
    n_candidatas_generadas integer NOT NULL DEFAULT 0,
    n_candidatas_descartadas integer NOT NULL DEFAULT 0,
    n_recomendaciones_persistidas integer NOT NULL DEFAULT 0,
    resumen_diario_id text,
    errores jsonb,
    estado text NOT NULL DEFAULT 'EN_CURSO' CHECK (estado IN ('EN_CURSO','COMPLETADA','FALLIDA'))
);
CREATE INDEX decision_sessions_studio_fecha ON public.decision_sessions (studio_id, iniciado_en DESC);

CREATE TABLE public.recomendaciones (
    id text PRIMARY KEY,
    studio_id text NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
    decision_session_id text NOT NULL REFERENCES public.decision_sessions(id) ON DELETE CASCADE,
    algorithm_version text NOT NULL,
    especialista text NOT NULL CHECK (especialista IN
      ('RETENCION','INGRESOS','AGENDA','MARKETING','FINANZAS','EQUIPO')),
    tipo text NOT NULL,
    dedupe_key text NOT NULL,
    titulo text NOT NULL,
    motivo text NOT NULL,
    datos_usados jsonb NOT NULL DEFAULT '{}',
    riesgo text NOT NULL DEFAULT 'OPORTUNIDAD' CHECK (riesgo IN ('PERDIDA','OPORTUNIDAD')),
    impacto jsonb,
    confianza jsonb NOT NULL,
    score numeric NOT NULL DEFAULT 0,
    prioridad text NOT NULL CHECK (prioridad IN ('CRITICA','ALTA','MEDIA','BAJA')),
    nivel_autonomia smallint NOT NULL DEFAULT 1 CHECK (nivel_autonomia BETWEEN 0 AND 3),
    accion jsonb NOT NULL,
    socio_id text REFERENCES public.socios(id) ON DELETE CASCADE,
    sesion_id text,
    recibo_id text,
    tiempo_estimado_min integer NOT NULL DEFAULT 2,
    estado text NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN
      ('PENDIENTE','APROBADA','RECHAZADA','EXPIRADA','EJECUTADA','FALLIDA')),
    vista_en timestamptz,
    expira_en timestamptz NOT NULL,
    creado_en timestamptz DEFAULT now(),
    resuelto_en timestamptz,
    resuelto_por text
);
-- Un mismo hecho no genera dos recomendaciones vivas a la vez (índice parcial:
-- una vez resuelta, el motor puede volver a proponer tras el cooldown del tipo).
CREATE UNIQUE INDEX recomendaciones_dedupe_viva
  ON public.recomendaciones (studio_id, dedupe_key)
  WHERE estado IN ('PENDIENTE','APROBADA');
CREATE INDEX recomendaciones_home
  ON public.recomendaciones (studio_id, estado, prioridad, creado_en DESC);
CREATE INDEX recomendaciones_calibracion
  ON public.recomendaciones (tipo, algorithm_version);

CREATE TABLE public.recomendacion_outcomes (
    id text PRIMARY KEY,
    studio_id text NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
    recomendacion_id text NOT NULL REFERENCES public.recomendaciones(id) ON DELETE CASCADE,
    evento text NOT NULL CHECK (evento IN ('APROBADA','RECHAZADA','IGNORADA','EJECUTADA')),
    outcome text NOT NULL DEFAULT 'PENDIENTE' CHECK (outcome IN
      ('POSITIVO','NEGATIVO','NEUTRO','PENDIENTE')),
    senal_observada text CHECK (senal_observada IN
      ('RESERVO','PAGO','RENOVO','CANCELO','SIN_RESPUESTA')),
    ventana_dias integer NOT NULL DEFAULT 14,
    medido_en timestamptz,
    creado_en timestamptz DEFAULT now()
);
CREATE INDEX outcomes_calibracion ON public.recomendacion_outcomes (studio_id, recomendacion_id);

CREATE TABLE public.memoria_socio (
    id text PRIMARY KEY,
    studio_id text NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
    socio_id text NOT NULL REFERENCES public.socios(id) ON DELETE CASCADE,
    clave text NOT NULL,
    valor jsonb NOT NULL DEFAULT '{}',
    nivel text NOT NULL DEFAULT 'MEDIO' CHECK (nivel IN ('CORTO','MEDIO','LARGO')),
    confianza text NOT NULL DEFAULT 'MEDIA' CHECK (confianza IN ('ALTA','MEDIA','BAJA')),
    origen text NOT NULL CHECK (origen IN ('REGLA','FEEDBACK','MANUAL')),
    creado_por text,
    evidencia text NOT NULL DEFAULT '',
    activa boolean NOT NULL DEFAULT true,
    expira_en timestamptz,
    creado_en timestamptz DEFAULT now(),
    actualizado_en timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX memoria_socio_clave ON public.memoria_socio (studio_id, socio_id, clave);

CREATE TABLE public.resumen_diario (
    id text PRIMARY KEY,
    studio_id text NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
    fecha date NOT NULL,
    estado_general text NOT NULL CHECK (estado_general IN
      ('EXCELENTE','ATENCION','ACCION_INMEDIATA')),
    saludo text NOT NULL,
    mientras_dormias jsonb NOT NULL DEFAULT '[]',
    n_decisiones integer NOT NULL DEFAULT 0,
    tiempo_estimado_min integer NOT NULL DEFAULT 0,
    impacto_total jsonb,
    generado_en timestamptz DEFAULT now(),
    UNIQUE (studio_id, fecha)
);

CREATE TABLE public.decision_feature_flags (
    id text PRIMARY KEY,
    studio_id text NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
    flag text NOT NULL CHECK (flag IN
      ('DECISIONES','RETENCION','INGRESOS','FINANZAS','AGENDA','MARKETING','EQUIPO')),
    activo boolean NOT NULL DEFAULT false,
    activado_en timestamptz,
    activado_por text,
    creado_en timestamptz DEFAULT now(),
    UNIQUE (studio_id, flag)
);

-- RLS: mismo patrón owner-only que automation_rules/automation_logs.
ALTER TABLE public.decision_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recomendaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recomendacion_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memoria_socio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resumen_diario ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decision_feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY owner_decision_sessions ON public.decision_sessions TO authenticated
  USING ((current_rol() = 'PROPIETARIO'::text) AND (studio_id = current_studio_id()))
  WITH CHECK ((current_rol() = 'PROPIETARIO'::text) AND (studio_id = current_studio_id()));

CREATE POLICY owner_recomendaciones ON public.recomendaciones TO authenticated
  USING ((current_rol() = 'PROPIETARIO'::text) AND (studio_id = current_studio_id()))
  WITH CHECK ((current_rol() = 'PROPIETARIO'::text) AND (studio_id = current_studio_id()));

CREATE POLICY owner_recomendacion_outcomes ON public.recomendacion_outcomes TO authenticated
  USING ((current_rol() = 'PROPIETARIO'::text) AND (studio_id = current_studio_id()))
  WITH CHECK ((current_rol() = 'PROPIETARIO'::text) AND (studio_id = current_studio_id()));

CREATE POLICY owner_memoria_socio ON public.memoria_socio TO authenticated
  USING ((current_rol() = 'PROPIETARIO'::text) AND (studio_id = current_studio_id()))
  WITH CHECK ((current_rol() = 'PROPIETARIO'::text) AND (studio_id = current_studio_id()));

CREATE POLICY owner_resumen_diario ON public.resumen_diario TO authenticated
  USING ((current_rol() = 'PROPIETARIO'::text) AND (studio_id = current_studio_id()))
  WITH CHECK ((current_rol() = 'PROPIETARIO'::text) AND (studio_id = current_studio_id()));

CREATE POLICY owner_decision_feature_flags ON public.decision_feature_flags TO authenticated
  USING ((current_rol() = 'PROPIETARIO'::text) AND (studio_id = current_studio_id()))
  WITH CHECK ((current_rol() = 'PROPIETARIO'::text) AND (studio_id = current_studio_id()));
