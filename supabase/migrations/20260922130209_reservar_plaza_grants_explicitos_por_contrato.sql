-- Redundante con la migracion anterior (la firma de reservar_plaza NO cambia
-- aqui), pero el contrato de este repo exige que TODA migracion que redefina
-- una funcion SECURITY DEFINER decida por escrito sobre anon EN LA MISMA
-- migracion (lib/rgpd-grants-anon-guardias-contrato.test.ts) -- defensa en
-- profundidad contra el gotcha de grants, no solo para cuando cambia el
-- numero de argumentos.
revoke all on function public.reservar_plaza(text, text, text, text, boolean, boolean, text, boolean, boolean, text) from public, anon, authenticated;
grant execute on function public.reservar_plaza(text, text, text, text, boolean, boolean, text, boolean, boolean, text) to service_role, postgres;
