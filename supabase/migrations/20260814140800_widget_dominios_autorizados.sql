-- Lista blanca de orígenes (esquema://host[:puerto]) desde los que el
-- estudio autoriza a incrustar el bundle embebible (Modo B, script+div sin
-- iframe). Sin iframe no hay same-origin gratis, así que los endpoints
-- públicos que use ese bundle necesitan CORS explícito por estudio — nunca
-- un wildcard. Nullable/'{}' = sin dominios autorizados aún (el bundle no
-- funcionará hasta que la propietaria copie su(s) dominio(s) en el panel).
alter table public.studios
  add column widget_dominios_autorizados text[] not null default '{}'::text[];
