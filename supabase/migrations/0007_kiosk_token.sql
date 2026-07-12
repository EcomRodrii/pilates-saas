-- ═══════════════════════════════════════════════════════════════════════════
-- 0007 · C-2: token de dispositivo para el check-in de kiosko
-- ═══════════════════════════════════════════════════════════════════════════
--
-- CONTEXTO (due diligence, hallazgo C-2)
-- /api/public/checkin no exige NINGUNA autenticación: acepta {studioId,
-- reservaId} y marca la reserva ASISTIDA + mintea créditos canjeables y premios
-- de referido (supabase-data.ts:1791). Amplificado porque /api/public/studio-data
-- devuelve TODOS los reservaId del estudio a cualquiera con solo el slug. Un
-- atacante enumera ids y falsifica asistencias en masa en cualquier estudio.
--
-- Fix: el endpoint pasa a exigir el token de kiosko del estudio (cabecera
-- x-kiosk-token). Con token inválido/ausente, ni con ids enumerados se puede
-- hacer nada → la enumeración queda inofensiva. El token se genera/rota desde
-- Configuración (pendiente de cablear en UI) y se guarda en el dispositivo de
-- recepción.
--
-- `kiosk_token` es NULL por defecto: mientras el estudio no genere uno, el
-- check-in público queda CERRADO (el endpoint rechaza), que es el lado seguro.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.studios
  ADD COLUMN IF NOT EXISTS kiosk_token text;

-- El token solo se lee/escribe con service-role (rutas de servidor) o por la
-- dueña sobre su propio estudio (política owner_studios ya existente). No se
-- añade a las columnas públicas de anon (migración 0006), así que no se expone.
