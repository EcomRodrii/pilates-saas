-- Tentare Network, Fase F1 — "Actualmente en Tentare", opt-in de la
-- instructora para mostrar en su perfil público los estudios Tentare donde
-- trabaja hoy (join studios<->instructores por auth_user_id, resuelto en el
-- endpoint que sirve el perfil público, NO aquí). Sin RLS nueva: hereda las
-- políticas ya existentes de red_perfiles.

alter table public.red_perfiles
  add column mostrar_estudios_actuales boolean not null default false;

comment on column public.red_perfiles.mostrar_estudios_actuales is
  'Tentare Network F1. Opt-in para mostrar en el perfil público los estudios Tentare actuales de la instructora (join studios<->instructores por auth_user_id resuelto en la API, no aquí).';
