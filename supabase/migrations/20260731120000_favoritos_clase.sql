-- ─────────────────────────────────────────────────────────────────────────────
-- Favorito de una socia sobre un TIPO de clase (no una sesión puntual). Portal
-- white-label de clientas.
--
-- El toggle de favorito lo hace un endpoint server-side
-- (app/api/public/favoritos/route.ts) con el cliente admin de
-- lib/db/supabase-data-admin.ts, el mismo patrón que ya usa /api/public/reserva.
-- current_studio_id() SOLO resuelve para staff (propietaria/instructora), no
-- para socios, así que esta tabla no necesita política para anon/socio: la
-- política admin_favoritos_clase es solo para que el staff del dashboard pueda
-- consultar/gestionar desde dentro del estudio si hace falta en el futuro.
--
-- Nota de tipos: socio_id/tipo_clase_id son `text` (no uuid) porque
-- socios.id/tipos_clase.id son `text` en este esquema — un FK uuid contra una
-- PK text no aplicaría.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.favoritos_clase (
  id uuid primary key default gen_random_uuid(),
  studio_id text not null references public.studios(id) on delete cascade,
  socio_id text not null references public.socios(id) on delete cascade,
  tipo_clase_id text not null references public.tipos_clase(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (socio_id, tipo_clase_id)
);

create index idx_favoritos_clase_studio_id on public.favoritos_clase(studio_id);
create index idx_favoritos_clase_socio_id on public.favoritos_clase(socio_id);
create index idx_favoritos_clase_tipo_clase_id on public.favoritos_clase(tipo_clase_id);

alter table public.favoritos_clase enable row level security;

create policy admin_favoritos_clase on public.favoritos_clase
  for all to authenticated
  using (studio_id = public.current_studio_id())
  with check (studio_id = public.current_studio_id());
