-- Piloto de arquitectura (2026-08-11): lista-espera-ofertas-expirar sale de
-- Inngest a pg_cron + pg_net. Es un barrido periódico sin estado por ítem ni
-- espera durable (bucket A de la auditoría de crons) — no necesitaba un
-- motor de workflows para empezar. Ver lib/lista-espera/expirar-ofertas.ts y
-- app/api/cron/lista-espera-ofertas-expirar/route.ts.
--
-- El secreto que autentica la llamada (SUPABASE_CRON_SECRET) vive en
-- Supabase Vault, NO en este fichero — se insertó aparte con
-- vault.create_secret(), nunca en una migración committeada al repo.
--
-- Cadencia: */5 min, la misma que tenía en Inngest. La razón de negocio no
-- cambió (ver lib/lista-espera/expirar-ofertas.ts): solo cambió quién dispara
-- el barrido.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'lista-espera-ofertas-expirar',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://www.tentare.app/api/cron/lista-espera-ofertas-expirar',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets where name = 'supabase_cron_secret'
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
