-- El badge «NUEVO» deja de caducar por fecha: la ÚNICA forma de apagarlo pasa
-- a ser borrar la fila desde /interno. Sustituye la decisión de la migración
-- 20260821145014 (expira_en NOT NULL, pensada como red de seguridad para que
-- nadie se olvidara de quitarlo) — pedido explícito del fundador: quien lo
-- marca espera que se quede ahí hasta que él mismo lo quite, no que
-- desaparezca solo.
alter table public.menu_novedades drop column expira_en;

comment on table public.menu_novedades is
  'Entradas del menú del panel marcadas como NUEVO desde /interno. Global (sin studio_id). Una fila = un badge vivo hasta que se borra a mano.';
