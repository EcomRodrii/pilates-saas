-- Bucket público `avatars`: deja de admitir `image/svg+xml`.
--
-- Un SVG puede contener script, y en un bucket público no aporta nada que no
-- dé un PNG. La restricción tiene que vivir en el bucket, no solo en las
-- validaciones de cada pantalla. La app solo lo usaba para logos, y el panel
-- ahora ofrece PNG/JPG/WebP (lib/portal-storage.ts).
--
-- Solo afecta a subidas NUEVAS: los objetos SVG que ya existen se siguen
-- sirviendo (allowed_mime_types se comprueba al subir, no al leer).

update storage.buckets
set allowed_mime_types = array_remove(allowed_mime_types, 'image/svg+xml')
where id = 'avatars';

-- Verificación (esperado: true):
--   select 'image/svg+xml' <> all(allowed_mime_types) from storage.buckets where id = 'avatars';
