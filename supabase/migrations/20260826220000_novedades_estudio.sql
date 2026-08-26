-- ─────────────────────────────────────────────────────────────────────────────
-- "Tablón" del portal cliente: avisos de texto libre que PROPIETARIO/MANAGER
-- escriben para que las alumnas los vean en Inicio (rediseño Tentare Studio
-- App). Descartado a propósito reutilizar `contenido_portal.mensaje_destacado`
-- (un único mensaje, sin histórico) y `contenido_portal_banners` (exige
-- imagen + enlace — mala UX para "cerrado el lunes por festivo").
--
-- Mismo patrón que contenido_portal/contenido_portal_banners
-- (20260731120100_contenido_portal.sql): SELECT público (anon using true) +
-- escritura solo PROPIETARIO/MANAGER, igual que el resto del contenido del
-- portal (lib/permisos-reglas.ts, puedeGestionarPortalHome) — RECEPCION
-- queda fuera a propósito, decisión confirmada, no una ampliación.
--
-- Sin GRANT manual de TRUNCATE/TRIGGER/REFERENCES a anon/authenticated: la
-- migración 20260823124234 (revoke_truncate_trigger_global) ya se los quita
-- por defecto a cualquier tabla nueva.
--
-- Nota de tipos: created_by es `text` (no uuid) porque instructores.id es
-- `text` en este esquema — mismo criterio que contenido_portal_banners.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.novedades_estudio (
  id uuid primary key default gen_random_uuid(),
  studio_id text not null references public.studios(id) on delete cascade,
  titulo text not null,
  texto text,
  emoji text,
  activo boolean not null default true,
  -- null = visible desde ya / sin fecha de expiración, mismo criterio que
  -- contenido_portal_banners.fecha_inicio/fecha_fin.
  fecha_inicio date,
  fecha_fin date,
  created_by text references public.instructores(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.novedades_estudio enable row level security;

create index idx_novedades_estudio_studio_id on public.novedades_estudio(studio_id);
create index idx_novedades_estudio_studio_activo on public.novedades_estudio(studio_id, activo);

create policy admin_novedades_estudio on public.novedades_estudio
  for all to authenticated
  using (studio_id = public.current_studio_id()
         and public.current_rol() in ('PROPIETARIO','MANAGER'))
  with check (studio_id = public.current_studio_id()
              and public.current_rol() in ('PROPIETARIO','MANAGER'));
create policy public_read_novedades_estudio on public.novedades_estudio
  for select to anon using (true);
