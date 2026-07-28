-- ═══════════════════════════════════════════════════════════════════════════
-- 0075 · TENTARE — Migración Mágica: lotes reversibles
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Cada ejecución de migración registra los IDs que creó, por entidad, para
-- poder DESHACERLA con un clic (la garantía de "riesgo cero" que exige la
-- objeción real de las propietarias: "migrar es horrible y si sale mal, peor").
-- Los importadores existentes no devolvían los ids creados; ahora aceptan un
-- batchId opcional y los registran aquí.
--
-- Server-only (mismo patrón que avisos_hueco/rate_limits/webhook_events):
-- RLS activo SIN policies — solo el service role de las rutas la toca.
-- ═══════════════════════════════════════════════════════════════════════════

create table public.migracion_batches (
  id text primary key,
  studio_id text not null references public.studios(id) on delete cascade,
  creado_en timestamptz not null default now(),
  -- {socios: [...], suscripciones: [...], tipos_clase: [...], sesiones: [...], reservas: [...], citas: [...]}
  ids_creados jsonb not null default '{}'::jsonb,
  deshecho_en timestamptz,
  resumen jsonb
);

alter table public.migracion_batches enable row level security;

create index idx_migracion_batches_studio on public.migracion_batches (studio_id, creado_en desc);
