-- ─────────────────────────────────────────────────────────────────────────────
-- Contenido editable por estudio para el portal cliente white-label: mensaje
-- destacado (contenido_portal) + banners NORMALIZADOS en tabla propia, no
-- jsonb (decisión de producto ya tomada).
--
-- Mismo patrón que tipos_clase (admin_tipos_clase + public_read_tipos_clase,
-- 0000_base.sql): SELECT público (anon using true) + escritura solo staff,
-- con el añadido del check de rol (PROPIETARIO/MANAGER) porque aquí sí importa
-- que RECEPCION/INSTRUCTOR no puedan tocar la marca del estudio.
--
-- Nota de tipos: created_by es `text` (no uuid) porque instructores.id es
-- `text` en este esquema.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.contenido_portal (
  studio_id text primary key references public.studios(id) on delete cascade,
  mensaje_destacado text,
  updated_at timestamptz not null default now()
);
alter table public.contenido_portal enable row level security;

create table public.contenido_portal_banners (
  id uuid primary key default gen_random_uuid(),
  studio_id text not null references public.studios(id) on delete cascade,
  imagen_url text not null,
  titulo text,
  texto text,
  link_tipo text not null check (link_tipo in ('interno','externo')),
  link_valor text not null,
  ubicacion text[] not null default '{home}'
    check (ubicacion <@ array['home','clases','perfil','reservas','checkin','bonos','progreso','eventos']),
  activo boolean not null default true,
  orden integer not null default 0,
  fecha_inicio date,
  fecha_fin date,
  created_by text references public.instructores(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.contenido_portal_banners enable row level security;

create index idx_contenido_portal_banners_studio_id on public.contenido_portal_banners(studio_id);
create index idx_contenido_portal_banners_studio_activo on public.contenido_portal_banners(studio_id, activo);

create policy admin_contenido_portal on public.contenido_portal
  for all to authenticated
  using (studio_id = public.current_studio_id()
         and public.current_rol() in ('PROPIETARIO','MANAGER'))
  with check (studio_id = public.current_studio_id()
              and public.current_rol() in ('PROPIETARIO','MANAGER'));
create policy public_read_contenido_portal on public.contenido_portal
  for select to anon using (true);

create policy admin_contenido_portal_banners on public.contenido_portal_banners
  for all to authenticated
  using (studio_id = public.current_studio_id()
         and public.current_rol() in ('PROPIETARIO','MANAGER'))
  with check (studio_id = public.current_studio_id()
              and public.current_rol() in ('PROPIETARIO','MANAGER'));
create policy public_read_contenido_portal_banners on public.contenido_portal_banners
  for select to anon using (true);
