-- Una imagen por CAMBIO del changelog, y su bucket.
--
-- El porqué: la sección «Actualizaciones» (#1862) elige la preview por
-- CATEGORÍA de la versión, no por lo que hace cada cambio. Es honesto —una
-- escena de categoría describe el tipo y por tanto nunca miente— pero no
-- enseña lo nuevo. El dato publicado no guardaba en ningún sitio qué pinta una
-- actualización concreta, y deducirlo del texto sería adivinar.
--
-- ⚠️ **Nullable y opcional a propósito, no un hueco por rellenar.** La mitad de
-- lo que entra en una versión no se puede fotografiar: una política de RLS que
-- se cierra, una carrera entre dos transmisiones a la AEAT, un zip bomb
-- acotado. Forzar imagen en todas las entradas obligaría a inventar una
-- ilustración de relleno, que es exactamente lo que `public/por-defecto/
-- README.md` ya prohíbe («la misma foto ocho veces en una pantalla se lee como
-- un error»). Lleva imagen lo que se ve; lo demás, no.
alter table public.changelog_cambios
  add column if not exists imagen_url text;

comment on column public.changelog_cambios.imagen_url is
  'Captura de lo que hace este cambio. NULL = no hay nada que enseñar (seguridad, fontanería). Apunta siempre al bucket changelog-media; lo valida /api/interno/changelog/imagen.';

-- El bucket. Público, como `avatars` y `comunidad-media`: la captura se pinta
-- en un <img src> del panel de cualquier estudio, así que se sirve por
-- `getPublicUrl()`, endpoint que NO evalúa RLS.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'changelog-media',
  'changelog-media',
  true,
  2097152, -- 2 MB: son capturas de pantalla ya recomprimidas, no originales
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

-- ⚠️ **CERO políticas, y es la postura correcta, no un olvido.**
-- `comunidad-media` necesitó INSERT+SELECT para `authenticated` porque quien
-- sube es la propietaria desde su panel. Aquí quien sube es Tentare desde
-- `/interno`, vía `getSupabaseAdmin()` — service_role se salta la RLS — así
-- que ninguna política haría falta y cada una que se añadiera solo abriría
-- superficie. En particular NO se añade SELECT para `anon`/`public`: eso
-- reabriría el listado anónimo del bucket que `0077_avatars_bucket_lockdown`
-- cerró (advisor `public_bucket_allows_listing`).
--
-- Consecuencia que hay que respetar: **ningún cliente puede subir aquí**. Si
-- algún día la subida tuviera que salir del navegador de un admin sin pasar
-- por la API, hace falta una política nueva y pensada, no reutilizar ésta.
