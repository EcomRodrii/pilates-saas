-- Cron de publicación del horario en Wellhub (ver lib/plataformas/wellhub/horario-servidor.ts
-- y app/api/cron/wellhub-horario/route.ts): mismo patrón que usc-horario (20261105161200),
-- pg_cron + pg_net con el secreto de Vault supabase_cron_secret.
--
-- APLICADA EN PRODUCCIÓN el 12-nov-2026 (versión 20261112102724), el día en que Wellhub
-- dio las credenciales de sandbox. Antes no se programó a propósito: sin credenciales
-- cada tic era una invocación de Vercel tirada. Sin estudios conectados (con gym y
-- producto) no hace nada.
--
-- Cada 15 min: publica las clases de las próximas dos semanas con plazas cedidas a
-- Wellhub, retira lo que ya no toca y concilia las reservas pendientes de confirmar.
select cron.schedule(
  'wellhub-horario',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://www.tentare.app/api/cron/wellhub-horario',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 45000
  );
  $$
);
