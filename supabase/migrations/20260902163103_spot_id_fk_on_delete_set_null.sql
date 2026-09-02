-- F-33 (auditoría 20ª pasada, 1-sep-2026): `reservas_spot_id_fkey` sin
-- `ON DELETE`. Hoy no hay código que borre `spots` (verificado por grep), así
-- que no explota — pero si algún día se añade (borrar/reordenar el mapa de
-- plazas de una sala), sería el mismo 23503 crudo que ya salió con
-- tarifas/planes: `delete from spots where id = ...` falla en bloque en vez
-- de dejar huérfanas de forma controlada las filas que solo GUARDABAN una
-- preferencia de sitio, no que la NECESITEN para seguir teniendo sentido.
--
-- Encontradas otras DOS FK con el mismo hueco al auditar todas las que
-- referencian `spots` (`confrelid = 'spots'::regclass`): `bloqueos_maquina` y
-- `plazas_fijas`. Las tres tienen `spot_id` NULLABLE — perder el sitio
-- concreto no invalida la fila en ninguna (una reserva sin spot_id ya es un
-- estado válido hoy; un bloqueo de máquina o una plaza fija se definen por
-- sala+horario, no por el spot exacto) — `ON DELETE SET NULL` es la
-- reacción correcta en las tres, no CASCADE (borrar el spot no debe borrar
-- reservas/bloqueos/plazas fijas reales) ni el NO ACTION implícito de hoy.
--
-- Verificado en vivo (execute_sql + ROLLBACK) antes de aplicar: sin el fix,
-- `delete from spots where id = 'spot-1'` (15 reservas reales apuntándolo)
-- falla con 23503; con el fix, la misma DELETE tiene éxito y las 15 quedan
-- con spot_id = NULL, sin perder la reserva.

alter table public.reservas drop constraint reservas_spot_id_fkey;
alter table public.reservas add constraint reservas_spot_id_fkey
  foreign key (spot_id) references public.spots(id) on delete set null;

alter table public.bloqueos_maquina drop constraint bloqueos_maquina_spot_id_fkey;
alter table public.bloqueos_maquina add constraint bloqueos_maquina_spot_id_fkey
  foreign key (spot_id) references public.spots(id) on delete set null;

alter table public.plazas_fijas drop constraint plazas_fijas_spot_id_fkey;
alter table public.plazas_fijas add constraint plazas_fijas_spot_id_fkey
  foreign key (spot_id) references public.spots(id) on delete set null;
