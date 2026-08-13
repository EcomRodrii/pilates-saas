-- Tentare Network, Fase 2 — certificaciones (N por perfil), verificadas por
-- documento. Mismo patrón estado/motivo_rechazo/auditoría que
-- red_verificaciones_identidad (misma migración hermana).
create table public.red_certificaciones (
  id text primary key,
  perfil_id text not null references public.red_perfiles(id) on delete cascade,
  nombre text not null,
  institucion text not null,
  anio integer,
  duracion text,
  documento_path text not null,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'en_revision', 'verificado', 'rechazado')),
  motivo_rechazo text,
  creado_en timestamptz not null default now(),
  resuelto_en timestamptz,
  resuelto_por uuid references auth.users(id) on delete set null,
  constraint red_certificaciones_motivo_si_rechazado
    check (estado <> 'rechazado' or motivo_rechazo is not null)
);

create index idx_red_certificaciones_perfil on public.red_certificaciones (perfil_id);
create index idx_red_certificaciones_estado on public.red_certificaciones (estado);

alter table public.red_certificaciones enable row level security;

create policy red_certificaciones_select_propio on public.red_certificaciones
  for select to authenticated
  using (exists (
    select 1 from public.red_perfiles rp
    where rp.id = red_certificaciones.perfil_id and rp.auth_user_id = auth.uid()
  ));

create policy red_certificaciones_insert_propio on public.red_certificaciones
  for insert to authenticated
  with check (
    exists (
      select 1 from public.red_perfiles rp
      where rp.id = red_certificaciones.perfil_id and rp.auth_user_id = auth.uid()
    )
    and estado = 'pendiente'
    and resuelto_en is null
    and resuelto_por is null
    and motivo_rechazo is null
  );

-- DELETE: el dueño puede retirar una certificación SOLO mientras siga
-- 'pendiente' (nadie la ha tocado todavía) — para corregir un error de
-- subida sin generar basura pendiente de revisar. Una vez que admin la
-- mueve a en_revision/verificado/rechazado deja de poder borrarse: pasa a
-- ser historial auditable.
create policy red_certificaciones_delete_propio_pendiente on public.red_certificaciones
  for delete to authenticated
  using (
    estado = 'pendiente'
    and exists (
      select 1 from public.red_perfiles rp
      where rp.id = red_certificaciones.perfil_id and rp.auth_user_id = auth.uid()
    )
  );

-- Deliberadamente SIN policy de UPDATE para authenticated: mismo criterio
-- que red_verificaciones_identidad — `estado`/`motivo_rechazo` solo los
-- mueve el endpoint de admin con service_role.
