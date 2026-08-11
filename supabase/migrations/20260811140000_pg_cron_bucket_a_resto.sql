-- Continuación del piloto de arquitectura (ver 20260811133000): el resto del
-- bucket A de la auditoría de crons — barridos periódicos sin estado por
-- ítem ni espera durable — sale de Inngest a pg_cron + pg_net. Bucket B
-- (confirmacion-riesgo, sustituciones, valoraciones, decision-medir-outcome)
-- y bucket C (todo lo que toca Stripe: conciliar-cobros, dunning,
-- penalizaciones, renovaciones, decision, automatizaciones, cierre-gestoria)
-- se quedan en Inngest, sin tocar.
--
-- Mismo secreto que el piloto (Vault, `supabase_cron_secret`), mismas
-- cadencias que tenían en Inngest — solo cambia quién dispara cada barrido.
select cron.schedule(
  'checkin-automatico',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := 'https://www.tentare.app/api/cron/checkin-automatico',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

select cron.schedule(
  'minimo-asistentes-cancelar',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://www.tentare.app/api/cron/minimo-asistentes',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

select cron.schedule(
  'reservas-pendientes-expirar',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://www.tentare.app/api/cron/reservas-pendientes',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

select cron.schedule(
  'notif-recordatorios',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://www.tentare.app/api/cron/notif-recordatorios',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

select cron.schedule(
  'backups-diarios',
  '0 3 * * *',
  $$
  select net.http_post(
    url := 'https://www.tentare.app/api/cron/backups',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

select cron.schedule(
  'notif-bonos',
  '0 9 * * *',
  $$
  select net.http_post(
    url := 'https://www.tentare.app/api/cron/notif-bonos',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

select cron.schedule(
  'notif-inactivas',
  '0 10 * * 1',
  $$
  select net.http_post(
    url := 'https://www.tentare.app/api/cron/notif-inactivas',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

select cron.schedule(
  'revisiones-salud',
  '0 7 * * *',
  $$
  select net.http_post(
    url := 'https://www.tentare.app/api/cron/revisiones-salud',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

select cron.schedule(
  'resumen-semanal',
  '15 9 * * 1',
  $$
  select net.http_post(
    url := 'https://www.tentare.app/api/cron/resumen-semanal',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
