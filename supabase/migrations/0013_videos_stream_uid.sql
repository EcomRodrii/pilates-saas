-- ═══════════════════════════════════════════════════════════════════════════
-- 0013 · Vídeos on-demand — hosting real (Cloudflare Stream)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- CONTEXTO (ronda de conectividad "que todo tenga conexión")
-- La página /ondemand dejaba "subir" vídeos pero el modal solo capturaba
-- metadatos (título, categoría, duración a mano) — sin fichero, sin hosting, sin
-- reproductor. El portal de la socia mostraba "Reproducción en preparación". Era
-- una fachada completa: no había forma de referenciar un vídeo alojado.
--
-- Esta migración añade `stream_uid`: el identificador del asset en Cloudflare
-- Stream (mismo cloud que ya usa R2). Con él, el reproductor embebe el iframe de
-- Stream (que gestiona por sí mismo el transcodificado, el estado "procesando",
-- el thumbnail y el streaming adaptativo — por eso no hacen falta más columnas).
-- Las filas antiguas quedan con stream_uid NULL → siguen mostrando el placeholder
-- (no se rompe nada). El acceso va por /api/ondemand/upload-url con el token de
-- Stream en servidor; sin él, la subida degrada a metadatos como hasta ahora.
--
-- Reversible: DROP COLUMN (additiva, no afecta a filas existentes).
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.videos_on_demand
  ADD COLUMN IF NOT EXISTS stream_uid text;
