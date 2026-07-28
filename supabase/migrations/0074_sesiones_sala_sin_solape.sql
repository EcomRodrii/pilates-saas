-- ═══════════════════════════════════════════════════════════════════════════
-- 0071 · TENTARE — dos clases no pueden pisar la misma sala a la vez
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Gemela de sesiones_instructor_sin_solape (0048), pero por SALA: el aviso del
-- formulario del calendario es solo informativo y las series recurrentes y los
-- importadores ni lo ven, así que la base de datos aceptaba dos clases activas
-- solapadas en la misma sala (había 2 pares reales en prod, ambos del estudio
-- demo). La exclusion constraint cierra TODOS los caminos de escritura de
-- forma atómica, igual que ya ocurre con las instructoras.
--
-- Corte temporal: el par solapado del 15-jul (pasado, con reservas) es
-- histórico y no se toca — la restricción solo aplica a sesiones que empiezan
-- a partir del 23-jul-2026 (fecha de esta migración). El literal constante es
-- necesario además porque el WHERE de una exclusion constraint debe ser
-- inmutable (now() no se puede usar).
--
-- Reversible: DROP CONSTRAINT sesiones_sala_sin_solape y revertir el UPDATE.
-- ═══════════════════════════════════════════════════════════════════════════

-- Único solape FUTURO existente (estudio demo studio-1, 0 reservas activas):
-- dos clases distintas en Sala Reformer el 29-jul 07:00. Se mueve la segunda a
-- Sala Mat (verificado libre en ese hueco) para poder crear la restricción.
UPDATE public.sesiones
  SET sala_id = 'sala-2'
WHERE id = 'ses-1783527650448-rsou3'
  AND sala_id = 'sala-1';

-- btree_gist ya existe (0048); se repite por si esta migración corre aislada.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE public.sesiones
  ADD CONSTRAINT sesiones_sala_sin_solape
  EXCLUDE USING gist (
    sala_id WITH =,
    tstzrange(inicio, fin) WITH &&
  )
  WHERE (cancelada = false AND sala_id IS NOT NULL AND inicio >= '2026-07-23T00:00:00Z');
