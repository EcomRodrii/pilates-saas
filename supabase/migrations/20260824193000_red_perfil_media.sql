-- Tentare Network, Fase F1 — portfolio de fotos del perfil profesional.
-- Solo fotos en esta fase: vídeo queda fuera a propósito (feature-freeze de
-- VOD, lib/frozen-features.ts). Mismo patrón de RLS que red_experiencias/
-- red_certificaciones (20260813111206/20260813222513): SELECT público solo
-- si el perfil padre está `published`, escritura solo la dueña vía
-- auth_user_id = auth.uid() con join a red_perfiles.
--
-- Límite de 6 fotos por perfil: es una regla de producto de la UI/API, NO de
-- integridad — no se aplica aquí con CHECK/trigger. Quien programe la API de
-- alta debe respetarlo en el endpoint.
--
-- (select auth.uid()) desde el principio — F0 tuvo que corregir esto después
-- por un advisor auth_rls_initplan, se hace bien a la primera aquí.

create table public.red_perfil_media (
  id text primary key,
  perfil_id text not null references public.red_perfiles(id) on delete cascade,
  tipo text not null default 'foto' check (tipo = 'foto'),
  path text not null,
  orden int not null default 0,
  creado_en timestamptz not null default now()
);

create index idx_red_perfil_media_perfil on public.red_perfil_media (perfil_id);

alter table public.red_perfil_media enable row level security;

create policy red_perfil_media_select_publicado on public.red_perfil_media
  for select to authenticated
  using (exists (
    select 1 from public.red_perfiles rp
    where rp.id = red_perfil_media.perfil_id and rp.estado = 'published'
  ));

create policy red_perfil_media_todo_propio on public.red_perfil_media
  for all to authenticated
  using (exists (
    select 1 from public.red_perfiles rp
    where rp.id = red_perfil_media.perfil_id and rp.auth_user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.red_perfiles rp
    where rp.id = red_perfil_media.perfil_id and rp.auth_user_id = (select auth.uid())
  ));

comment on table public.red_perfil_media is
  'Tentare Network F1. Portfolio de fotos del perfil (solo fotos, vídeo fuera por feature-freeze de VOD). Límite de 6 filas/perfil es regla de producto de la API, no de esquema.';
