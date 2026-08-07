-- Bug de grants preexistente encontrado durante la auditoría de gaps de
-- reservas recurrentes: el comentario de 0084 ya decía "Sólo el cron
-- (service-role). No anon, no authenticated directo" pero el REVOKE original
-- solo cubría anon+public, no authenticated (que en este proyecto tiene
-- EXECUTE propio en funciones nuevas del esquema public, no solo heredado de
-- PUBLIC). Cualquier socia/instructora autenticada podía llamar esta RPC
-- directo y forzar la materialización de reservas de TODOS los estudios
-- fuera del cron. Verificado con has_function_privilege antes/después.
revoke execute on function public.materializar_plazas_fijas(int) from authenticated;
