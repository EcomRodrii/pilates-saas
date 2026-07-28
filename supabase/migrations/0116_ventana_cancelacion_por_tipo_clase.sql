-- ─────────────────────────────────────────────────────────────────────────────
-- P2-8. La ventana de cancelación (horas de antelación para recuperar la
-- sesión) era una sola cifra para TODO el estudio. Un estudio con reformer lo
-- dijo claro: el reformer necesita más antelación que el mat para poder
-- recolocar la plaza — con una política única, o penaliza de más al mat o de
-- menos al reformer. No es un detalle de configuración: es la base de cómo
-- cobra.
--
-- Columna nullable en tipos_clase, no una tabla puente (a diferencia de
-- plan_tipos_clase en 0111): aquí la relación es 1:1 — cada tipo de clase
-- tiene COMO MUCHO un valor propio, no un conjunto de planes que cubre. NULL
-- = hereda la ventana del estudio (studios.cancelacion_ventana_horas), que es
-- el comportamiento de hoy. Ningún tipo de clase existente cambia de
-- comportamiento tras esta migración.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.tipos_clase
  add column if not exists ventana_cancelacion_horas integer;

comment on column public.tipos_clase.ventana_cancelacion_horas is
  'Horas de antelación para cancelar sin perder la sesión, específicas de este tipo de clase. NULL = hereda studios.cancelacion_ventana_horas.';
