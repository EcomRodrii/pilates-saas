-- ═══════════════════════════════════════════════════════════════════════════
-- 0026 · Canales/grupos en el chat de equipo
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️  Cambia el ESQUEMA de producción (tabla nueva + columna + backfill).
--
-- CONTEXTO
-- El chat era un canal único por estudio. El usuario pide poder crear grupos/
-- canales (estilo Teams/Slack). Se añade `canales_equipo` y `mensajes_equipo.
-- canal_id`. Los estudios existentes reciben un canal "General" y sus mensajes
-- se reasignan a él (backfill), así nada se pierde.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.canales_equipo (
  id         text primary key,
  studio_id  text not null references public.studios(id) on delete cascade,
  nombre     text not null,
  creado_en  timestamptz not null default now()
);
create index if not exists idx_canales_equipo_studio on public.canales_equipo(studio_id);

alter table public.canales_equipo enable row level security;
drop policy if exists admin_canales_equipo on public.canales_equipo;
create policy admin_canales_equipo on public.canales_equipo
  for all to authenticated
  using (studio_id = public.current_studio_id())
  with check (studio_id = public.current_studio_id());

-- Sin GRANT a anon (lección Fase 0). RLS aísla por estudio.
grant select, insert, update, delete on table public.canales_equipo to authenticated;
grant all on table public.canales_equipo to service_role;

-- Columna canal_id en mensajes (nullable de momento para poder backfillear).
alter table public.mensajes_equipo add column if not exists canal_id text;

-- Canal "General" por estudio existente + reasignar mensajes huérfanos.
insert into public.canales_equipo (id, studio_id, nombre, creado_en)
select 'canal-gen-' || s.id, s.id, 'General', now()
from public.studios s
on conflict (id) do nothing;

update public.mensajes_equipo m
  set canal_id = 'canal-gen-' || m.studio_id
  where m.canal_id is null;

-- FK tras el backfill.
alter table public.mensajes_equipo drop constraint if exists mensajes_equipo_canal_id_fkey;
alter table public.mensajes_equipo
  add constraint mensajes_equipo_canal_id_fkey
  foreign key (canal_id) references public.canales_equipo(id) on delete cascade;

create index if not exists idx_mensajes_equipo_canal on public.mensajes_equipo(canal_id);
