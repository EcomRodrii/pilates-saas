-- Alta del primer (y único, en v1) cliente OAuth: Zapier.
--
-- `client_secret_hash` es sha256(secret) en hex. El secret en claro NUNCA
-- entra en una migración — se generó una vez fuera de banda y se entregó
-- directamente a quien configura la integración en Zapier.
--
-- `redirect_uris` empieza VACÍO a propósito: Zapier no asigna su URL de
-- retorno hasta que la integración se crea en su plataforma de desarrollador
-- (incluye un id numérico que Zapier decide). Sin ninguna URI en la
-- whitelist, /oauth/authorize rechaza cualquier intento — más seguro que
-- adivinar el valor. Se actualiza con una migración de seguimiento en cuanto
-- se conoce la URL real (ver 20260814100600_oauth_zapier_redirect_uri.sql).
insert into public.oauth_clientes
  (id, nombre, descripcion, client_secret_hash, redirect_uris, es_confidencial, activo)
values (
  'zapier',
  'Zapier',
  'Tentare es la plataforma de gestión para estudios de Pilates que centraliza clientes, reservas, pagos, instructores y automatizaciones.',
  '392e7aabdb8732200c09310a25fbb4dd7d321fccc559f7538114e5c59a4d8e46',
  array[]::text[],
  true,
  true
);
