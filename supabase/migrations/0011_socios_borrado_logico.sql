-- ═══════════════════════════════════════════════════════════════════════════
-- 0011 · A-3/A-4: borrado lógico + anonimización de socias (retención fiscal)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- CONTEXTO (due diligence, hallazgos A-3/A-4)
-- deleteSocio hacía un DELETE físico de la fila `socios`. Cadena de FKs:
--   · recibos.socio_id           → ON DELETE CASCADE  (se borraban los recibos)
--   · facturas.recibo_id         → RESTRICT           (bloquea si el recibo tiene factura)
--   · ventas_pos.socio_id        → RESTRICT
--   · actividad_reciente.socio_id→ RESTRICT
-- Resultado real: o el DELETE fallaba a medias por el RESTRICT (dejando a la UI
-- con la socia ya quitada en local → estado fantasma), o —para socias sin
-- factura— arrastraba sus recibos, destruyendo registros con obligación de
-- conservación fiscal (facturas/recibos: 4-6 años). Además la ficha clínica
-- (dato de salud) y las notas no se borraban de forma controlada.
--
-- Fix (aplicado en /api/socios/eliminar, server-authoritative): NO se borra la
-- fila. Se marca `borrado_en` y se ANONIMIZA el PII de la socia; se conservan
-- recibos, facturas y ventas_pos (fiscal) y se cancelan (no se borran) sus
-- suscripciones; se ELIMINAN los datos personales sin base de retención (ficha
-- clínica, respuestas de sesión, notas). El panel filtra `borrado_en IS NULL`,
-- así la socia desaparece de los listados pero su rastro fiscal queda intacto.
--
-- Esta migración solo añade la columna. Reversible: el DROP COLUMN no afecta a
-- ninguna fila existente (todas quedan con borrado_en NULL = activa).
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.socios
  ADD COLUMN IF NOT EXISTS borrado_en timestamptz;

-- El panel consulta socias vivas por estudio; índice parcial para ese filtro.
CREATE INDEX IF NOT EXISTS idx_socios_vivas
  ON public.socios (studio_id)
  WHERE borrado_en IS NULL;
