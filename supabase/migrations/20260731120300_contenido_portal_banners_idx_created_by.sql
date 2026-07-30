-- get_advisors (performance) señaló contenido_portal_banners_created_by_fkey sin
-- índice de cobertura tras 20260731120100_contenido_portal. Se añade aquí.
create index idx_contenido_portal_banners_created_by on public.contenido_portal_banners(created_by);
