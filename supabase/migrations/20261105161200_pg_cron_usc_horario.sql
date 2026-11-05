-- Cron de publicación del horario en Urban Sports Club (ver
-- lib/plataformas/usc/horario-servidor.ts y app/api/cron/usc-horario/route.ts) —
-- mismo patrón que zoom-sync (20260820193434): pg_cron + pg_net, secreto de Vault
-- supabase_cron_secret.
--
-- APLICADA EN PRODUCCIÓN el 5-nov-2026 (versión 20261105161200), el mismo día en
-- que USC dio las credenciales de sandbox. Antes no se programó a propósito: sin
-- credenciales cada tic era una invocación de Vercel tirada.
--
-- Cada 15 min: sube a USC las clases de las próximas dos semanas de los estudios
-- conectados por API (con IDs verificados y plazas cedidas) y retira lo que ya no
-- toca. Sin estudios conectados no hace nada.
select cron.schedule(
  'usc-horario',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://www.tentare.app/api/cron/usc-horario',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 45000
  );
  $$
);
