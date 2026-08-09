-- authenticated heredaba INSERT/UPDATE/DELETE de los default privileges de
-- Supabase para tablas nuevas en `public` — RLS ya lo bloqueaba (sin política
-- de escritura, deniega por defecto), pero se revoca explícito para que el
-- grant coincida con la intención (solo lectura desde el cliente), mismo
-- criterio de defensa en profundidad que el resto del repo.
revoke insert, update, delete, truncate, references, trigger
  on public.pagos_historicos from authenticated;
