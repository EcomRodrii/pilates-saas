-- F-21 (auditoría 20ª pasada, 1-sep-2026): grants a `anon` demasiado anchos en
-- `socios`, `ventas_pos`, `spots` (posts_comunidad y valoraciones ya se
-- cerraron en F-18 y F-9 respectivamente). Las tres tablas dan
-- GRANT ALL/INSERT/UPDATE/DELETE a `anon` de fábrica (0000_base), pero sus
-- policies son SIEMPRE `to authenticated` — hoy fail-closed (verificado en
-- vivo: 0 filas / 42501 en spots, que ni siquiera tiene SELECT concedido).
-- Lo único que separa a un visitante anónimo de la tabla de socias es la
-- ausencia de una policy permisiva, no una decisión explícita — el mismo
-- desajuste policy↔grant que ya documentan 20260820165632/20260901135856:
-- que alguien añada una policy `to anon` el día de mañana (p.ej. para un
-- widget público nuevo) heredaría sin darse cuenta el resto de operaciones
-- (INSERT/UPDATE/DELETE) que el grant ya llevaba concedidas desde 0000_base.
--
-- Verificado por grep exhaustivo: ningún camino de código legítimo lee/escribe
-- estas tres tablas con la clave anónima — todo lo público pasa por
-- getSupabaseAdmin() (service-role, ignora RLS/grants) en app/api/public/*,
-- y el resto son llamadas de panel con sesión `authenticated`.

revoke all on table public.socios from anon;
revoke all on table public.ventas_pos from anon;
revoke all on table public.spots from anon;

comment on table public.socios is
  'F-21: sin GRANT a anon — la lectura/escritura pública pasa siempre por service-role en app/api/public/*. Auditoría 20ª pasada, 1-sep-2026.';
comment on table public.ventas_pos is
  'F-21: sin GRANT a anon — mismo criterio que socios.';
comment on table public.spots is
  'F-21: sin GRANT a anon — mismo criterio que socios.';
