-- Tentare Network — Fase 2, "vacantes + candidaturas" (marketplace
-- bidireccional de talento: estudio → busca instructora, instructora →
-- busca oportunidades). Diseñado con tentare-arquitecto tras la navegación
-- de los dos paneles (PR #1076).

-- Vacantes publicadas por un estudio. Sin ciudad/ubicación propia: se lee
-- de studios.ciudad vía join (mismo criterio que contacto/route.ts con
-- `studios ( nombre, ciudad )`) — evita duplicar un dato que ya vive ahí.
create table public.red_vacantes (
  id text primary key,
  studio_id text not null references public.studios(id) on delete cascade,
  publicado_por uuid not null references auth.users(id),
  titulo text not null,
  especialidades text[] not null default '{}',
  horarios text[] not null default '{}',
  tipo_trabajo text not null,
  tarifa_rango text not null default 'a_negociar',
  requisitos text,
  descripcion text not null,
  estado text not null default 'draft' check (estado in ('draft', 'published', 'closed')),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  cerrado_en timestamptz
);

create index idx_red_vacantes_studio on public.red_vacantes (studio_id);
create index idx_red_vacantes_publicadas on public.red_vacantes (estado) where estado = 'published';

alter table public.red_vacantes enable row level security;

-- SELECT: el estudio dueño ve TODAS las suyas (cualquier estado); cualquier
-- authenticated ve las publicadas (marketplace — sin `anon`, mismo criterio
-- ya cerrado para red_perfiles: sin indexar en Google en esta ronda).
create policy red_vacantes_select on public.red_vacantes
  for select to authenticated
  using (
    studio_id = public.current_studio_id()
    or estado = 'published'
  );

-- INSERT/UPDATE: gateado con puede_gestionar_equipo() — publicar una
-- vacante y decidir sobre candidatas es una decisión de equipo/contratación,
-- no un simple "contactar" (que sí está abierto a cualquier staff). Solo se
-- puede crear en 'draft'; la transición a 'published'/'closed' se valida en
-- servidor (mínimos: título+descripción+especialidad), no aquí.
create policy red_vacantes_insert on public.red_vacantes
  for insert to authenticated
  with check (
    studio_id = public.current_studio_id()
    and publicado_por = auth.uid()
    and public.puede_gestionar_equipo()
    and estado = 'draft'
  );

create policy red_vacantes_update on public.red_vacantes
  for update to authenticated
  using (studio_id = public.current_studio_id() and public.puede_gestionar_equipo())
  with check (studio_id = public.current_studio_id() and public.puede_gestionar_equipo());

comment on table public.red_vacantes is
  'Tentare Network Fase 2. Sin DELETE — se cierra (estado=closed), nunca se borra. Sin ciudad propia: se lee de studios.ciudad.';

-- ---------------------------------------------------------------------------

-- Candidatura de una instructora a una vacante. A diferencia de
-- red_solicitudes_contacto (el estudio inicia), aquí inicia la instructora
-- sobre algo que el estudio publicó — es una tabla nueva, no una reutilización.
--
-- Máquina de estados con transiciones legales (recibida→contactada→
-- entrevista→propuesta→aceptada, rechazar desde cualquier estado activo,
-- retirar solo la dueña) que RLS no puede validar por sí sola — mismo
-- criterio que red_formalizaciones: la escritura vive en app/api/... con
-- service-role. Sin política de INSERT/UPDATE para authenticated a
-- propósito.
create table public.red_candidaturas (
  id text primary key,
  vacante_id text not null references public.red_vacantes(id) on delete cascade,
  perfil_id text not null references public.red_perfiles(id) on delete cascade,
  studio_id text not null references public.studios(id) on delete cascade,
  mensaje text,
  notas_estudio text,
  estado text not null default 'recibida'
    check (estado in ('recibida', 'contactada', 'entrevista', 'propuesta', 'aceptada', 'rechazada', 'retirada')),
  solicitud_id text references public.red_solicitudes_contacto(id) on delete set null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  resuelto_en timestamptz,
  unique (vacante_id, perfil_id)
);

create index idx_red_candidaturas_vacante on public.red_candidaturas (vacante_id);
create index idx_red_candidaturas_perfil on public.red_candidaturas (perfil_id);
create index idx_red_candidaturas_studio on public.red_candidaturas (studio_id);

alter table public.red_candidaturas enable row level security;

-- SELECT: la dueña del perfil, o staff del estudio de la vacante — mismo
-- patrón que red_solicitudes_contacto_select.
create policy red_candidaturas_select on public.red_candidaturas
  for select to authenticated
  using (
    studio_id = public.current_studio_id()
    or exists (
      select 1 from public.red_perfiles rp
      where rp.id = red_candidaturas.perfil_id and rp.auth_user_id = auth.uid()
    )
  );

comment on table public.red_candidaturas is
  'Tentare Network Fase 2. Sin política INSERT/UPDATE para authenticated: la máquina de estados (recibida/contactada/entrevista/propuesta/aceptada/rechazada/retirada) se valida en app/api/network/candidaturas, con service-role. notas_estudio nunca se expone a la instructora.';
