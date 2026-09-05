-- Auditoría 23ª pasada (hallazgo pendiente): la prueba gratuita de 7 días
-- bloqueaba el acceso (cerrar_pruebas_vencidas, migr 20260819110611) sin
-- avisar nunca a nadie, ni antes ni después. Este barrido nuevo (bucket A,
-- mismo patrón que notif-bonos/notif-inactivas) avisa a la propietaria
-- cuando quedan pocos días y cuando ya se bloqueó — ver
-- lib/notificaciones/trial-avisos-cron.ts.
select cron.schedule(
  'notif-trial',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://www.tentare.app/api/cron/notif-trial',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
