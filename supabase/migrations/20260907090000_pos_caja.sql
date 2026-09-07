-- ═══════════════════════════════════════════════════════════════════════════
-- POS · Caja real: sesiones de caja y libro de movimientos
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Hasta hoy "Cerrar caja" era un MODAL que sumaba las ventas del día
-- (app/(dashboard)/pos/page.frozen.tsx:82). No había fondo inicial, ni
-- conteo, ni diferencia, ni entradas/salidas manuales, ni rastro de quién
-- abrió o cerró. Cuadrar con el banco era imposible: el efectivo que entra
-- por la mañana en el cajón y el que sale para pagar al mensajero no existían
-- para el sistema.
--
-- Dos tablas, no una:
--   · `cajas`             — la SESIÓN (turno): apertura, fondo, cierre, arqueo.
--   · `movimientos_caja`  — el LIBRO: una fila por hecho, append-only.
--
-- El saldo esperado NO se guarda como columna: se DERIVA sumando el libro
-- (`fondo_inicial + Σ movimientos en efectivo`). Guardarlo sería un segundo
-- sitio donde puede quedar mal, y el bug clásico de toda caja es justo ese —
-- el contador y el detalle discrepando sin que nadie sepa cuál miente.
--
-- Append-only de verdad: sin política de UPDATE ni de DELETE sobre
-- `movimientos_caja`. Una salida registrada por error se corrige con otra
-- entrada que la compensa, como en cualquier libro contable — nunca borrando.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Sesiones de caja ────────────────────────────────────────────────────────
CREATE TABLE public.cajas (
    id                text PRIMARY KEY,
    studio_id         text NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,

    estado            text NOT NULL DEFAULT 'ABIERTA'
                        CHECK (estado IN ('ABIERTA', 'CERRADA')),

    -- Apertura
    fondo_inicial     numeric(10,2) NOT NULL DEFAULT 0 CHECK (fondo_inicial >= 0),
    abierta_en        timestamptz NOT NULL DEFAULT now(),
    abierta_por       uuid,
    -- Snapshot del nombre: quien abrió la caja puede darse de baja del equipo
    -- después, y el arqueo de hace ocho meses tiene que seguir diciendo quién
    -- fue. Mismo criterio que `devoluciones.suscripcion_id` (copia congelada).
    abierta_por_nombre text,

    -- Cierre (NULL mientras está abierta)
    cerrada_en        timestamptz,
    cerrada_por       uuid,
    cerrada_por_nombre text,
    -- Lo que la persona CONTÓ físicamente en el cajón. No se deriva de nada.
    efectivo_contado  numeric(10,2) CHECK (efectivo_contado IS NULL OR efectivo_contado >= 0),
    -- Lo que el sistema decía que debía haber, CONGELADO en el momento del
    -- cierre. Sí se guarda (a diferencia del esperado en vivo) porque es un
    -- hecho histórico: recalcularlo meses después con un libro que pudo crecer
    -- daría otro número y el arqueo dejaría de cuadrar consigo mismo.
    efectivo_esperado numeric(10,2),
    -- efectivo_contado - efectivo_esperado. Negativo = falta dinero.
    diferencia        numeric(10,2),
    notas_cierre      text
);

-- Solo puede haber UNA caja abierta por estudio. Es la invariante que hace
-- que "la venta va a la caja abierta" no sea ambiguo: sin esto, dos aperturas
-- accidentales parten el arqueo del día en dos y ninguno cuadra.
CREATE UNIQUE INDEX cajas_una_abierta_por_estudio
  ON public.cajas (studio_id)
  WHERE estado = 'ABIERTA';

CREATE INDEX idx_cajas_studio_abierta_en ON public.cajas (studio_id, abierta_en DESC);

