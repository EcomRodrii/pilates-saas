-- OAuth Fase 5 (scopes de escritura) — "Crear tarea" es la única acción sin
-- concepto de negocio previo en el repo (crear/cancelar reserva y crear
-- cliente reutilizan funciones ya existentes; "crear nota" reutiliza
-- notas_internas). Tabla nueva, mínima: un pendiente operativo de estudio,
-- opcionalmente ligado a una socia. Sin estado de "asignado a" — eso es
-- trabajo de equipo (`mensajes_equipo`/`equipo_asistencia`), no de esta tabla.

create table public.tareas (
  id            text primary key,
  studio_id     text not null references public.studios(id) on delete cascade,
  socio_id      text references public.socios(id) on delete set null,
  titulo        text not null,
  descripcion   text,
  estado        text not null default 'PENDIENTE' check (estado in ('PENDIENTE', 'HECHA')),
  origen        text not null default 'PANEL' check (origen in ('PANEL', 'API')),
  creado_en     timestamptz not null default now(),
  completado_en timestamptz
);

create index idx_tareas_studio on public.tareas(studio_id, estado);

alter table public.tareas enable row level security;

-- Mismo criterio que puedeGestionarClientas: trabajo operativo de mostrador,
-- PROPIETARIO/MANAGER/RECEPCION (no INSTRUCTOR, que no gestiona tareas de
-- negocio). Escritura vía servidor (panel) usa sesión authenticated normal;
-- la API OAuth escribe con service-role y filtra manualmente por studio_id,
-- igual que el resto de app/api/oauth/v1/*.
create policy tareas_staff_gestion on public.tareas
  for all to authenticated
  using (
    studio_id = public.current_studio_id()
    and public.current_rol() in ('PROPIETARIO', 'MANAGER', 'RECEPCION')
  )
  with check (
    studio_id = public.current_studio_id()
    and public.current_rol() in ('PROPIETARIO', 'MANAGER', 'RECEPCION')
  );

revoke all on public.tareas from anon;
grant select, insert, update, delete on public.tareas to authenticated;
grant all on public.tareas to service_role;
