-- Tentare Network — reseñas y mensajería interna (brief §9/§25).
--
-- Reseñas: NUNCA "5 estrellas porque sí" — solo puede reseñar un estudio con
-- una solicitud de contacto ACEPTADA con ese perfil (la única "relación
-- profesional validada" que ya existe en el modelo de datos; no se inventa
-- un sistema de verificación nuevo). Una por relación (unique studio+perfil):
-- no una review por cada mensaje, una por vínculo real. Sin política RLS de
-- INSERT para `authenticated` a propósito — la comprobación de la relación
-- es más simple en la API (service-role) que en un `with check`, y el estado
-- de moderación (pendiente/publicada/oculta) solo lo mueve app/interno,
-- mismo criterio que red_reportes.
create table public.red_resenas (
  id text primary key,
  perfil_id text not null references public.red_perfiles(id) on delete cascade,
  studio_id text not null references public.studios(id) on delete cascade,
  solicitud_id text not null references public.red_solicitudes_contacto(id) on delete cascade,
  autor uuid not null references auth.users(id),
  puntuacion smallint not null check (puntuacion between 1 and 5),
  comentario text,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'publicada', 'oculta')),
  creado_en timestamptz not null default now(),
  moderado_en timestamptz,
  moderado_por uuid references auth.users(id),
  unique (studio_id, perfil_id)
);

create index idx_red_resenas_perfil on public.red_resenas (perfil_id);
create index idx_red_resenas_estado on public.red_resenas (estado);

alter table public.red_resenas enable row level security;

comment on table public.red_resenas is
  'Tentare Network. Sin política RLS para authenticated a propósito — solo vía API con service-role (POST valida solicitud aceptada; moderación solo desde app/interno). Mismo criterio que red_reportes.';

-- ---------------------------------------------------------------------------

-- Mensajería interna: brief §9, "no un chat gigante en V1" — anclada a una
-- solicitud de contacto ya ACEPTADA (estudio → instructora), reutiliza esa
-- relación en vez de inventar un concepto de "conversación" aparte.
create table public.red_mensajes (
  id text primary key,
  solicitud_id text not null references public.red_solicitudes_contacto(id) on delete cascade,
  remitente uuid not null references auth.users(id),
  cuerpo text not null,
  creado_en timestamptz not null default now(),
  leido_en timestamptz
);

create index idx_red_mensajes_solicitud on public.red_mensajes (solicitud_id, creado_en);

alter table public.red_mensajes enable row level security;

-- SELECT/INSERT: solo quien participa en la relación — staff del estudio de
-- la solicitud, o la dueña del perfil. La solicitud tiene que estar
-- ACEPTADA (antes de aceptar no hay con quién hablar, el contacto sigue sin
-- revelarse — docs §6).
create policy red_mensajes_select on public.red_mensajes
  for select to authenticated
  using (
    exists (
      select 1 from public.red_solicitudes_contacto sc
      where sc.id = red_mensajes.solicitud_id
        and sc.estado = 'aceptada'
        and (
          sc.studio_id = public.current_studio_id()
          or exists (select 1 from public.red_perfiles rp where rp.id = sc.perfil_id and rp.auth_user_id = auth.uid())
        )
    )
  );

create policy red_mensajes_insert on public.red_mensajes
  for insert to authenticated
  with check (
    remitente = auth.uid()
    and exists (
      select 1 from public.red_solicitudes_contacto sc
      where sc.id = red_mensajes.solicitud_id
        and sc.estado = 'aceptada'
        and (
          sc.studio_id = public.current_studio_id()
          or exists (select 1 from public.red_perfiles rp where rp.id = sc.perfil_id and rp.auth_user_id = auth.uid())
        )
    )
  );

comment on table public.red_mensajes is
  'Tentare Network. Hilo de mensajes por solicitud de contacto ACEPTADA — sin concepto de "conversación" aparte. RLS: solo staff del estudio o dueña del perfil implicados, y solo mientras la solicitud siga aceptada.';
