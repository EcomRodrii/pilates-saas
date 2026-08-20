-- 21 policies de las tablas red_* (marketplace de instructoras) reevaluaban
-- auth.uid() fila a fila en vez de una vez por consulta (auth_rls_initplan,
-- WARN de get_advisors). Mismo fix ya aplicado a otras tablas del esquema
-- (rls_auth_initplan_fix, 20260811015255_...) que no se replicó aquí cuando
-- se creó el marketplace. Solo cambia auth.uid() -> (select auth.uid()),
-- semántica idéntica, ningún cambio de comportamiento.

alter policy red_perfiles_select_propio on public.red_perfiles
  using (auth_user_id = ( select auth.uid() ));

alter policy red_perfiles_insert_propio on public.red_perfiles
  with check (
    (auth_user_id = ( select auth.uid() )) and (estado = 'draft'::text)
  );

alter policy red_perfiles_delete_propio on public.red_perfiles
  using (
    (auth_user_id = ( select auth.uid() )) and (estado <> 'suspended'::text)
  );

alter policy red_experiencias_select on public.red_experiencias
  using (
    exists (
      select 1 from red_perfiles rp
      where rp.id = red_experiencias.perfil_id
        and (rp.auth_user_id = ( select auth.uid() ) or rp.estado = 'published'::text)
    )
  );

alter policy red_experiencias_insert_propio on public.red_experiencias
  with check (
    exists (
      select 1 from red_perfiles rp
      where rp.id = red_experiencias.perfil_id
        and rp.auth_user_id = ( select auth.uid() )
    )
  );

alter policy red_experiencias_update_propio on public.red_experiencias
  using (
    exists (
      select 1 from red_perfiles rp
      where rp.id = red_experiencias.perfil_id
        and rp.auth_user_id = ( select auth.uid() )
    )
  )
  with check (
    exists (
      select 1 from red_perfiles rp
      where rp.id = red_experiencias.perfil_id
        and rp.auth_user_id = ( select auth.uid() )
    )
  );

alter policy red_experiencias_delete_propio on public.red_experiencias
  using (
    exists (
      select 1 from red_perfiles rp
      where rp.id = red_experiencias.perfil_id
        and rp.auth_user_id = ( select auth.uid() )
    )
  );

alter policy red_verificaciones_select on public.red_verificaciones_experiencia
  using (
    (solicitado_por = ( select auth.uid() ))
    or ((studio_id = current_studio_id()) and puede_gestionar_equipo())
  );

alter policy red_verificaciones_insert_propio on public.red_verificaciones_experiencia
  with check (
    (solicitado_por = ( select auth.uid() ))
    and exists (
      select 1 from red_experiencias re
      join red_perfiles rp on rp.id = re.perfil_id
      where re.id = red_verificaciones_experiencia.experiencia_id
        and rp.auth_user_id = ( select auth.uid() )
    )
  );

alter policy red_referencias_select_propio on public.red_referencias
  using (
    exists (
      select 1 from red_perfiles rp
      where rp.id = red_referencias.perfil_id
        and rp.auth_user_id = ( select auth.uid() )
    )
  );

alter policy red_referencias_insert_propio on public.red_referencias
  with check (
    exists (
      select 1 from red_perfiles rp
      where rp.id = red_referencias.perfil_id
        and rp.auth_user_id = ( select auth.uid() )
    )
  );

alter policy red_referencias_update_propio on public.red_referencias
  using (
    exists (
      select 1 from red_perfiles rp
      where rp.id = red_referencias.perfil_id
        and rp.auth_user_id = ( select auth.uid() )
    )
  )
  with check (
    exists (
      select 1 from red_perfiles rp
      where rp.id = red_referencias.perfil_id
        and rp.auth_user_id = ( select auth.uid() )
    )
  );

alter policy red_solicitudes_contacto_select on public.red_solicitudes_contacto
  using (
    (studio_id = current_studio_id())
    or exists (
      select 1 from red_perfiles rp
      where rp.id = red_solicitudes_contacto.perfil_id
        and rp.auth_user_id = ( select auth.uid() )
    )
  );

alter policy red_solicitudes_contacto_insert_staff on public.red_solicitudes_contacto
  with check (
    (studio_id = current_studio_id()) and (solicitado_por = ( select auth.uid() ))
  );

alter policy red_solicitudes_contacto_update_propio on public.red_solicitudes_contacto
  using (
    exists (
      select 1 from red_perfiles rp
      where rp.id = red_solicitudes_contacto.perfil_id
        and rp.auth_user_id = ( select auth.uid() )
    )
  )
  with check (
    exists (
      select 1 from red_perfiles rp
      where rp.id = red_solicitudes_contacto.perfil_id
        and rp.auth_user_id = ( select auth.uid() )
    )
  );

alter policy red_reportes_insert_authenticated on public.red_reportes
  with check (reportado_por = ( select auth.uid() ));

alter policy red_mensajes_select on public.red_mensajes
  using (
    exists (
      select 1 from red_solicitudes_contacto sc
      where sc.id = red_mensajes.solicitud_id
        and sc.estado = 'aceptada'::text
        and (
          sc.studio_id = current_studio_id()
          or exists (
            select 1 from red_perfiles rp
            where rp.id = sc.perfil_id and rp.auth_user_id = ( select auth.uid() )
          )
        )
    )
  );

alter policy red_mensajes_insert on public.red_mensajes
  with check (
    (remitente = ( select auth.uid() ))
    and exists (
      select 1 from red_solicitudes_contacto sc
      where sc.id = red_mensajes.solicitud_id
        and sc.estado = 'aceptada'::text
        and (
          sc.studio_id = current_studio_id()
          or exists (
            select 1 from red_perfiles rp
            where rp.id = sc.perfil_id and rp.auth_user_id = ( select auth.uid() )
          )
        )
    )
  );

alter policy red_formalizaciones_select on public.red_formalizaciones
  using (
    exists (
      select 1 from red_solicitudes_contacto sc
      where sc.id = red_formalizaciones.solicitud_id
        and sc.estado = 'aceptada'::text
        and (
          sc.studio_id = current_studio_id()
          or exists (
            select 1 from red_perfiles rp
            where rp.id = sc.perfil_id and rp.auth_user_id = ( select auth.uid() )
          )
        )
    )
  );

alter policy red_vacantes_insert on public.red_vacantes
  with check (
    (studio_id = current_studio_id())
    and (publicado_por = ( select auth.uid() ))
    and puede_gestionar_equipo()
    and (estado = 'draft'::text)
  );

alter policy red_candidaturas_select on public.red_candidaturas
  using (
    (studio_id = current_studio_id())
    or exists (
      select 1 from red_perfiles rp
      where rp.id = red_candidaturas.perfil_id and rp.auth_user_id = ( select auth.uid() )
    )
  );
