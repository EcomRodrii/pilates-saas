-- `changelog_versiones.creado_por` es informativo (quién lo creó), no una
-- dependencia real — a diferencia de plataforma_permiso.auth_user_id (que sí
-- se borra en cascada porque sin persona no hay permiso), aquí la versión del
-- changelog debe seguir existiendo aunque esa persona deje el equipo interno.
-- Sin este fix, dar de baja a un admin (borrar su fila de plataforma_admin)
-- fallaba por violación de FK si alguna vez había creado una versión.
alter table public.changelog_versiones
  drop constraint changelog_versiones_creado_por_fkey,
  add constraint changelog_versiones_creado_por_fkey
    foreign key (creado_por) references public.plataforma_admin(auth_user_id) on delete set null;
