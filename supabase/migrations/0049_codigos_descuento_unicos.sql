-- ═══════════════════════════════════════════════════════════════════════════
-- 0049 · TENTARE — un código de descuento no puede repetirse en un estudio
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `codigos_descuento` solo tenía PK en id e índice en studio_id: NADA impedía dos
-- filas con el mismo `codigo` en el mismo estudio. Con el canje en el POS (0163)
-- eso es un agujero de dinero real:
--
--   · el POS busca el código y canjea UNA fila, sumando el uso solo en esa;
--     la gemela sigue con usos=0, así que un código de UN SOLO USO se puede
--     canjear dos veces.
--   · `crearCodigoReactivacion` (Decision OS) hace check-then-insert; con los
--     reintentos de Inngest, dos ejecuciones concurrentes podían duplicarlo.
--
-- El índice se normaliza igual que la búsqueda del POS (buscarCodigo compara en
-- MAYÚSCULAS y sin espacios), para que 'verano15' y ' VERANO15 ' colisionen —
-- si no, seguirían siendo dos filas distintas que el mostrador ve como la misma.
--
-- Verificado antes de aplicar: no hay duplicados en producción.
-- Reversible: DROP INDEX.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE UNIQUE INDEX IF NOT EXISTS uq_codigo_descuento_estudio
  ON public.codigos_descuento (studio_id, upper(btrim(codigo)));
