-- Bug: una clase que quedaba sin sustituta y ya había pasado seguía
-- apareciendo como "activa" (Contactando/esperando respuesta) en el panel de
-- sustituciones para siempre. Causa: ni el motor de escalado
-- (lib/inngest/sustituciones.ts) ni ningún otro proceso cerraban la fila
-- cuando la clase pasaba sin cubrirse — solo un humano confirmando o
-- cancelando la sacaba de un estado "en juego".
--
-- Mismo patrón que el resto del bucket A (ver 20260811133000 y 20260811140000):
-- barrido periódico sin estado por ítem ni espera durable, disparado por
-- pg_cron + pg_net directamente contra Postgres, autenticado con el mismo
-- secreto de Vault (`supabase_cron_secret`) que el resto de este bucket.
-- Ver lib/sustituciones/cerrar-vencidas.ts y
-- app/api/cron/sustituciones-cerrar-vencidas/route.ts.
select cron.schedule(
  'sustituciones-cerrar-vencidas',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := 'https://www.tentare.app/api/cron/sustituciones-cerrar-vencidas',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
