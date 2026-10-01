-- Publicar el horario en Urban Sports Club (cron app/api/cron/usc-horario).
--
-- 1) `plataforma_eventos` recuerda LO QUE SE ENVIÓ, para no reenviar nada que
--    no haya cambiado y para saber cuándo hay que cancelar y volver a crear:
--    · `huella_fija`: fecha+hora de inicio, ubicación y plazo de cancelación
--      tardía. USC no deja cambiarlos en un evento ya creado; si cambian en
--      Tentare, el evento se cancela allí y se crea otro.
--    · `huella`: lo que sí se edita (nombre, instructora, plazas, descripción,
--      duración). Si cambia, PATCH.
--    · `ocupadas_enviadas`: el último «bookingCount» (plazas que ocupa gente
--      que NO viene de USC), para no repetir la llamada si no ha cambiado.
--
-- 2) `plataforma_instructoras`: el id de «trainer» de la plataforma de cada
--    instructora. En USC los trainers son por proveedor (= por estudio), así
--    que la clave es estudio + plataforma + instructora.
--    Solo lo toca el servidor: RLS activa y sin políticas, como
--    `plataforma_eventos`.
--
-- 3) Borrar una sesión ya NO borra su evento: se queda con `sesion_id` a NULL
--    para que el cron lo cancele en USC. Con el `on delete cascade` de antes
--    el evento seguía vivo en su app, sin forma de saber cuál era.

alter table public.plataforma_eventos
  add column if not exists huella_fija text,
  add column if not exists huella text,
  add column if not exists ocupadas_enviadas integer;

alter table public.plataforma_eventos
  alter column sesion_id drop not null,
  drop constraint if exists plataforma_eventos_sesion_id_fkey,
  add constraint plataforma_eventos_sesion_id_fkey
    foreign key (sesion_id) references public.sesiones(id) on delete set null;

create table if not exists public.plataforma_instructoras (
  id text primary key default ('pin-' || gen_random_uuid()::text),
  studio_id text not null references public.studios(id) on delete cascade,
  plataforma text not null check (plataforma in ('CLASSPASS', 'URBAN_SPORTS_CLUB', 'WELLHUB')),
  instructor_id text not null references public.instructores(id) on delete cascade,
  id_externo text not null,
  creado_en timestamptz not null default now()
);

create unique index if not exists plataforma_instructoras_unica
  on public.plataforma_instructoras (plataforma, studio_id, instructor_id);

alter table public.plataforma_instructoras enable row level security;
revoke all on public.plataforma_instructoras from anon, authenticated;
grant all on public.plataforma_instructoras to service_role;
