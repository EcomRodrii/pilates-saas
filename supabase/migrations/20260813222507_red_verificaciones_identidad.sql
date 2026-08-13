-- Tentare Network, Fase 2 — verificación de identidad por documento
-- (DNI/pasaporte). Mismo patrón de auditoría que red_verificaciones_experiencia
-- (20260813111206): estado + motivo_rechazo + resuelto_en/resuelto_por.
create table public.red_verificaciones_identidad (
  id text primary key,
  perfil_id text not null references public.red_perfiles(id) on delete cascade,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'en_revision', 'verificado', 'rechazado')),
  motivo_rechazo text,
  documento_path text not null,
  creado_en timestamptz not null default now(),
  resuelto_en timestamptz,
  resuelto_por uuid references auth.users(id) on delete set null,
  constraint red_verificaciones_identidad_motivo_si_rechazado
    check (estado <> 'rechazado' or motivo_rechazo is not null)
);

-- Una sola verificación VIVA (pendiente/en_revision) por perfil a la vez —
-- mismo criterio que idx_red_verificaciones_pendiente (20260813115118):
-- tras un rechazo la profesional puede reintentar con un documento nuevo
-- (fila nueva); el intento rechazado se queda como historial, nunca se
-- sobrescribe ni se reabre.
create unique index idx_red_verificaciones_identidad_viva
  on public.red_verificaciones_identidad (perfil_id)
  where estado in ('pendiente', 'en_revision');

create index idx_red_verificaciones_identidad_perfil on public.red_verificaciones_identidad (perfil_id);
create index idx_red_verificaciones_identidad_estado on public.red_verificaciones_identidad (estado);

alter table public.red_verificaciones_identidad enable row level security;

create policy red_verificaciones_identidad_select_propio on public.red_verificaciones_identidad
  for select to authenticated
  using (exists (
    select 1 from public.red_perfiles rp
    where rp.id = red_verificaciones_identidad.perfil_id and rp.auth_user_id = auth.uid()
  ));

-- INSERT: el dueño abre una solicitud nueva, siempre en 'pendiente' y sin
-- resolver — resuelto_por/resuelto_en/motivo_rechazo o un estado distinto
-- de 'pendiente' solo los toca el endpoint de admin de Fase 3
-- (getSupabaseAdmin(), service_role — mismo patrón que
-- app/api/interno/network/verificaciones con red_verificaciones_experiencia).
create policy red_verificaciones_identidad_insert_propio on public.red_verificaciones_identidad
  for insert to authenticated
  with check (
    exists (
      select 1 from public.red_perfiles rp
      where rp.id = red_verificaciones_identidad.perfil_id and rp.auth_user_id = auth.uid()
    )
    and estado = 'pendiente'
    and resuelto_en is null
    and resuelto_por is null
    and motivo_rechazo is null
  );

-- Deliberadamente SIN policy de UPDATE ni DELETE para authenticated: nadie
-- del cliente puede mover `estado` — ni el dueño ni nadie más. Solo el
-- endpoint de admin de Tentare Interno con service_role (bypasea RLS,
-- mismo patrón ya usado en el resto de moderación de Network).
