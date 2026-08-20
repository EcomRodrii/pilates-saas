-- Cron de sincronización de reuniones de Zoom (ver lib/zoom-sync.ts y
-- app/api/cron/zoom-sync/route.ts) — mismo patrón bucket A (pg_cron + pg_net,
-- secreto de Vault supabase_cron_secret) que notif-entregas-pendientes.
-- Cada 15 min: el enlace de Zoom tiene que existir antes de que empiece la
-- clase, pero no hay urgencia de segundos como en el corte por riesgo de
-- plantón — mismo ritmo que el resto del bucket A.
select cron.schedule(
  'zoom-sync',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://www.tentare.app/api/cron/zoom-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 45000
  );
  $$
);
