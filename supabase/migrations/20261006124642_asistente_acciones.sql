-- ─────────────────────────────────────────────────────────────────────────────
-- «Pregúntale a Tentare», Fase 2: el asistente PROPONE y la persona CONFIRMA.
--
-- `asistente_acciones` guarda cada propuesta en el servidor: el modelo la deja
-- aquí (nunca ejecuta) y solo el endpoint de confirmar, con la sesión de quien la
-- recibió, la ejecuta leyendo ESTE payload y no lo que mande el navegador.
--
--   PROPUESTA → EJECUTANDO → EJECUTADA        (confirmar; un solo ganador)
--   PROPUESTA → CANCELADA                     (cancelar / «cambiar algo»)
--   PROPUESTA → CADUCADA                      (a los 15 min)
--
-- Por qué una tabla y no una firma HMAC: el uso único y la idempotencia necesitan
-- estado de todos modos (una firma sola se puede confirmar dos veces), y con la
-- fila el payload que se ejecuta NO viaja nunca por el navegador.
--
-- Sin funciones nuevas: el compare-and-set es un UPDATE condicional desde la
-- ruta (service-role), así que no hay firma que endurecer. RLS: la persona lee
-- las suyas; nadie escribe desde el navegador.
-- ─────────────────────────────────────────────────────────────────────────────

create table public.asistente_acciones (
  id uuid primary key default gen_random_uuid(),
  studio_id text not null references public.studios(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  conversacion_id uuid references public.asistente_conversaciones(id) on delete set null,
  tipo text not null check (tipo in ('CREAR_CLASE', 'CREAR_SALA', 'CREAR_EVENTO', 'CREAR_CITA')),
  estado text not null default 'PROPUESTA'
    check (estado in ('PROPUESTA', 'EJECUTANDO', 'EJECUTADA', 'CANCELADA', 'CADUCADA')),
  -- Lo ya validado y resuelto a ids (la persona de una cita es un id, nunca un nombre).
  payload jsonb not null,
  -- Qué se creó (ids y enlace), una vez ejecutada.
  resultado jsonb,
  creada_en timestamptz not null default now(),
  caduca_en timestamptz not null,
  -- Cuándo la tomó el que la ejecuta: una toma muerta (>2 min) se puede volver a tomar.
  reclamada_en timestamptz,
  resuelta_en timestamptz,
  check (caduca_en > creada_en)
);
create index asistente_acciones_persona on public.asistente_acciones (studio_id, auth_user_id, creada_en desc);
create index asistente_acciones_conversacion on public.asistente_acciones (conversacion_id) where conversacion_id is not null;
comment on table public.asistente_acciones is
  'Propuestas del asistente (crear clase, sala, evento o cita) a la espera de que la persona confirme. Solo escribe el servidor.';

alter table public.asistente_acciones enable row level security;
revoke all on table public.asistente_acciones from anon, authenticated;
grant select on table public.asistente_acciones to authenticated;

-- Una propuesta es de quien la recibió: ni la gerente lee las de la propietaria ni al revés.
create policy asistente_acciones_propias on public.asistente_acciones for select to authenticated
  using (
    studio_id = (select public.current_studio_id())
    and auth_user_id = (select auth.uid())
    and (select public.current_rol()) in ('PROPIETARIO', 'MANAGER')
  );
