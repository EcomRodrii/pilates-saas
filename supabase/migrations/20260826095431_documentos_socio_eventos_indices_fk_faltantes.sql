-- get_advisors (performance) tras aplicar documentos_socio/eventos-comunidad
-- señaló 3 FK sin índice cubridor — mismo patrón recurrente que ya cerraron
-- otras migraciones `*_indices_fk_faltantes` de este repo.
create index if not exists idx_documentos_socio_studio on public.documentos_socio(studio_id);
create index if not exists idx_documentos_socio_subido_por on public.documentos_socio(subido_por);
create index if not exists idx_post_evento_asistentes_socio on public.post_evento_asistentes(socio_id);
