-- Tentare Network — el wizard prometía "las dos caras" del documento
-- (DNI/NIE) pero solo aceptaba un archivo de punta a punta. `documento_path`
-- pasa a ser semánticamente el ANVERSO (no se renombra, todo el código ya
-- lo lee así); se añade el reverso como columna nullable — Pasaporte no
-- tiene reverso, así que NUNCA es obligatoria a nivel de fila. La regla
-- "reverso obligatorio salvo Pasaporte" se valida en el endpoint (POST
-- /api/network/perfil/verificacion-identidad), no aquí: depende de
-- red_perfiles_identidad.tipo_documento, en otra tabla — no hay CHECK
-- cross-table sin trigger, y esto no es un límite de seguridad (RLS ya
-- protege quién puede escribir cada path), es una regla de completitud de
-- datos que el equipo de revisión también puede detectar a ojo.
alter table public.red_verificaciones_identidad
  add column documento_path_reverso text;

comment on column public.red_verificaciones_identidad.documento_path is
  'Ruta en red-documentos-identidad. Anverso del documento (o única cara para Pasaporte).';
comment on column public.red_verificaciones_identidad.documento_path_reverso is
  'Ruta en red-documentos-identidad. Reverso del documento — NULL si el tipo es Pasaporte (sin reverso) o si es una fila histórica anterior a este cambio.';
