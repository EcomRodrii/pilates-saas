-- Tentare Network — favoritos del estudio (brief §19: "Network → Buscar
-- instructoras / Mis favoritas / Solicitudes"). Mismo patrón exacto que
-- favoritos_clase (migr 20260731120000): toggle vía endpoint server-side con
-- service-role, la política RLS es solo para que el staff pueda
-- consultar/gestionar directamente si hace falta, no la única puerta.
create table public.red_favoritos (
  id uuid primary key default gen_random_uuid(),
  studio_id text not null references public.studios(id) on delete cascade,
  perfil_id text not null references public.red_perfiles(id) on delete cascade,
  creado_por uuid not null references auth.users(id),
  creado_en timestamptz not null default now(),
  unique (studio_id, perfil_id)
);

create index idx_red_favoritos_studio_id on public.red_favoritos(studio_id);
create index idx_red_favoritos_perfil_id on public.red_favoritos(perfil_id);

alter table public.red_favoritos enable row level security;

create policy staff_red_favoritos on public.red_favoritos
  for all to authenticated
  using (studio_id = public.current_studio_id())
  with check (studio_id = public.current_studio_id());