-- ─── Libro de movimientos ────────────────────────────────────────────────────
CREATE TABLE public.movimientos_caja (
    id           text PRIMARY KEY,
    studio_id    text NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
    caja_id      text NOT NULL REFERENCES public.cajas(id) ON DELETE CASCADE,

    tipo         text NOT NULL
                   CHECK (tipo IN ('APERTURA', 'VENTA', 'DEVOLUCION', 'ENTRADA', 'SALIDA', 'CIERRE')),

    -- SIEMPRE con signo: una devolución o una salida son negativas. Así el
    -- saldo es un `sum(importe)` y no un `case` repartido por seis sitios que
    -- tarde o temprano diverge.
    importe      numeric(10,2) NOT NULL,

    -- El método importa porque solo el EFECTIVO está físicamente en el cajón:
    -- una venta con tarjeta es un movimiento del libro pero NO mueve el arqueo.
    metodo_pago  text NOT NULL DEFAULT 'EFECTIVO'
                   CHECK (metodo_pago IN ('EFECTIVO','TARJETA','BIZUM','TRANSFERENCIA','DATAFONO','OTRO')),

    concepto     text NOT NULL,
    -- A qué apunta: id de venta, de devolución… Texto libre a propósito, sin
    -- FK: el libro no debe poder romperse porque el objeto al que apunta
    -- cambie. Es un registro de lo que pasó, no un índice.
    referencia   text,
    metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,

    creado_en    timestamptz NOT NULL DEFAULT now(),
    creado_por   uuid,
    creado_por_nombre text
);

CREATE INDEX idx_movimientos_caja_caja ON public.movimientos_caja (caja_id, creado_en);
CREATE INDEX idx_movimientos_caja_studio ON public.movimientos_caja (studio_id, creado_en DESC);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
-- Mismo shape exacto que `ventas_pos` (0112/0114): leer exige ver finanzas,
-- escribir exige mover dinero. INSTRUCTOR y MANAGER quedan fuera de las dos —
-- MANAGER no toca caja, igual que no toca cobros (BLOQUEADO_MANAGER incluye
-- /cobros en lib/permisos-reglas.ts:59).
--
-- El base hace ALTER DEFAULT PRIVILEGES ... GRANT ALL a anon/authenticated
-- para toda tabla nueva de public, así que hay que REVOCAR explícitamente:
-- la RLS ya bastaría, pero sin grant de tabla tampoco hay por dónde entrar.
ALTER TABLE public.cajas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimientos_caja ENABLE ROW LEVEL SECURITY;

--
-- ⚠️ Se revoca también a `authenticated`, no solo a `anon`. Verificado en vivo
-- contra este proyecto (execute_sql + ROLLBACK): una tabla nueva de `public`
-- nace con INSERT/UPDATE/DELETE concedidos a `authenticated` por el
-- pg_default_acl, y un `GRANT SELECT` posterior NO retira los otros tres. La
-- RLS sin política de escritura ya los bloquearía, pero aquí el criterio es el
-- mismo que dejó escrito `reconciliaciones_pos`: sin grant de tabla tampoco
-- hay por dónde entrar.
REVOKE ALL ON TABLE public.cajas FROM anon, authenticated;
REVOKE ALL ON TABLE public.movimientos_caja FROM anon, authenticated;
GRANT SELECT ON TABLE public.cajas TO authenticated;
GRANT SELECT ON TABLE public.movimientos_caja TO authenticated;
GRANT ALL ON TABLE public.cajas TO service_role;
GRANT ALL ON TABLE public.movimientos_caja TO service_role;

CREATE POLICY cajas_lectura ON public.cajas
  FOR SELECT TO authenticated
  USING (studio_id = public.current_studio_id() AND public.puede_ver_finanzas());

CREATE POLICY movimientos_caja_lectura ON public.movimientos_caja
  FOR SELECT TO authenticated
  USING (studio_id = public.current_studio_id() AND public.puede_ver_finanzas());

-- Sin políticas de INSERT/UPDATE/DELETE a propósito, para ninguna de las dos:
-- abrir, cerrar y mover caja pasa SIEMPRE por las RPC de servidor
-- (20260907090400_pos_rpc_caja.sql), que corren con service_role y saltan la
-- RLS. Una caja que el navegador pudiera escribir directamente no es una caja,
-- es una sugerencia — y el arqueo dejaría de significar nada.

COMMENT ON TABLE public.cajas IS
  'POS: sesión de caja (turno). Una sola ABIERTA por estudio (índice parcial cajas_una_abierta_por_estudio). El saldo esperado se DERIVA de movimientos_caja; solo se congela al cerrar.';
COMMENT ON TABLE public.movimientos_caja IS
  'POS: libro append-only de la caja. Importe SIEMPRE con signo (salidas y devoluciones negativas). Sin UPDATE ni DELETE: un error se corrige con un movimiento que lo compensa, nunca borrando.';
COMMENT ON COLUMN public.movimientos_caja.metodo_pago IS
  'Solo EFECTIVO mueve el arqueo físico del cajón; el resto queda en el libro para el desglose por método.';
