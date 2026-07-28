-- ─────────────────────────────────────────────────────────────────────────────
-- Cambiar la dirección del portal sin matar los enlaces ya compartidos.
--
-- El slug se genera UNA vez, al crear el estudio, a partir del nombre. Después
-- `dbUpdateStudio` actualiza el nombre y nunca el slug: un estudio que se
-- rebautiza se queda con la dirección vieja para siempre, y no hay forma de
-- cambiarla — ni siquiera se ve escrita en ningún sitio, solo hay un enlace
-- para abrirla.
--
-- Lo tentador es regenerar el slug al renombrar. Sería MUCHO peor: esa
-- dirección está en la bio de Instagram, en el QR de la puerta, en los folletos
-- impresos y en cada WhatsApp que el estudio ha mandado. Cambiarla en silencio
-- rompe todo eso de golpe y el estudio se entera por las clientas.
--
-- Así que la dirección se cambia a mano, cuando la dueña quiere, y la vieja
-- SIGUE FUNCIONANDO: se guarda aquí y las rutas públicas redirigen a la nueva.
-- Renombrar deja de ser una decisión irreversible.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.studio_slugs_antiguos (
  slug       text primary key,
  studio_id  text not null references public.studios(id) on delete cascade,
  creado_en  timestamptz not null default now()
);

comment on table public.studio_slugs_antiguos is
  'Direcciones anteriores de un estudio. Las rutas públicas (/reservar, /portal) redirigen de aquí a la actual, para que un cambio de nombre no rompa los enlaces ya compartidos. Ver migración 0115.';

create index if not exists idx_studio_slugs_antiguos_studio
  on public.studio_slugs_antiguos(studio_id);

alter table public.studio_slugs_antiguos enable row level security;

-- Solo el propio estudio ve su histórico. El portal público resuelve con
-- service-role, que se salta la RLS, así que `anon` no necesita acceso: dejarlo
-- abierto permitiría enumerar los nombres antiguos de todos los estudios.
drop policy if exists studio_slugs_antiguos_propio on public.studio_slugs_antiguos;
create policy studio_slugs_antiguos_propio on public.studio_slugs_antiguos
  for select to authenticated
  using (studio_id = public.current_studio_id());

grant select on table public.studio_slugs_antiguos to authenticated;

-- ── Disponibilidad, teniendo en cuenta el histórico ──────────────────────────
-- `slug_estudio_disponible` solo miraba `studios`. Sin esto, un estudio podría
-- coger como dirección la ANTIGUA de otro y quedarse con su tráfico: quien
-- siguiera un enlace viejo acabaría en el estudio equivocado.
create or replace function public.slug_estudio_disponible(p_slug text)
  returns boolean
  language sql stable security definer
  set search_path = public
  as $$
    select not exists (select 1 from public.studios where slug = p_slug)
       and not exists (select 1 from public.studio_slugs_antiguos where slug = p_slug);
  $$;

grant execute on function public.slug_estudio_disponible(text) to anon, authenticated;
