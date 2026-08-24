-- Tentare Network 2.0, Fase 0 (esquema) — hallazgos de get_advisors sobre las
-- migraciones anteriores de esta misma tanda, corregidos en el acto en vez
-- de dejarlos como deuda:
--
-- 1) Índice de cobertura para la FK nueva red_resenas.reserva_id
--    (unindexed_foreign_keys).
-- 2) Políticas RLS de red_perfiles_alumna evaluaban auth.uid()/
--    current_studio_id() por fila (auth_rls_initplan) — mismo patrón que ya
--    corrigieron 20260811015255/20260813222918/20260819212028 en el resto
--    del esquema: envolver en `(select ...)` para que el planner lo evalúe
--    una sola vez.

create index idx_red_resenas_reserva_id on public.red_resenas (reserva_id);

drop policy red_perfiles_alumna_select_propio on public.red_perfiles_alumna;
create policy red_perfiles_alumna_select_propio on public.red_perfiles_alumna
  for select to authenticated
  using (auth_user_id = (select auth.uid()));

drop policy red_perfiles_alumna_select_estudio on public.red_perfiles_alumna;
create policy red_perfiles_alumna_select_estudio on public.red_perfiles_alumna
  for select to authenticated
  using (estado = 'published' and (select public.current_studio_id()) is not null);

drop policy red_perfiles_alumna_insert_propio on public.red_perfiles_alumna;
create policy red_perfiles_alumna_insert_propio on public.red_perfiles_alumna
  for insert to authenticated
  with check (auth_user_id = (select auth.uid()));

drop policy red_perfiles_alumna_update_propio on public.red_perfiles_alumna;
create policy red_perfiles_alumna_update_propio on public.red_perfiles_alumna
  for update to authenticated
  using (auth_user_id = (select auth.uid()))
  with check (auth_user_id = (select auth.uid()));

drop policy red_perfiles_alumna_delete_propio on public.red_perfiles_alumna;
create policy red_perfiles_alumna_delete_propio on public.red_perfiles_alumna
  for delete to authenticated
  using (auth_user_id = (select auth.uid()));
