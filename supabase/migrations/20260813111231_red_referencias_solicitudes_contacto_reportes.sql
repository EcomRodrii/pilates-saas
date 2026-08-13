-- Tentare Network, Fase 1 (arquitectura y BD) — docs/NETWORK-IMPLEMENTATION-PLAN.md
-- secciones 5, 6, 7, 9.

-- Referencias profesionales. El confirmador no es un estudio Tentare, es
-- cualquier persona con email — se resuelve por token firmado en una fase
-- posterior (endpoint dedicado con service-role, mismo patrón que
-- sustitucion_contactos). Aquí SOLO tablas + RLS del dueño: nada de función
-- de resolución por token todavía (pedido explícito, no implementar).

create table public.red_referencias (
  id text primary key,
  perfil_id text not null references public.red_perfiles(id) on delete cascade,
  nombre_referente text not null,
  email_referente text not null,
  relacion text,
  token text not null unique,
  token_expira_en timestamptz not null,
  solicitado_en timestamptz not null default now(),
  resuelto_en timestamptz,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'confirmada', 'rechazada', 'expirada'))
);

create index idx_red_referencias_perfil on public.red_referencias (perfil_id);

alter table public.red_referencias enable row level security;

-- SELECT: solo el dueño del perfil (el referente resuelve por token firmado
-- vía función SECURITY DEFINER de una fase posterior, no por RLS de usuario).
create policy red_referencias_select_propio on public.red_referencias
  for select to authenticated
  using (
    exists (
      select 1 from public.red_perfiles rp
      where rp.id = red_referencias.perfil_id and rp.auth_user_id = auth.uid()
    )
  );

create policy red_referencias_insert_propio on public.red_referencias
  for insert to authenticated
  with check (
    exists (
      select 1 from public.red_perfiles rp
      where rp.id = red_referencias.perfil_id and rp.auth_user_id = auth.uid()
    )
  );

-- UPDATE: en esta fase, solo el dueño del perfil puede tocar su propia
-- solicitud (p.ej. marcarla 'expirada' para invalidarla). La resolución por
-- token del referente NO se implementa aquí — fase posterior con endpoint
-- dedicado vía service-role, que bypasa RLS.
create policy red_referencias_update_propio on public.red_referencias
  for update to authenticated
  using (
    exists (
      select 1 from public.red_perfiles rp
      where rp.id = red_referencias.perfil_id and rp.auth_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.red_perfiles rp
      where rp.id = red_referencias.perfil_id and rp.auth_user_id = auth.uid()
    )
  );

comment on table public.red_referencias is
  'Tentare Network Fase 1. Resolución por token del referente pendiente de fase posterior (endpoint service-role) — sin política de UPDATE para el referente todavía.';

-- ---------------------------------------------------------------------------

-- Un estudio contacta a una profesional.

create table public.red_solicitudes_contacto (
  id text primary key,
  perfil_id text not null references public.red_perfiles(id) on delete cascade,
  studio_id text not null references public.studios(id) on delete cascade,
  solicitado_por uuid not null references auth.users(id),
  mensaje text,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'aceptada', 'rechazada')),
  creado_en timestamptz not null default now(),
  resuelto_en timestamptz
);

create unique index idx_red_solicitudes_contacto_pendiente
  on public.red_solicitudes_contacto (perfil_id, studio_id) where estado = 'pendiente';
create index idx_red_solicitudes_contacto_studio on public.red_solicitudes_contacto (studio_id);

alter table public.red_solicitudes_contacto enable row level security;

-- SELECT: el dueño del perfil, o staff del estudio solicitante.
create policy red_solicitudes_contacto_select on public.red_solicitudes_contacto
  for select to authenticated
  using (
    studio_id = public.current_studio_id()
    or exists (
      select 1 from public.red_perfiles rp
      where rp.id = red_solicitudes_contacto.perfil_id and rp.auth_user_id = auth.uid()
    )
  );

-- INSERT: solo staff con sesión activa de ESE studio_id.
create policy red_solicitudes_contacto_insert_staff on public.red_solicitudes_contacto
  for insert to authenticated
  with check (studio_id = public.current_studio_id() and solicitado_por = auth.uid());

-- UPDATE (aceptar/rechazar): solo el dueño del perfil.
create policy red_solicitudes_contacto_update_propio on public.red_solicitudes_contacto
  for update to authenticated
  using (
    exists (
      select 1 from public.red_perfiles rp
      where rp.id = red_solicitudes_contacto.perfil_id and rp.auth_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.red_perfiles rp
      where rp.id = red_solicitudes_contacto.perfil_id and rp.auth_user_id = auth.uid()
    )
  );

comment on table public.red_solicitudes_contacto is
  'Tentare Network Fase 1. email_contacto/telefono_contacto del perfil solo se revelan en el envío de notificación al aceptar (fase posterior), nunca por API a listados (§6 del plan).';

-- ---------------------------------------------------------------------------

-- Moderación. SELECT solo desde app/interno vía service-role (bypasa RLS) —
-- deliberadamente sin política de SELECT para authenticated.

create table public.red_reportes (
  id text primary key,
  perfil_id text not null references public.red_perfiles(id) on delete cascade,
  reportado_por uuid references auth.users(id),
  motivo text not null
    check (motivo in ('informacion_falsa', 'suplantacion', 'spam', 'comportamiento', 'fraude', 'otro')),
  detalle text,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'revisado', 'resuelto')),
  creado_en timestamptz not null default now(),
  revisado_en timestamptz,
  revisado_por uuid references auth.users(id)
);

create index idx_red_reportes_perfil on public.red_reportes (perfil_id);
create index idx_red_reportes_estado on public.red_reportes (estado);

alter table public.red_reportes enable row level security;

-- INSERT: cualquier authenticated (staff logueado), nunca anon. Se fuerza
-- reportado_por = auth.uid() para que nadie pueda suplantar a otro usuario
-- como autor del reporte.
create policy red_reportes_insert_authenticated on public.red_reportes
  for insert to authenticated
  with check (reportado_por = auth.uid());

comment on table public.red_reportes is
  'Tentare Network Fase 1. Sin política de SELECT para authenticated a propósito — solo legible desde app/interno vía service-role (§7 del plan).';
