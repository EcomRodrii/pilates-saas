-- ═══════════════════════════════════════════════════════════════════════════
-- 0024 · Estado de pago en Citas (columna `pagada`)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️  Cambia el ESQUEMA de producción (añade una columna). Señalado antes de aplicar.
--
-- CONTEXTO
-- Las citas tenían `precio` pero NO un estado de pago. El brief pide un indicador
-- de pago junto al precio (pagado vs pendiente de cobro). Se añade una columna
-- booleana; por defecto false (pendiente), así que no cambia el comportamiento
-- existente ni requiere backfill.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.citas
  add column if not exists pagada boolean not null default false;
