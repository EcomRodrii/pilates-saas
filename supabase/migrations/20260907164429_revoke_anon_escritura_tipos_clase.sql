-- JAVASCRIPT-NEXTJS-29: al investigar por qué una escritura de staff sobre
-- `tipos_clase` falló con "permission denied", salió a la luz que `anon`
-- tenía GRANT de INSERT/UPDATE/DELETE en esta tabla sin ninguna policy que lo
-- respalde (la única policy, `admin_tipos_clase`, es solo para
-- `authenticated`). RLS ya bloqueaba a `anon` en la práctica (deny-by-default
-- sin policy que matchee), así que esto no cambia ningún comportamiento
-- observable — es defensa en profundidad, mismo criterio que el resto de
-- migraciones "revoke_grants_vestigiales_*"/"deny_by_default" del repo.
revoke insert, update, delete on public.tipos_clase from anon;
