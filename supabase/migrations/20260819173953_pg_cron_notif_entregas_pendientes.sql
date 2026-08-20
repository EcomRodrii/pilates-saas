-- C-5 (auditoría 19-ago): índice + cron para el barrido de entregas externas
-- (PUSH/EMAIL/WHATSAPP/SMS) que quedaron en PENDING sin que nadie las
-- intentara — ver lib/notifications/process.ts (barrerEntregasPendientes) y
-- app/api/cron/notif-entregas-pendientes/route.ts.
--
-- Índice parcial: solo indexa lo que el barrido realmente busca (PENDING,
-- no-INAPP, sin intentar), no toda la tabla — igual criterio que el resto de
-- índices parciales del repo (idx_notification_unread, etc.).
create index if not exists idx_delivery_pendiente_barrido
  on public.notification_delivery (created_at)
  where status = 'PENDING' and channel <> 'INAPP' and attempts = 0;

-- Mismo patrón que el resto del bucket A (pg_cron + pg_net, secreto de Vault
-- `supabase_cron_secret`). Cada 10 min: el volumen medido es de pocas filas
-- al día, y la ventana de 2 minutos dentro del barrido ya evita pisar una
-- entrega que sigue en vuelo por el camino síncrono.
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
  );
  $$
);
