-- Las valoraciones de clases solo las lee el SERVIDOR.
--
-- La tabla lleva quién votó y su comentario libre. Hasta ahora la política
-- `admin_valoraciones` dejaba leerla con la sesión a todo el personal del
-- estudio (instructoras incluidas), y `valoraciones_resumen_estudio` —SECURITY
-- INVOKER— se podía llamar desde el cliente. Nadie lo usaba así: todo el
-- código lee con service-role y aplica ahí quién ve qué. Se cierra la puerta
-- directa. La RLS se queda activa sin políticas: `authenticated` y `anon` no
-- leen nada; service_role no pasa por RLS.

drop policy if exists admin_valoraciones on public.valoraciones;
revoke all on table public.valoraciones from anon;
revoke all on table public.valoraciones from authenticated;

revoke all on function public.valoraciones_resumen_estudio(text) from public;
revoke all on function public.valoraciones_resumen_estudio(text) from anon;
revoke all on function public.valoraciones_resumen_estudio(text) from authenticated;
grant execute on function public.valoraciones_resumen_estudio(text) to service_role;
