-- 0035_fase0_indices_checks_grants.sql
-- Auditoría Total 2026-07 · Fase 0 (cimientos). Tres bloques, todos de bajo riesgo:
--   (1) Índices en FKs calientes que hoy hacen seq-scan (instructor_id, socio_id, y FKs sueltos).
--   (2) CHECKs de integridad (no-negatividad de dinero/aforo, rol acotado) creados NOT VALID:
--       NO validan filas existentes (no rompen el deploy si hubiera datos legacy sucios),
--       pero SÍ aplican a toda escritura nueva. Se pueden VALIDATE aparte tras limpiar datos.
--   (3) Revocar el GRANT ALL ... TO anon frágil en 4 tablas. Solo se revoca de `anon`:
--       `authenticated` conserva el grant porque lo necesita para que RLS se evalúe.
-- Los índices usan IF NOT EXISTS (reejecutables). Los CHECK/REVOKE se aplican una vez
-- (la migración corre en una transacción: si algo falla, revierte entera y limpia).

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- (1) Índices en FK sin índice
-- ─────────────────────────────────────────────────────────────────────────────

-- instructor_id (ninguna de estas lo indexaba): "clases/citas/notas por instructor"
-- y los cascades SET NULL al borrar un instructor hacían seq-scan.
CREATE INDEX IF NOT EXISTS idx_sesiones_instructor        ON public.sesiones            (instructor_id);
CREATE INDEX IF NOT EXISTS idx_citas_instructor           ON public.citas              (instructor_id);
CREATE INDEX IF NOT EXISTS idx_notas_progreso_instructor  ON public.notas_progreso     (instructor_id);
CREATE INDEX IF NOT EXISTS idx_videos_instructor          ON public.videos_on_demand   (instructor_id);
CREATE INDEX IF NOT EXISTS idx_ventas_pos_instructor      ON public.ventas_pos         (instructor_id);
CREATE INDEX IF NOT EXISTS idx_mensajes_equipo_autor      ON public.mensajes_equipo    (autor_instructor_id);
CREATE INDEX IF NOT EXISTS idx_preferencias_instr_fav     ON public.preferencias_socio (instructor_favorito_id);

-- socio_id en tablas de historial/transacción que solo indexaban studio_id.
-- La ficha de socio (fetch de su historial) hacía N seq-scans.
CREATE INDEX IF NOT EXISTS idx_citas_socio                ON public.citas              (socio_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_socio  ON public.credit_transactions(socio_id);
CREATE INDEX IF NOT EXISTS idx_ventas_pos_socio           ON public.ventas_pos         (socio_id);
CREATE INDEX IF NOT EXISTS idx_actividad_reciente_socio   ON public.actividad_reciente (socio_id);
CREATE INDEX IF NOT EXISTS idx_achievement_history_socio  ON public.achievement_history(socio_id);
CREATE INDEX IF NOT EXISTS idx_challenge_history_socio    ON public.challenge_history  (socio_id);
CREATE INDEX IF NOT EXISTS idx_reward_history_socio       ON public.reward_history     (socio_id);
CREATE INDEX IF NOT EXISTS idx_reward_redemptions_socio   ON public.reward_redemptions (socio_id);
CREATE INDEX IF NOT EXISTS idx_reward_actions_socio       ON public.reward_actions     (socio_id);
CREATE INDEX IF NOT EXISTS idx_notas_internas_socio       ON public.notas_internas     (socio_id);

-- FKs sueltos usados en joins/filtros del calendario y facturación.
CREATE INDEX IF NOT EXISTS idx_sesiones_sala              ON public.sesiones      (sala_id);
CREATE INDEX IF NOT EXISTS idx_sesiones_tipo_clase        ON public.sesiones      (tipo_clase_id);
CREATE INDEX IF NOT EXISTS idx_facturas_recibo            ON public.facturas      (recibo_id);
CREATE INDEX IF NOT EXISTS idx_suscripciones_plan         ON public.suscripciones (plan_id);
CREATE INDEX IF NOT EXISTS idx_reservas_spot              ON public.reservas      (spot_id);
CREATE INDEX IF NOT EXISTS idx_socios_referido_por        ON public.socios        (referido_por);

-- ─────────────────────────────────────────────────────────────────────────────
-- (2) CHECKs de integridad (NOT VALID: aplican a escrituras nuevas, no rompen deploy)
-- ─────────────────────────────────────────────────────────────────────────────

-- No-negatividad de dinero (nullables → el CHECK permite NULL).
ALTER TABLE public.recibos        ADD CONSTRAINT recibos_importe_no_negativo        CHECK (importe        >= 0) NOT VALID;
ALTER TABLE public.ventas_pos     ADD CONSTRAINT ventas_pos_subtotal_no_negativo    CHECK (subtotal       >= 0) NOT VALID;
ALTER TABLE public.ventas_pos     ADD CONSTRAINT ventas_pos_total_no_negativo        CHECK (total          >= 0) NOT VALID;
ALTER TABLE public.planes_tarifa  ADD CONSTRAINT planes_tarifa_precio_no_negativo    CHECK (precio         >= 0) NOT VALID;
ALTER TABLE public.productos_pos  ADD CONSTRAINT productos_pos_precio_no_negativo    CHECK (precio         >= 0) NOT VALID;
ALTER TABLE public.sesiones       ADD CONSTRAINT sesiones_precio_puntual_no_negativo CHECK (precio_puntual >= 0) NOT VALID;
ALTER TABLE public.citas          ADD CONSTRAINT citas_precio_no_negativo            CHECK (precio         >= 0) NOT VALID;

-- Aforo no negativo.
ALTER TABLE public.sesiones       ADD CONSTRAINT sesiones_aforo_no_negativo          CHECK (aforo_maximo   >= 0) NOT VALID;

-- Rol acotado: current_rol() lo lee y alimenta las policies RLS `= 'PROPIETARIO'`.
-- Sin este CHECK, una escritura errónea a instructores.rol podía romper el modelo de permisos.
ALTER TABLE public.instructores   ADD CONSTRAINT instructores_rol_valido
  CHECK (rol IN ('PROPIETARIO', 'INSTRUCTOR', 'RECEPCION')) NOT VALID;

-- ─────────────────────────────────────────────────────────────────────────────
-- (3) Revocar GRANT ALL ... TO anon frágil (RLS-only → defensa en profundidad)
--     Se revoca SOLO de anon. `authenticated` conserva el grant (lo necesita para RLS).
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON TABLE public.comentarios_comunidad          FROM anon;
REVOKE ALL ON TABLE public.campos_personalizados          FROM anon;
REVOKE ALL ON TABLE public.plantillas_email               FROM anon;
REVOKE ALL ON TABLE public.instructor_dependency_snapshots FROM anon;

COMMIT;
