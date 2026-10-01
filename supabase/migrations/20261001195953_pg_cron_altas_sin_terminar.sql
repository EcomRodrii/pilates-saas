-- Recordatorio a las 24 h a quien empezó un alta de estudio y no la terminó
-- (lib/alta/recordatorio-servidor.ts, app/api/cron/altas-sin-terminar).
-- Mismo patrón bucket A que zoom-sync: pg_cron + pg_net con el secreto de
-- Vault `supabase_cron_secret`. NO Inngest: va cerca del límite del plan.
--
-- Cada hora, al minuto 23 (fuera de la ráfaga de los `*/15`). Un aviso de
-- «te falta un paso» no gana nada por llegar a las 24 h exactas y no a las 24
-- y media, y así son 24 llamadas al día como mucho.
--
-- El `where exists` va ANTES del POST: sin altas pendientes no se llama a
-- Vercel (mismo criterio que api-webhooks). La condición es la de
-- `altas_estudio_detalle(true)` — si una cambia, la otra también.
select cron.unschedule('altas-sin-terminar')
 where exists (select 1 from cron.job where jobname = 'altas-sin-terminar');
select cron.schedule(
  'altas-sin-terminar',
  '23 * * * *',
  $$
  select net.http_post(
    url := 'https://www.tentare.app/api/cron/altas-sin-terminar',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  )
  where exists (
    select 1 from public.altas_estudio a
    where a.recordatorio_enviado_en is null
      and a.recordatorio_reclamado_en is null
      and a.recordatorio_descartado is null
      and a.iniciada_en <= now() - interval '24 hours'
      and (a.origen = 'registro' or a.plan_en is not null or a.error_estudio_en is not null)
  );
  $$
);
