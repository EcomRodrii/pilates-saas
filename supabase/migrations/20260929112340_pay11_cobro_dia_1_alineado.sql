-- PAY-11: alinear el cobro mensual al día 1 (petición real de un estudio,
-- 2026-09-29): mueve plazas de plaza fija cada mes y quiere el cobro en una
-- fecha fija, no en el aniversario de cada socia.
--
-- Apagado de serie: el aniversario sigue siendo el comportamiento de siempre.
-- Con esto activo, cada renovación de una cuota MENSUAL se realinea al día 1
-- (ver `proximoFinAlineadoDia1`, lib/bono-logic.ts) — el alta no se toca, así
-- que no hace falta migrar ninguna suscripción existente: se realinean solas
-- en su próxima renovación.
alter table public.studios
  add column if not exists cobro_dia_1_activo boolean not null default false;

-- `authenticated` escribe `studios` por lista blanca de columnas (migr 20260910171150).
grant update (cobro_dia_1_activo) on public.studios to authenticated;
