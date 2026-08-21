-- Canales del estudio (web + redes) — la mitad que NO va en el tema.
--
-- Las cuatro redes sociales (Instagram, Facebook, TikTok, WhatsApp) viven en
-- `studio_theme.config_draft/config_published` → `redesSociales`: son parte de
-- la apariencia del portal white-label (qué iconos salen en el pie de la página
-- pública) y ahí estaban ya las tres primeras desde la Fase 3 del Theme
-- Builder. TikTok entra ahí sin migración: es JSONB.
--
-- La WEB no. Una web no es una red social: es el dato de contacto del negocio,
-- hermano de `email`, `telefono` y `direccion`, que ya son columnas de esta
-- misma tabla. Y sus consumidores no cargan el tema — el pie de los correos
-- (lib/emails/marca.ts), el SEO del estudio (lib/studio-seo.ts) y la ficha
-- pública leen `studios` y solo `studios`. En el tema, cada uno de ellos
-- tendría que pedir una tabla más para pintar un enlace de contacto.
--
-- Sin CHECK de formato a propósito: mismo criterio que el resto de canales —
-- se guarda tal cual lo teclea la propietaria («tuestudio.com» es una respuesta
-- legítima) y quien decide si eso da para un enlace seguro es el RENDER
-- (`hrefCanal`, lib/canales-estudio.ts), no el guardado. Un CHECK aquí
-- rechazaría la forma en que la gente escribe de verdad su web.
--
-- Puramente aditiva: NULL = no la ha puesto. Ninguna política RLS nueva: la
-- columna hereda las políticas de tabla que ya existen (la propietaria
-- actualiza su estudio con su sesión).
--
-- ⚠️ Y ningún GRANT nuevo, pero NO porque `studios` no tenga grants por
-- columna — sí los tiene. `anon` quedó acotado a once columnas mínimas
-- (id, nombre, slug, ciudad, color_primario, tema_portal, avatar_admin y las
-- cuatro de política de reserva) en `20260820165632_cierra_lectura_anon_cross_tenant`,
-- así que una columna nueva nace INVISIBLE para `anon`. Verificado en vivo
-- contra `information_schema.column_privileges` antes de escribir esto.
--
-- `sitio_web` se queda fuera de esa lista A PROPÓSITO, igual que `email`,
-- `telefono` y `direccion`, que tampoco están: al portal llega por
-- `studioPublico()`, que usa service-role (SELECT sobre la tabla entera). Si
-- algún día hiciera falta leerla como `anon`, el GRANT va añadido a esa lista
-- blanca de forma explícita — nunca abriendo la tabla entera.

alter table public.studios
  add column if not exists sitio_web text;

comment on column public.studios.sitio_web is
  'Web propia del estudio. Canal de contacto, no red social (esas van en studio_theme.redesSociales). Se guarda tal cual se teclea; el enlace lo resuelve hrefCanal() en lib/canales-estudio.ts.';
