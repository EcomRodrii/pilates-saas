-- Clases fijas del estudio, Fase 2: avisa a la alumna cuando le quedan pocos
-- días de una clase fija (DIAS_AVISO_CLASE_FIJA_TERMINA) para que pueda
-- ampliarla antes de perder el sitio sin saberlo. Mismo patrón bucket A que
-- notif-bonos/notif-trial — nunca un cron nuevo de Inngest (ya al ~84% del
-- plan free). Migración aparte de la de esquema/RPC (20260922100000) para
-- poder aplicarse de forma independiente.
select cron.schedule(
  'clase-fija-termina-pronto',
  '0 9 * * *',
  $$
  select net.http_post(
    url := 'https://www.tentare.app/api/cron/clase-fija-termina-pronto',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
