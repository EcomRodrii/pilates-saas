-- Tentare Network, Fase 7 (verificación por estudios) —
-- docs/NETWORK-IMPLEMENTATION-PLAN.md §4.
--
-- La Fase 1 dejó `unique (experiencia_id)` a secas en
-- `red_verificaciones_experiencia`. Eso no es "una solicitud VIVA a la vez"
-- (que es lo que dice el propio comentario de esa migración) — es "como
-- mucho una solicitud en toda la vida de la fila": si un estudio la
-- rechaza, la profesional no podría volver a pedir verificación NUNCA,
-- porque la fila rechazada ya ocupa el único hueco que permite la
-- constraint. Se detecta ahora, al construir el flujo real que la usa
-- (antes solo existía la tabla, sin ningún caller).
--
-- Mismo patrón que `idx_red_solicitudes_contacto_pendiente`
-- (20260813111231) y `uq_sustitucion_activa_por_sesion` (0037): índice
-- único PARCIAL, solo mientras está `pendiente`. Una vez resuelta
-- (confirmada/rechazada/cancelada), el hueco se libera para una solicitud
-- nueva.

alter table public.red_verificaciones_experiencia drop constraint red_verificaciones_experiencia_experiencia_id_key;

create unique index idx_red_verificaciones_pendiente
  on public.red_verificaciones_experiencia (experiencia_id) where estado = 'pendiente';
