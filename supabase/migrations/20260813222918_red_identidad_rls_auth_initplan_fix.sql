-- get_advisors (performance) marcó las policies nuevas de
-- red_perfiles_identidad/red_verificaciones_identidad/red_certificaciones
-- con auth_rls_initplan: auth.uid() se reevalúa POR FILA en vez de una vez
-- por query. Mismo defecto que 0069/20260811015255 ya corrigieron para
-- otras tablas — se resuelve aquí en el mismo PR en vez de arrastrarlo
-- como deuda desde el día uno de estas tres tablas nuevas.

drop policy red_perfiles_identidad_select_propio on public.red_perfiles_identidad;
create policy red_perfiles_identidad_select_propio on public.red_perfiles_identidad
  for select to authenticated
  using (exists (
    select 1 from public.red_perfiles rp
    where rp.id = red_perfiles_identidad.perfil_id and rp.auth_user_id = (select auth.uid())
  ));

drop policy red_perfiles_identidad_insert_propio on public.red_perfiles_identidad;
create policy red_perfiles_identidad_insert_propio on public.red_perfiles_identidad
  for insert to authenticated
  with check (
    exists (
      select 1 from public.red_perfiles rp
      where rp.id = red_perfiles_identidad.perfil_id and rp.auth_user_id = (select auth.uid())
    )
    and telefono_verificado_en is null
    and email_verificado_en is null
  );

drop policy red_perfiles_identidad_update_propio on public.red_perfiles_identidad;
create policy red_perfiles_identidad_update_propio on public.red_perfiles_identidad
  for update to authenticated
  using (exists (
    select 1 from public.red_perfiles rp
    where rp.id = red_perfiles_identidad.perfil_id and rp.auth_user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.red_perfiles rp
    where rp.id = red_perfiles_identidad.perfil_id and rp.auth_user_id = (select auth.uid())
  ));

drop policy red_verificaciones_identidad_select_propio on public.red_verificaciones_identidad;
create policy red_verificaciones_identidad_select_propio on public.red_verificaciones_identidad
  for select to authenticated
  using (exists (
    select 1 from public.red_perfiles rp
    where rp.id = red_verificaciones_identidad.perfil_id and rp.auth_user_id = (select auth.uid())
  ));

drop policy red_verificaciones_identidad_insert_propio on public.red_verificaciones_identidad;
create policy red_verificaciones_identidad_insert_propio on public.red_verificaciones_identidad
  for insert to authenticated
  with check (
    exists (
      select 1 from public.red_perfiles rp
      where rp.id = red_verificaciones_identidad.perfil_id and rp.auth_user_id = (select auth.uid())
    )
    and estado = 'pendiente'
    and resuelto_en is null
    and resuelto_por is null
    and motivo_rechazo is null
  );

drop policy red_certificaciones_select_propio on public.red_certificaciones;
create policy red_certificaciones_select_propio on public.red_certificaciones
  for select to authenticated
  using (exists (
    select 1 from public.red_perfiles rp
    where rp.id = red_certificaciones.perfil_id and rp.auth_user_id = (select auth.uid())
  ));

drop policy red_certificaciones_insert_propio on public.red_certificaciones;
create policy red_certificaciones_insert_propio on public.red_certificaciones
  for insert to authenticated
  with check (
    exists (
      select 1 from public.red_perfiles rp
      where rp.id = red_certificaciones.perfil_id and rp.auth_user_id = (select auth.uid())
    )
    and estado = 'pendiente'
    and resuelto_en is null
    and resuelto_por is null
    and motivo_rechazo is null
  );

drop policy red_certificaciones_delete_propio_pendiente on public.red_certificaciones;
create policy red_certificaciones_delete_propio_pendiente on public.red_certificaciones
  for delete to authenticated
  using (
    estado = 'pendiente'
    and exists (
      select 1 from public.red_perfiles rp
      where rp.id = red_certificaciones.perfil_id and rp.auth_user_id = (select auth.uid())
    )
  );

-- Storage: el mismo defecto en la policy de INSERT del bucket nuevo.
drop policy red_documentos_identidad_insert_propio on storage.objects;
create policy red_documentos_identidad_insert_propio on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'red-documentos-identidad'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
