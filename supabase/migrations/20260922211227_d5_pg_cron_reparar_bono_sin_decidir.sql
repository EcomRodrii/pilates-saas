-- D-5 (auditoría 22-sep): reconciliación proactiva del descuento de bono
-- cuando queda tragado por el BEGIN/EXCEPTION defensivo de `reservar_plaza`
-- (D-1) — ver lib/reservas/reparar-bono-sin-decidir.ts y
-- app/api/cron/reparar-bono-sin-decidir/route.ts. Bucket A (barrido sin
-- estado por ítem, mismo patrón que clase-fija-termina-pronto/
-- series-renovacion): nunca un cron nuevo de Inngest (ya al ~84% del plan
-- free). Cadencia cada 15 min, igual que opening-cerrar-etapas — es una red
-- de seguridad para un caso que hoy mide 0 en producción (D-3 lo confirmó),
-- no un trabajo pesado.
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
  );
  $$
);
