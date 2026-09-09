-- ─────────────────────────────────────────────────────────────────────────────
-- Pasar lista, decidido POR TIPO DE CLASE.
--
-- `studios.requiere_checkin_qr` (migr 20260809020328) ya decide si hay que
-- probar la asistencia o si se da por buena al terminar la clase. El problema
-- es que era todo o nada para el estudio entero, y un estudio real mezcla las
-- dos cosas:
--
--   · Reformer de 6 plazas → se pasa lista. El aforo es caro, un hueco vacío
--     se nota, y la instructora sabe quién ha venido.
--   · Mat de 25 plazas o clase abierta → no se pasa. Escanear 25 pases en la
--     puerta cuesta más de lo que aporta.
--
-- Mismo patrón que las otras reglas por tipo de clase (Fase 1, migr
-- 20260730152516 y siguientes): columna nullable en `tipos_clase`, NULL =
-- hereda el default del estudio. La resolución vive en `heredaOverride()`
-- (lib/booking-logic.ts), no repetida en cada llamador.
--
-- ── Qué cambia de verdad al desactivarlo ─────────────────────────────────────
-- No es solo esconder un botón. Con `false` resuelto para esa sesión, el
-- barrido `marcar_asistidas_automaticamente` (pg_cron) marca ASISTIDA toda
-- reserva CONFIRMADA **al terminar la clase**: ni QR, ni código de 6
-- caracteres, ni marcar a mano en Asistentes. Y como ASISTIDA es lo que
-- dispara créditos, racha, logros y el premio de referido, esto no es
-- cosmético — decide si esa gente los recibe sola o no los recibe nunca.
--
-- Por eso el barrido pasa a resolver POR SESIÓN (su `tipo_clase_id`) en vez de
-- por estudio: si no, un estudio con el flag general activado nunca marcaría
-- las de un tipo que sí lo tiene desactivado, y esas reservas se quedarían
-- CONFIRMADA para siempre — que es exactamente el bug que este flag existe
-- para evitar.
--
-- ⚠️ Una sesión sin `tipo_clase_id` (se permite: la columna es nullable) no
-- tiene de dónde heredar más que del estudio. Ese es el comportamiento de
-- siempre y se mantiene.
--
-- Puramente aditiva: sin RPC, sin política RLS nueva, sin backfill. NULL en
-- todas las filas existentes = exactamente lo que hacían hasta ahora.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.tipos_clase
  add column if not exists requiere_checkin_qr boolean;

comment on column public.tipos_clase.requiere_checkin_qr is
  'NULL = hereda studios.requiere_checkin_qr. true = hay que pasar lista (QR, código o a mano). false = toda reserva confirmada se da por asistida al terminar la clase. Lo resuelve heredaOverride() en lib/booking-logic.ts.';
