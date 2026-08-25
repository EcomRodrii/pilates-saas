-- Índices para las FKs de red_favoritos_alumna sin cobertura (advisor
-- unindexed_foreign_keys tras la migración anterior). Útiles también para
-- el ON DELETE CASCADE al borrar un estudio o un perfil de red_perfiles.
create index idx_red_favoritos_alumna_studio_id
  on public.red_favoritos_alumna (studio_id);

create index idx_red_favoritos_alumna_perfil_id
  on public.red_favoritos_alumna (perfil_id);
