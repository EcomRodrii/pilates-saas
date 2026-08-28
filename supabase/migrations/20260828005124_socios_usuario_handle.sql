-- "Ajustes" (portal): campo "Usuario" (@handle) editable en Mis datos.
-- Decisión de producto ya confirmada: SOLO el campo, sin página pública que
-- lo resuelva — no se construye ninguna ruta nueva que lo consuma.
--
-- Mismo patrón que uq_socios_studio_email (20260730231442): único por
-- estudio (una persona puede tener ficha en varios estudios, cada una con su
-- propio handle, igual que ya pasa con email), case-insensitive, excluye
-- borrado_en para no chocar con una ficha ya dada de baja.
--
-- Formato acotado en un CHECK, no solo en el cliente: minúsculas, dígitos y
-- guion bajo, 3-24 caracteres.
alter table public.socios
  add column usuario text,
  add constraint socios_usuario_formato check (usuario is null or usuario ~ '^[a-z0-9_]{3,24}$');

create unique index uq_socios_studio_usuario on public.socios (studio_id, lower(usuario))
  where usuario is not null and borrado_en is null;
