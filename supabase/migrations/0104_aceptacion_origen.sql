-- ─────────────────────────────────────────────────────────────────────────────
-- De quién es la firma que hay guardada.
--
-- `socios.aceptacion_firma` es el nombre TECLEADO en el momento de aceptar. El
-- alta desde el panel exigía firmar para poder continuar, así que cuando la
-- clienta se apunta por teléfono es la recepcionista quien escribe su nombre.
-- Sobre el papel queda idéntico a una firma de la propia clienta: mismas tres
-- columnas, sin nada que las distinga.
--
-- Para el RGPD (art. 7.1, la carga de la prueba del consentimiento es del
-- responsable) eso no sirve: hay que poder demostrar QUIÉN consintió. Estas dos
-- columnas separan los dos casos en vez de fingir que son el mismo.
--
-- NULL = aceptación anterior a esta migración: no se sabe de dónde vino, y se
-- deja así a propósito en vez de inventar un origen que no consta.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.socios
  add column if not exists aceptacion_origen text
    check (aceptacion_origen in ('PORTAL', 'MOSTRADOR')),
  add column if not exists aceptacion_por text;

comment on column public.socios.aceptacion_origen is
  'PORTAL = la firmó la propia socia desde su portal. MOSTRADOR = la introdujo el estudio en su nombre (presencial/teléfono). NULL = anterior a 0104, sin dato.';
comment on column public.socios.aceptacion_por is
  'Solo con aceptacion_origen = MOSTRADOR: quién del estudio la introdujo. Sin él, una firma presencial es indistinguible de una de la socia.';
