-- Bajas que pide la instructora: su motivo y la revisión del estudio.
--
-- Hasta ahora el motivo de «No puedo dar esta clase» se guardaba en
-- `sustituciones.motivo`, que lee todo el personal que gestiona el calendario
-- (recepción incluida, `sustituciones_lectura_gestion`). Ese texto lo escribe la
-- instructora y a veces habla de su salud: es el mismo caso que ya cerró
-- `ausencias_equipo_solo_gestion` (20260914000209) para las ausencias.
--
-- Esta tabla lo aparta y añade lo que decidió el fundador (14-sep-2026):
--   · `categoria`: tres opciones fijas y opcionales, para que nadie tenga que
--     escribir un diagnóstico.
--   · `revision`: solo las bajas con menos de 24 h de antelación esperan que el
--     estudio las revise ('PENDIENTE' → 'EN_ORDEN' | 'LO_HABLAMOS'). Con más
--     antelación es organización normal: NULL, nada que revisar.
--   · `nota_estudio`: la ve la instructora. Nunca es una sanción ni un descuento.
--
-- Solo SERVIDOR: la escribe `crearBaja` y la leen rutas que comprueban el rol
-- (quien gestiona el equipo, y la propia instructora lo suyo). RLS activa sin
-- políticas; anon y authenticated sin ningún privilegio.

create table if not exists public.bajas_instructora (
  id text primary key,
  studio_id text not null references public.studios(id) on delete cascade,
  instructor_id text not null references public.instructores(id) on delete cascade,
  sustitucion_id text not null unique references public.sustituciones(id) on delete cascade,
  sesion_id text not null references public.sesiones(id) on delete cascade,
  categoria text check (categoria in ('SALUD', 'PERSONAL', 'OTRO')),
  motivo text check (char_length(motivo) <= 500),
  antelacion_minutos integer not null check (antelacion_minutos >= 0),
  revision text check (revision in ('PENDIENTE', 'EN_ORDEN', 'LO_HABLAMOS')),
  nota_estudio text check (char_length(nota_estudio) <= 500),
  revisada_por uuid references auth.users(id) on delete set null,
  revisada_en timestamptz,
  creado_en timestamptz not null default now(),
  -- En una sola línea: scripts/gen-db-types.py lee cada línea como columna.
  constraint bajas_instructora_revision_coherente check ((revision is null and revisada_en is null and nota_estudio is null) or (revision = 'PENDIENTE' and revisada_en is null and nota_estudio is null) or (revision in ('EN_ORDEN', 'LO_HABLAMOS') and revisada_en is not null))
);

create index if not exists bajas_instructora_studio_creado
  on public.bajas_instructora (studio_id, creado_en desc);
create index if not exists bajas_instructora_instructora_creado
  on public.bajas_instructora (instructor_id, creado_en desc);
create index if not exists bajas_instructora_sesion
  on public.bajas_instructora (sesion_id);
create index if not exists bajas_instructora_revisada_por
  on public.bajas_instructora (revisada_por);

alter table public.bajas_instructora enable row level security;
revoke all on table public.bajas_instructora from anon;
revoke all on table public.bajas_instructora from authenticated;
grant all on table public.bajas_instructora to service_role;

-- Los motivos que ya pidieron instructoras se mudan aquí y salen de
-- `sustituciones`. Sin revisión: son anteriores a esta regla.
insert into public.bajas_instructora
  (id, studio_id, instructor_id, sustitucion_id, sesion_id, motivo, antelacion_minutos, creado_en)
select
  'bi-' || s.id, s.studio_id, s.instructor_original_id, s.id, s.sesion_id,
  left(s.motivo, 500),
  greatest(0, floor(extract(epoch from (se.inicio - s.creado_en)) / 60))::integer,
  s.creado_en
from public.sustituciones s
join public.sesiones se on se.id = s.sesion_id
where s.origen = 'instructora'
  and coalesce(s.motivo, '') <> ''
  and s.instructor_original_id is not null
on conflict (sustitucion_id) do nothing;

update public.sustituciones s
   set motivo = null
 where s.origen = 'instructora'
   and coalesce(s.motivo, '') <> ''
   and exists (select 1 from public.bajas_instructora b where b.sustitucion_id = s.id);
