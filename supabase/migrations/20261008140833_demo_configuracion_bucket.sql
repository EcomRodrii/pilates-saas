-- El bucket del vídeo de la demo de Configuración (apartado «Demo»).
--
-- El vídeo (unos 40 MB, 26 min) no cabe en un repo público: vive aquí y la
-- dirección va en `VIDEO_DEMO.url` (lib/configuracion/demo.ts).
--
-- Público de LECTURA, como `changelog-media`: lo ve cualquier propietaria o
-- gerente en un <video src>, así que se sirve por `getPublicUrl()`, que no evalúa
-- RLS. Es un vídeo de un estudio ficticio (datos @example.com): nada que proteger.
--
-- ⚠️ **CERO políticas, a propósito.** Quien sube es Tentare con service_role, que
-- se salta la RLS; añadir un INSERT para `authenticated` solo abriría a cualquiera
-- la escritura de un bucket público. Y NO hay SELECT para `anon`: lo que listaría
-- el bucket entero, y para servir un objeto por URL pública no hace falta.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'demo-configuracion',
  'demo-configuracion',
  true,
  52428800, -- 50 MB: el tope del plan; el vídeo se comprime para caber
  array['video/mp4', 'image/jpeg', 'image/png', 'text/vtt']
)
on conflict (id) do nothing;
