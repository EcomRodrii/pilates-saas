-- 20260909160000 · TENTARE — borra reservar_recompensa(), sustituida y huérfana desde #1806
--
-- 42ª pasada de auditoría (2026-09-09), hallazgo H-1. canjear_recompensa()
-- (#1806, 20260909154359_canjes_codigo_y_entrega.sql) sustituyó por completo
-- a reservar_recompensa() + ajustar_creditos() + el INSERT suelto desde TS —
-- el propio commit de #1806 lo dice explícitamente. Confirmado con grep:
-- ningún fichero de lib/ o app/ llama ya a reservar_recompensa (solo queda
-- mencionada en un comentario de lib/supabase-data.ts).
--
-- Pero la función seguía en el catálogo con sus grants intactos
-- (authenticated + service_role), y solo hace la primera mitad del canje
-- (bloquea la fila, comprueba límite/vigencia/stock, decrementa el stock)
-- sin descontar créditos ni insertar en reward_redemptions ni generar
-- código — exactamente el fallo de atomicidad que #1806 corrigió. Cualquier
-- rol de mostrador (mismo guardián puede_gestionar_clientas() que protege
-- canjear_recompensa) podía seguir invocándola directo por
-- POST /rest/v1/rpc/reservar_recompensa y vaciar el stock de una recompensa
-- sin dejar ningún rastro de canje real.

drop function if exists public.reservar_recompensa(text, text, text);
