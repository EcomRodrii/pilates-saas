-- P-1 (auditoría 21-ago): cancelar una clase completa (avería, baja de la
-- instructora, mal tiempo...) no devolvía la sesión consumida a las socias
-- afectadas en dos de los tres caminos que lo hacen (panel/serie y
-- sustituciones); solo el cron de mínimo de asistentes ya lo devolvía.
--
-- Decisión de producto del fundador: no es un comportamiento fijo — cada
-- estudio decide si, al cancelar ÉL una clase, las socias con plaza
-- recuperan la sesión en su bono o se les agota igual. Mismo patrón que el
-- resto de campos de política en `studios` (boolean simple, como su vecino
-- `cancelacion_devolver_bono_tardia`, que resuelve la misma pregunta para
-- cuando es la SOCIA quien cancela tarde).
--
-- Default TRUE: si el estudio cancela la clase, no es la socia quien rompe
-- el compromiso — mismo criterio que ya usa `cancelarSesionPorMinimoNoAlcanzado`
-- (el único de los tres caminos que ya resolvía esto bien).
alter table public.studios
  add column if not exists cancelacion_clase_devuelve_bono boolean not null default true;
