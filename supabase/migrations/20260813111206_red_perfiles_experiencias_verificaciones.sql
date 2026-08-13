-- Tentare Network, Fase 1 (arquitectura y BD) — docs/NETWORK-IMPLEMENTATION-PLAN.md
-- secciones 1, 3, 4, 9. Identidad profesional independiente de studio_id:
-- una persona puede no pertenecer a ningún estudio Tentare, y una persona
-- con varias filas en `instructores` (multi-sede, P2-14) tiene aquí UNA
-- sola verdad, no N. auth_user_id UNIQUE por diseño (riesgo §16 del plan,
-- aceptado).
--
-- RLS: nunca current_studio_id() como ámbito del perfil (auditoría riesgo
-- #1) — se introduce auth_user_id = auth.uid() explícito en cada policy.
-- published visible a authenticated, nunca a anon (riesgo #4, evita
-- indexación en buscadores).

create table public.red_perfiles (
  id text primary key,
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  nombre text not null,
  foto_url text,
  ciudad text,
  zona text,
  radio_km integer,
  descripcion text,
  especialidades text[] not null default '{}',
  anios_experiencia integer,
  tarifa_rango text,
  disponibilidad_estado text not null default 'no_disponible'
    check (disponibilidad_estado in ('disponible', 'disponible_sustituciones', 'buscando_trabajo', 'no_disponible')),
  disponibilidad_horarios text[] not null default '{}',
  tipo_trabajo text[] not null default '{}',
  email_contacto text,
  telefono_contacto text,
  estado text not null default 'draft'
    check (estado in ('draft', 'published', 'hidden', 'suspended')),
  identidad_verificada_en timestamptz,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  ultimo_acceso_en timestamptz
);

create index idx_red_perfiles_ciudad_published on public.red_perfiles (ciudad) where estado = 'published';
create index idx_red_perfiles_disponibilidad_published on public.red_perfiles (disponibilidad_estado) where estado = 'published';

alter table public.red_perfiles enable row level security;

-- SELECT: el dueño ve siempre su propio perfil (incluido draft/hidden/suspended).
create policy red_perfiles_select_propio on public.red_perfiles
  for select to authenticated
  using (auth_user_id = auth.uid());

-- SELECT: cualquier staff logueado ve perfiles publicados de otras personas.
-- Nunca a anon (decisión de producto: no indexar en Google).
create policy red_perfiles_select_publicado on public.red_perfiles
  for select to authenticated
  using (estado = 'published');

create policy red_perfiles_insert_propio on public.red_perfiles
  for insert to authenticated
  with check (auth_user_id = auth.uid());

create policy red_perfiles_update_propio on public.red_perfiles
  for update to authenticated
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());

create policy red_perfiles_delete_propio on public.red_perfiles
  for delete to authenticated
  using (auth_user_id = auth.uid());

comment on table public.red_perfiles is
  'Tentare Network Fase 1. Identidad profesional 1:1 con auth_user_id (NO con studio_id) — ver docs/NETWORK-IMPLEMENTATION-PLAN.md §1.';

-- ---------------------------------------------------------------------------

-- Historial laboral. studio_id nullable a propósito: un estudio fuera de
-- Tentare debe poder registrarse igual, solo que no será verificable en V1
-- (§3 del plan, límite conocido documentado, no un bug).

create table public.red_experiencias (
  id text primary key,
  perfil_id text not null references public.red_perfiles(id) on delete cascade,
  studio_id text references public.studios(id) on delete set null,
  nombre_estudio text not null,
  fecha_inicio date not null,
  fecha_fin date,
  especialidades text[] not null default '{}',
  descripcion text,
  estado_verificacion text not null default 'sin_solicitar'
    check (estado_verificacion in ('sin_solicitar', 'pendiente', 'confirmada', 'rechazada')),
  creado_en timestamptz not null default now()
);

