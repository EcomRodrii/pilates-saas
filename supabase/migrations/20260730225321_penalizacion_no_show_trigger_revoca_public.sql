-- Fase 3: el trigger es SECURITY DEFINER pero, como cualquier función nueva,
-- nace con EXECUTE por defecto a PUBLIC. Solo lo dispara Postgres al hacer el
-- UPDATE en reservas (nunca se llama directo desde authenticated/anon) — se
-- endurece igual que el resto de funciones SECURITY DEFINER de este repo.
revoke all on function public.trigger_detectar_penalizacion_no_show() from public, anon, authenticated;
grant execute on function public.trigger_detectar_penalizacion_no_show() to service_role;
