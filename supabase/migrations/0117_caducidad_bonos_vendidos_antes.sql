-- Bonos vendidos antes de que asignar un plan calculara la caducidad.
--
-- Contexto: hasta 195d004, asignar un plan desde la ficha de la clienta creaba
-- la suscripción con `fecha_fin` NULL aunque la tarifa tuviera `validez_dias`.
-- Resultado: bonos eternos. La gente reaparece a los dos años con seis clases
-- pendientes y no puedes negarte.
--
-- El código ya lo calcula al vender. Esto es solo para lo vendido ANTES, y para
-- que una restauración o un entorno nuevo no arrastre el hueco.
--
-- Alcance deliberadamente estrecho:
--   · SOLO tipo BONO. Las MENSUAL/TRIMESTRAL con `fecha_fin` NULL son correctas:
--     no caducan por días, se renuevan (o se cancelan) — tocarlas cortaría
--     suscripciones vivas.
--   · SOLO si la tarifa declara `validez_dias`. Un bono sin caducidad definida
--     es una decisión del estudio, no un dato que falte: no se inventa.
--
-- Idempotente: el `fecha_fin is null` hace que una segunda pasada no toque nada.
update suscripciones s
set    fecha_fin = (s.fecha_inicio + (p.validez_dias || ' days')::interval)::date
from   planes_tarifa p
where  p.id = s.plan_id
  and  s.fecha_fin is null
  and  p.tipo = 'BONO'
  and  p.validez_dias is not null;
