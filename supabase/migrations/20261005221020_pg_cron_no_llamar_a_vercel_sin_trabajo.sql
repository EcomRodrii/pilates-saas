-- Cinco jobs de pg_cron llamaban a Vercel en cada tic aunque no hubiera nada que
-- hacer: ~720 invocaciones al día (≈21.000 al mes) que respondían
-- `{"expiradas":0}` y gastaban cuota de Vercel y RAM de un Nano que ya hace swap
-- (memoria supabase-504-rafagas-cron-nano-swapping).
--
-- Mismo patrón que `api-webhooks` y `altas-sin-terminar`: el `where exists` va
-- ANTES del POST, así que sin trabajo no se llama a nadie. NO cambian cadencias
-- ni timeouts ni la ruta: solo cuándo se llama.
--
-- ⚠️ Cada predicado es IGUAL o MÁS AMPLIO que la consulta con la que arranca su
-- ruta (nunca más estrecho: un predicado más estrecho dejaría trabajo sin hacer
-- en silencio). Si cambia la consulta de la ruta, cambia aquí también:
--   · lista-espera-ofertas-expirar → lib/lista-espera/expirar-ofertas.ts
--   · reservas-pendientes-expirar  → lib/reservas-pendientes/expirar.ts
--     (la ruta además descarta las de clases futuras: aquí también, es el mismo
--      criterio y evita llamar cada 10 min mientras haya una pendiente de futuro)
--   · notif-entregas-pendientes    → barrerEntregasPendientes (lib/notifications/process.ts)
--   · reparar-bono-sin-decidir     → lib/reservas/reparar-bono-sin-decidir.ts
--   · minimo-asistentes-cancelar   → lib/minimo-asistentes/cancelar-por-minimo.ts
--     (la ruta mira las sesiones de las próximas 2 h; el predicado, lo mismo)
--
-- `vigilar_jobs_http` (AUT-10) solo cuenta respuestas MALAS en las últimas 20
-- min; que un job no genere respuesta no cuenta como fallo.
select cron.unschedule('lista-espera-ofertas-expirar')
 where exists (select 1 from cron.job where jobname = 'lista-espera-ofertas-expirar');
select cron.schedule(
  'lista-espera-ofertas-expirar',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://www.tentare.app/api/cron/lista-espera-ofertas-expirar',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  )
  where exists (
    select 1 from public.reservas r
    where r.estado = 'LISTA_ESPERA'
      and r.oferta_expira_en is not null
      and r.oferta_expira_en <= now()
  );
  $$
);

select cron.unschedule('reservas-pendientes-expirar')
 where exists (select 1 from cron.job where jobname = 'reservas-pendientes-expirar');
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
  )
  where exists (
    select 1 from public.reservas r
    join public.sesiones s on s.id = r.sesion_id
    where r.estado = 'PENDIENTE_APROBACION'
      and r.socio_id is not null
      and s.inicio <= now()
  );
  $$
);

select cron.unschedule('notif-entregas-pendientes')
 where exists (select 1 from cron.job where jobname = 'notif-entregas-pendientes');
select cron.schedule(
  'notif-entregas-pendientes',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://www.tentare.app/api/cron/notif-entregas-pendientes',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  )
  where exists (
    select 1 from public.notification_delivery d
    where d.status = 'PENDING'
      and d.attempts = 0
      and d.channel <> 'INAPP'
      and d.created_at < now() - interval '2 minutes'
  );
  $$
);

select cron.unschedule('reparar-bono-sin-decidir')
 where exists (select 1 from cron.job where jobname = 'reparar-bono-sin-decidir');
select cron.schedule(
  'reparar-bono-sin-decidir',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://www.tentare.app/api/cron/reparar-bono-sin-decidir',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  )
  where exists (
    select 1 from public.reservas r
    where r.estado in ('CONFIRMADA', 'ASISTIDA')
      and r.bono_consumo_rastreado = true
      and r.bono_decidido_en is null
      and r.creado_en < now() - interval '5 minutes'
  );
  $$
);

select cron.unschedule('minimo-asistentes-cancelar')
 where exists (select 1 from cron.job where jobname = 'minimo-asistentes-cancelar');
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
  )
  where exists (
    select 1 from public.sesiones s
    where s.cancelada = false
      and s.inicio > now()
      and s.inicio <= now() + interval '2 hours'
  );
  $$
);
