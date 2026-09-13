-- Tentare Network — el documento de identidad y el certificado dejan de ser
-- obligatorios en la fila UNA VEZ RESUELTOS.
--
-- Hasta aquí `documento_path` era NOT NULL en las dos tablas, así que la única
-- forma de «guardar solo el resultado» era conservar la imagen del DNI para
-- siempre. Al resolver (aprobar o rechazar) el servidor borra ahora el binario
-- de `red-documentos-identidad` y anula el path
-- (lib/network/documentos-servidor.ts, `purgarDocumentoResuelto`), detrás de
-- `CONSERVAR_DOCUMENTO_TRAS_VERIFICAR` (decisión pendiente de revisión legal).
--
-- Lo que queda en la fila: estado, motivo_rechazo, resuelto_en, resuelto_por y
-- `documento_borrado_en` (cuándo se borró la imagen, para poder demostrarlo).
--
-- El CHECK conserva la integridad de lo VIVO: una verificación o certificación
-- pendiente o en revisión sigue necesitando su documento — sin él no hay nada
-- que revisar. Las filas actuales lo cumplen (todas llevan path).

alter table public.red_verificaciones_identidad
  alter column documento_path drop not null;

alter table public.red_verificaciones_identidad
  add column if not exists documento_borrado_en timestamptz;

alter table public.red_verificaciones_identidad
  add constraint red_verificaciones_identidad_documento_si_viva
  check (estado not in ('pendiente', 'en_revision') or documento_path is not null);

comment on column public.red_verificaciones_identidad.documento_borrado_en is
  'Cuándo se borró del Storage la imagen del documento tras resolver. NULL = no borrada (o fila anterior a la minimización).';

alter table public.red_certificaciones
  alter column documento_path drop not null;

alter table public.red_certificaciones
  add column if not exists documento_borrado_en timestamptz;

alter table public.red_certificaciones
  add constraint red_certificaciones_documento_si_viva
  check (estado not in ('pendiente', 'en_revision') or documento_path is not null);

comment on column public.red_certificaciones.documento_borrado_en is
  'Cuándo se borró del Storage el certificado tras resolver. NULL = no borrado (o fila anterior a la minimización).';
