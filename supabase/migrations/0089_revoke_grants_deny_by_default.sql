-- 0089 · F0 (audit A2 / F0-7) — REVOKE explícito de los grants residuales en las
-- tablas "deny-by-default" (RLS activo, 0 políticas).
--
-- La RLS ya deniega el acceso a anon/authenticated en estas tablas, pero el GRANT
-- por defecto (GRANT ALL ... TO anon, authenticated de Supabase) seguía presente.
-- Se quita para que:
--   1. la intención "solo service-role" quede EXPLÍCITA, y
--   2. si algún día se añadiera una política permisiva por error, el acceso siga
--      bloqueado por falta de grant (defensa en profundidad) — importa sobre todo
--      en `integracion_credenciales` (secretos OAuth) y `migracion_batches`.
--
-- El service-role IGNORA los grants (los usa con su propia clave), así que las rutas
-- de servidor que leen/escriben estas tablas NO se ven afectadas. Idempotente.
revoke all on public.integracion_credenciales      from anon, authenticated;
revoke all on public.avisos_hueco                   from anon, authenticated;
revoke all on public.instructor_enlaces_vigentes    from anon, authenticated;
revoke all on public.migracion_batches              from anon, authenticated;
