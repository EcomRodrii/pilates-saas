-- Solicitudes de llamada de puesta en marcha.
--
-- Quien crea su estudio puede elegir «Prefiero que me llamen» y dejar un
-- teléfono. Antes la petición era una frase en `studios.onb_ayuda_alta` y un
-- correo a soporte; ahora el teléfono vive aquí, con su consentimiento, para que
-- el fundador pueda verlas en /interno y marcar la llamada como hecha.
--
-- PRIVACIDAD
--   · El teléfono solo existe si la persona lo da Y marca la casilla
--     (`consentimiento_en` NOT NULL: sin consentimiento no hay fila).
--   · Al marcar la llamada como hecha el teléfono se borra (lo hace la ruta de
--     /interno): una vez atendida no hay motivo para conservarlo.
--   · Una sola solicitud PENDIENTE por estudio: pedirla otra vez actualiza la
--     misma, no acumula números.
--
-- ACCESO
--   · INSERT / UPDATE / DELETE: nadie desde el cliente. Escribe el servidor
--     (service_role) tras validar el número y el consentimiento.
--   · SELECT: solo la PROPIETARIA de ese estudio (ve lo que pidió). El
--     backoffice lee con service_role.
--   · exige_doble_factor restrictiva, como toda tabla con RLS
--     (supabase/tests/rls-doble-factor.test.ts).

create table if not exists public.solicitudes_llamada (
  id uuid primary key default gen_random_uuid(),
  studio_id text not null references public.studios(id) on delete cascade,
  -- E.164 (+34612345678). NULL cuando la llamada ya está hecha.
  telefono text check (telefono is null or telefono ~ '^\+[0-9]{8,15}$'),
  hora_preferida text check (hora_preferida is null or hora_preferida in ('manana', 'tarde')),
  consentimiento_en timestamptz not null default now(),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'hecha')),
  creada_en timestamptz not null default now(),
  atendida_en timestamptz,
  -- Una pendiente SIEMPRE tiene teléfono; una hecha ya no.
  constraint solicitudes_llamada_telefono_segun_estado check (
    (estado = 'pendiente' and telefono is not null) or (estado = 'hecha' and telefono is null)
  )
);

create unique index if not exists solicitudes_llamada_una_pendiente_por_estudio
  on public.solicitudes_llamada (studio_id) where estado = 'pendiente';
create index if not exists solicitudes_llamada_estado_creada
  on public.solicitudes_llamada (estado, creada_en desc);

alter table public.solicitudes_llamada enable row level security;

drop policy if exists solicitudes_llamada_leer_propietaria on public.solicitudes_llamada;
create policy solicitudes_llamada_leer_propietaria on public.solicitudes_llamada
  for select to authenticated
  using (studio_id = (select public.current_studio_id()) and (select public.current_rol()) = 'PROPIETARIO');

drop policy if exists exige_doble_factor on public.solicitudes_llamada;
create policy exige_doble_factor on public.solicitudes_llamada as restrictive for all to authenticated
  using ((select public.nivel_acceso_suficiente())) with check ((select public.nivel_acceso_suficiente()));

revoke all on table public.solicitudes_llamada from anon;
revoke all on table public.solicitudes_llamada from authenticated;
grant select on table public.solicitudes_llamada to authenticated;
grant all on table public.solicitudes_llamada to service_role;
