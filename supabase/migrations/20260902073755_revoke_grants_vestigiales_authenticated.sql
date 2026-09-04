-- F-22 (auditoría 20ª pasada, 1-sep-2026): `webhook_reembolsos` y
-- `webhook_disputas` eran las únicas dos tablas de `public` con
-- `relrowsecurity = false` y 0 policies. Sin grants a `anon`/`authenticated`
-- (revocados desde su creación en 20260826224411_webhook_reembolsos_disputas),
-- así que no eran alcanzables hoy — pero "RLS apagada" es la peor base posible
-- para ese "hoy": si alguien concede SELECT a `authenticated` más adelante
-- (p.ej. para que el panel audite reembolsos), sin RLS de por medio vería las
-- filas de TODOS los estudios de golpe, sin ninguna policy que lo frene.
-- Activar RLS sin políticas dejaría el mismo resultado práctico (deny-by-default
-- también para roles que sí reciban grant futuro) pero con la cerradura real
-- puesta, no solo ausente.
--
-- De paso, `authenticated` conservaba GRANT vestigial en tres tablas que ya
-- no lo necesitan (uso real acotado a service_role o RLS por policy propia):
-- `red_resenas`, `notification_delivery`, `review_boost_recompensas`.
--
-- Nota de procedencia: esta migración se aplicó en producción por otra sesión
-- de trabajo en paralelo (visible en `supabase_migrations.schema_migrations`
-- como `revoke_grants_vestigiales_authenticated`, sellada en este mismo
-- timestamp) pero su fichero nunca llegó a este repo — recuperada aquí verbatim
-- desde `schema_migrations.statements` para cerrar la deriva repo↔producción
-- (mismo patrón que documenta `.claude/tentare-os.md`: cruzar por NOMBRE,
-- nunca por número, y renombrar el fichero a la versión realmente aplicada).

revoke all on table public.red_resenas from authenticated;
revoke all on table public.notification_delivery from authenticated;
revoke all on table public.review_boost_recompensas from authenticated;

alter table public.webhook_disputas enable row level security;
alter table public.webhook_reembolsos enable row level security;
