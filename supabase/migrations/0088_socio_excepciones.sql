-- F2 · Paso 7 — Excepciones por socia (informe B2.9): el "porque lo digo yo".
--
-- La dueña marca a una socia como exenta de una automatización concreta ("a Carmen
-- jamás le mandes recordatorios"). Todas las automatizaciones consultan esta tabla
-- antes de actuar. Sin formulario: es un toggle en la ficha. Toggle off = borrar la
-- fila. La restricción única (studio, socio, tipo) hace el toggle idempotente.

create table if not exists public.socio_excepciones (
  id         text primary key,
  studio_id  text not null references public.studios(id),
  socio_id   text not null references public.socios(id),
  tipo       text not null,   -- SIN_AVISO_HUECO | SIN_RECORDATORIO | ...
  motivo     text,
  creada_en  timestamptz not null default now()
);

alter table public.socio_excepciones enable row level security;

create policy admin_socio_excepciones on public.socio_excepciones
  for all to authenticated
  using (studio_id = current_studio_id())
  with check (studio_id = current_studio_id());

-- Una excepción de cada tipo por socia (el toggle).
create unique index if not exists uq_socio_excepcion
  on public.socio_excepciones (studio_id, socio_id, tipo);
