-- Consumo de bono idempotente POR RESERVA (2 de 2: las reservas nuevas nacen
-- rastreadas).
--
-- ⚠️ NO aplicar junto con la 1 de 2 (`20260914182637_reservas_bono_decidido_
-- por_reserva`). Solo después de confirmar que PostgREST ya ve
-- `consumir_sesion_bono_reserva` (check 3 de esa migración: llamada REST con
-- service_role → `RESERVA_NO_ENCONTRADA`, no `PGRST202`).
--
-- Por qué va aparte: una fila rastreada sin marca significa «cobro sin decidir»
-- y un reintento lo completa. Mientras la caché de PostgREST no vea la RPC, el
-- servidor descuenta con la RPC vieja, que no deja marca; si esas filas ya
-- nacieran rastreadas, el reintento las cobraría dos veces.
--
-- ⚠️ Con esto aplicado NO se vuelve al código anterior (descuenta sin marca
-- sobre filas rastreadas). Para revertir el código, antes:
--   alter table public.reservas alter column bono_consumo_rastreado drop default;
--
-- Solo toca el catálogo: las filas existentes siguen a NULL (legadas).

alter table public.reservas
  alter column bono_consumo_rastreado set default true;
