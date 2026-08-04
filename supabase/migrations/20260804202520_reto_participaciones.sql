-- ─────────────────────────────────────────────────────────────────────────────
-- Participación de una socia en un reto del carrusel de Inicio (tema Bloom).
-- Calcada de favoritos_clase (20260731120000): los retos en sí son contenido
-- FIJO de producto (lib/retos-portal.ts, no una tabla) — solo la participación
-- necesita persistencia real, por eso el CHECK con los keys del código.
--
-- El toggle lo hace un endpoint server-side (app/api/public/retos/route.ts)
-- con el cliente admin de lib/db/supabase-data-admin.ts, mismo patrón que
-- /api/public/favoritos. current_studio_id() SOLO resuelve para staff, no
-- para socios, así que esta tabla no necesita política para anon/socio.
--
-- Nota de tipos: socio_id es `text` (no uuid) porque socios.id es `text` en
-- este esquema.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.reto_participaciones (
  id uuid primary key default gen_random_uuid(),
  studio_id text not null references public.studios(id) on delete cascade,
  socio_id text not null references public.socios(id) on delete cascade,
  reto_key text not null check (reto_key in ('core', 'cara')),
  created_at timestamptz not null default now(),
  unique (socio_id, reto_key)
);

create index idx_reto_participaciones_studio_id on public.reto_participaciones(studio_id);
create index idx_reto_participaciones_socio_id on public.reto_participaciones(socio_id);

alter table public.reto_participaciones enable row level security;

create policy admin_reto_participaciones on public.reto_participaciones
  for all to authenticated
  using (studio_id = public.current_studio_id())
  with check (studio_id = public.current_studio_id());
