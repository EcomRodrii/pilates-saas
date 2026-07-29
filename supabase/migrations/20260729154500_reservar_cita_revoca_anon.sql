-- CRÍTICO: reservar_cita era ejecutable por `anon` SIN NINGUNA autenticación.
-- Se creó en la migración 0046, después de que 0029 revocara EXECUTE de
-- anon/PUBLIC para el resto de RPCs de reservas (reservar_plaza,
-- cancelar_reserva_plaza, crear_reserva_atomica, ajustar_creditos) — 0046 nunca
-- se sumó a esa lista, así que se quedó con el privilegio por defecto que
-- ALTER DEFAULT PRIVILEGES concede a `anon` en 0000_base.sql para toda función
-- nueva.
--
-- Impacto real confirmado: con la anon key pública, cualquiera podía llamar
-- POST /rest/v1/rpc/reservar_cita directamente (sin pasar por
-- crearCitaPublica en lib/supabase-data.ts, que sí valida email/JWT, catálogo,
-- disponibilidad y deriva el precio en servidor) y crear una cita para
-- CUALQUIER socio_id de CUALQUIER estudio, con p_precio/p_notas/p_inicio/
-- p_fin arbitrarios — el único guard de la función es que socio e instructor
-- pertenezcan al mismo studio_id, no que el llamante SEA esa socia. El check
-- `auth.uid() is not null and ...` de la función tampoco protege: para `anon`,
-- auth.uid() es NULL, así que esa condición se salta entera.

revoke execute on function public.reservar_cita(text, text, text, text, text, text, timestamptz, timestamptz, numeric, text) from public, anon;
