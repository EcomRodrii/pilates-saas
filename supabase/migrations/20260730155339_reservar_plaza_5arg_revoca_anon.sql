-- La firma nueva de reservar_plaza (con p_permite_lista_espera, migración
-- 20260730152516 de este mismo PR) nació ejecutable por `anon` — Postgres
-- trata cada firma de argumentos como una función distinta a efectos de
-- GRANT, así que no heredó el REVOKE que ya protegía a la de 4 argumentos
-- (revoke_anon_rpc_via_public). La función solo valida que socio_id
-- pertenece a studio_id, no que quien llama ES esa socia (esa identidad la
-- comprueba crearReservaPublica antes de invocar la RPC) — con anon
-- pudiendo llamarla directo por /rest/v1/rpc/reservar_plaza, cualquiera sin
-- sesión podía reservar en nombre de cualquier socia, en cualquier estudio.
--
-- Aplicado ya en prod de forma urgente al detectarlo en revisión de este PR
-- (dwqvdycjcffqwfkzapvi); este archivo lo deja en git para que la próxima
-- persona que mire supabase/migrations/ entienda por qué el grant de esta
-- firma difiere del resto de RPCs públicas.
revoke execute on function public.reservar_plaza(text, text, text, text, boolean) from public;
revoke execute on function public.reservar_plaza(text, text, text, text, boolean) from anon;
grant execute on function public.reservar_plaza(text, text, text, text, boolean) to authenticated;
grant execute on function public.reservar_plaza(text, text, text, text, boolean) to service_role;