create index idx_red_experiencias_perfil on public.red_experiencias (perfil_id);
create index idx_red_experiencias_studio on public.red_experiencias (studio_id);

alter table public.red_experiencias enable row level security;

-- SELECT: igual que el perfil padre — el dueño ve todo lo suyo, y
-- cualquier staff logueado ve el historial si el perfil padre está publicado.
create policy red_experiencias_select on public.red_experiencias
  for select to authenticated
  using (
    exists (
      select 1 from public.red_perfiles rp
      where rp.id = red_experiencias.perfil_id
        and (rp.auth_user_id = auth.uid() or rp.estado = 'published')
    )
  );

create policy red_experiencias_insert_propio on public.red_experiencias
  for insert to authenticated
  with check (
    exists (
      select 1 from public.red_perfiles rp
      where rp.id = red_experiencias.perfil_id and rp.auth_user_id = auth.uid()
    )
  );

create policy red_experiencias_update_propio on public.red_experiencias
  for update to authenticated
  using (
    exists (
      select 1 from public.red_perfiles rp
      where rp.id = red_experiencias.perfil_id and rp.auth_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.red_perfiles rp
      where rp.id = red_experiencias.perfil_id and rp.auth_user_id = auth.uid()
    )
  );

create policy red_experiencias_delete_propio on public.red_experiencias
  for delete to authenticated
  using (
    exists (
      select 1 from public.red_perfiles rp
      where rp.id = red_experiencias.perfil_id and rp.auth_user_id = auth.uid()
    )
  );

comment on table public.red_experiencias is
  'Tentare Network Fase 1. studio_id nullable: estudio fuera de Tentare, no verificable en V1 (§3 del plan).';

-- ---------------------------------------------------------------------------

-- Solicitud/confirmación de una experiencia por un estudio Tentare real.
-- puede_gestionar_equipo() ya existe (20260731110000_instructor_tarifas.sql),
-- se reutiliza tal cual — no reimplementar.

create table public.red_verificaciones_experiencia (
  id text primary key,
  experiencia_id text not null references public.red_experiencias(id) on delete cascade,
  studio_id text not null references public.studios(id) on delete cascade,
  solicitado_por uuid not null references auth.users(id),
  solicitado_en timestamptz not null default now(),
  resuelto_en timestamptz,
  resuelto_por uuid references auth.users(id),
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'confirmada', 'rechazada', 'cancelada')),
  unique (experiencia_id)
);

create index idx_red_verificaciones_studio on public.red_verificaciones_experiencia (studio_id);

alter table public.red_verificaciones_experiencia enable row level security;

-- SELECT: el dueño del perfil, o staff del estudio con puede_gestionar_equipo().
create policy red_verificaciones_select on public.red_verificaciones_experiencia
  for select to authenticated
  using (
    solicitado_por = auth.uid()
    or (studio_id = public.current_studio_id() and public.puede_gestionar_equipo())
  );

-- INSERT: solo el dueño del perfil de la experiencia referenciada.
create policy red_verificaciones_insert_propio on public.red_verificaciones_experiencia
  for insert to authenticated
  with check (
    solicitado_por = auth.uid()
    and exists (
      select 1 from public.red_experiencias re
      join public.red_perfiles rp on rp.id = re.perfil_id
      where re.id = red_verificaciones_experiencia.experiencia_id
        and rp.auth_user_id = auth.uid()
    )
  );

-- UPDATE (resolver): solo staff del estudio con puede_gestionar_equipo().
create policy red_verificaciones_update_staff on public.red_verificaciones_experiencia
  for update to authenticated
  using (studio_id = public.current_studio_id() and public.puede_gestionar_equipo())
  with check (studio_id = public.current_studio_id() and public.puede_gestionar_equipo());

comment on table public.red_verificaciones_experiencia is
  'Tentare Network Fase 1. Auditable por diseño: solicitado_en/resuelto_en/resuelto_por, sin tabla de eventos aparte (§4 del plan).';
