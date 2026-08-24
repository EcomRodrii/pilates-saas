-- Tentare Network 2.0, Fase 0 (esquema). Identidad de RED para una alumna,
-- separada de `socios` (una alumna puede tener perfil de red sin ser socia
-- de ningún estudio Tentare, mismo criterio que ya usa red_perfiles para
-- instructoras — 20260813111206). auth_user_id 1:1 (UNIQUE), no studio_id:
-- es una identidad de persona, no una ficha por sede.
--
-- RLS: a diferencia de red_perfiles (instructora), un perfil 'published'
-- de alumna NO es legible por cualquier `authenticated` — solo por cuentas
-- de estudio (current_studio_id() is not null). Decisión explícita del
-- fundador: la base de alumnas de la red no debe ser navegable por otras
-- alumnas ni por instructoras sueltas.
--
-- Sin columnas de contacto directo (email/teléfono) a propósito: el vínculo
-- alumna↔estudio con intercambio de contacto es diseño de Fase 3 (mismo
-- patrón que red_solicitudes_contacto ya usa entre instructora↔estudio) —
-- no se anticipa aquí para no repetir el error que ya corrigió
-- 20260814080001_red_perfiles_revoke_columnas_contacto (exponer contacto
-- directo en una fila legible por terceros).

create table public.red_perfiles_alumna (
  id text primary key,
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  nombre text not null,
  foto_url text,
  ciudad text,
  zona text,
  lat double precision,
  lng double precision,
  intereses text[] not null default '{}',
  disponibilidad_horarios text[] not null default '{}',
  estado text not null default 'draft'
    check (estado in ('draft', 'published', 'hidden', 'suspended')),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

alter table public.red_perfiles_alumna enable row level security;

-- SELECT: la dueña ve siempre su propio perfil (incluido draft/hidden/suspended).
create policy red_perfiles_alumna_select_propio on public.red_perfiles_alumna
  for select to authenticated
  using (auth_user_id = auth.uid());

-- SELECT: solo cuentas de estudio (nunca cualquier authenticated) ven
-- perfiles publicados de otras alumnas — distinto a red_perfiles a propósito.
create policy red_perfiles_alumna_select_estudio on public.red_perfiles_alumna
  for select to authenticated
  using (estado = 'published' and public.current_studio_id() is not null);

create policy red_perfiles_alumna_insert_propio on public.red_perfiles_alumna
  for insert to authenticated
  with check (auth_user_id = auth.uid());

create policy red_perfiles_alumna_update_propio on public.red_perfiles_alumna
  for update to authenticated
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());

create policy red_perfiles_alumna_delete_propio on public.red_perfiles_alumna
  for delete to authenticated
  using (auth_user_id = auth.uid());

comment on table public.red_perfiles_alumna is
  'Tentare Network 2.0 Fase 0. Identidad de red de una alumna, 1:1 con auth_user_id. SELECT de perfiles published limitado a cuentas de estudio (current_studio_id() is not null), no abierto a todo authenticated como red_perfiles de instructora. Sin columnas de contacto directo — eso es Fase 3.';
