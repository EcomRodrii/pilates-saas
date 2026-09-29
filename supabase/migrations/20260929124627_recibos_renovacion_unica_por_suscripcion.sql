-- Auditoría de cobros recurrentes (2026-09-29), hallazgo 🟡: la deduplicación
-- de un recibo de renovación vivo por suscripción era solo de aplicación (id
-- determinista en el cron + un SELECT-then-INSERT en /api/public/renovar-plan),
-- sin ningún constraint real en la base. Vulnerable a TOCTOU si un recibo
-- manual desde /cobros (que no usa el id determinista) se crea en la ventana
-- entre el SELECT y el INSERT del cron. 0 duplicados reales hoy (verificado
-- antes de aplicar) — defensa en profundidad, no un incidente activo.
create unique index if not exists recibos_renovacion_viva_por_suscripcion
  on public.recibos (suscripcion_id)
  where estado in ('PENDIENTE', 'EN_CURSO') and es_renovacion and suscripcion_id is not null;
