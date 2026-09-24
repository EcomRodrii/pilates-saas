-- Estudios de demostración y de pruebas del propio equipo: fuera de buscadores.
--
-- Las páginas /reservar/<slug> son indexables desde el 2026-08-17. Sin una marca
-- explícita, la demo del equipo (con horario y reservas de prueba) era
-- indistinguible de un estudio real y acababa en Google bajo tentare.app. La lee
-- lib/seo/estudio-indexable-servidor.ts (robots de la página y sitemap).
--
-- Solo una columna con default: aditiva, compatible con el código anterior.
alter table public.studios
  add column if not exists es_demo boolean not null default false;

comment on column public.studios.es_demo is
  'Estudio de demostración o de pruebas del equipo de Tentare: nunca se indexa su página pública.';
