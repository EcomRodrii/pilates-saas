-- Integración Zoom (Configuración → Integraciones): pasa de Server-to-Server
-- OAuth (una sola cuenta de Zoom para toda la plataforma, ya insuficiente —
-- ver PR de reversión) al mismo patrón que Google Calendar/Gmail: una app de
-- Zoom para toda la plataforma (ZOOM_CLIENT_ID/SECRET), cada estudio conecta
-- su PROPIA cuenta de Zoom por OAuth. El access/refresh token vive en
-- integracion_credenciales (provider='zoom', tabla ya existente y genérica
-- por proveedor); aquí solo hace falta el email de referencia que pinta la
-- UI para saber qué cuenta está conectada.

ALTER TABLE public.studios
  ADD COLUMN zoom_email text;

COMMENT ON COLUMN public.studios.zoom_email IS
  'Email de la cuenta de Zoom conectada (OAuth). NULL = no conectado.';
