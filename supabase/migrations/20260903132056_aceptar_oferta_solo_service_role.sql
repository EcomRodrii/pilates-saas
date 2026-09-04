-- Auditoría 22ª pasada (3-sep-2026), F-4.
-- `aceptar_oferta_lista_espera` era la última RPC de la familia de reservas con
-- EXECUTE para `authenticated` y sin comprobar rol por dentro. Su consumo de
-- bono vive en TS, no en la RPC, así que cualquier staff con JWT podía dejar una
-- reserva CONFIRMADA sin descontar sesión. Único llamante: la ruta
-- /api/reservas/aceptar-oferta-espera, que va con service-role.
revoke execute on function public.aceptar_oferta_lista_espera(text, text, text) from authenticated;
