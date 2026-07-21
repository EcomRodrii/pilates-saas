-- Integración Gmail (Configuración → Integraciones): igual patrón que Google
-- Calendar — una app de Google para toda la plataforma (GOOGLE_CLIENT_ID/
-- SECRET), cada estudio conecta su propia cuenta por OAuth. El access/refresh
-- token vive en integracion_credenciales (provider='gmail', tabla ya
-- existente y genérica por proveedor); aquí solo hace falta el email de
-- referencia que pinta la UI para saber qué cuenta está conectada.

ALTER TABLE public.studios
  ADD COLUMN gmail_email text;

COMMENT ON COLUMN public.studios.gmail_email IS
  'Email de la cuenta de Gmail conectada (OAuth). NULL = no conectado.';
