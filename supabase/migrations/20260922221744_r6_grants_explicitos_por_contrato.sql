-- Redundante con la migración anterior (la firma de
-- materializar_plazas_fijas_sesiones_nuevas NO cambia aquí), pero el
-- contrato de este repo exige que TODA migración que redefina una función
-- SECURITY DEFINER decida por escrito sobre anon EN LA MISMA migración
-- (lib/rgpd-grants-anon-guardias-contrato.test.ts) — defensa en profundidad
-- contra el gotcha de grants, no solo para cuando cambia el número de
-- argumentos.
revoke all on function public.materializar_plazas_fijas_sesiones_nuevas() from public, anon, authenticated;
grant execute on function public.materializar_plazas_fijas_sesiones_nuevas() to service_role;
