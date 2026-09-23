-- AUT-10 (auditoría 23-sep): `cron.job_run_details.status = 'succeeded'` solo
-- dice que `net.http_post` ENCOLÓ la petición, no que la ruta respondiera
-- 2xx — pg_net es asíncrono. Si mañana el dominio, el secreto del Vault o una
-- ruta se rompen, los 19 crons de este repo seguirán diciendo "succeeded"
-- indefinidamente. El resultado real vive en `net._http_response` (TTL 6h,
-- se purga sola), que hoy no consulta nadie.
--
-- Este vigilante no intenta atribuir un fallo a un job concreto:
-- `net._http_response` no guarda qué lo llamó, y capturar el request_id de
-- cada una de las 19 llamadas existentes (cambiar `select net.http_post(...)`
-- a `select net.http_post(...) into v_id` + una tabla de correlación) es un
-- cambio mucho mayor que "aditivo y de bajo riesgo". Lo que sí puede decir
-- hoy, con una sola query: "algo en la infraestructura de crons ha fallado
-- en los últimos 20 minutos" — que es exactamente el silencio que hoy existe
-- y que AUT-10 pide cerrar. Encontrar CUÁL de los 19 es trabajo manual sobre
-- `net._http_response`/logs de Vercel una vez avisados.
create or replace function public.vigilar_jobs_http()
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_fallos int;
  v_muestra jsonb;
begin
  with malos as (
    select status_code, timed_out, error_msg, created
    from net._http_response
    where created > now() - interval '20 minutes'
      and (status_code is null or status_code not between 200 and 299 or timed_out or error_msg is not null)
  )
  select count(*), coalesce(
    (select jsonb_agg(jsonb_build_object(
       'status_code', status_code, 'timed_out', timed_out, 'error_msg', error_msg, 'created', created
     ))
     from (select * from malos order by created desc limit 5) m),
    '[]'::jsonb
  )
  into v_fallos, v_muestra
  from malos;

  if v_fallos > 0 then
    perform net.http_post(
      url := 'https://www.tentare.app/api/cron/vigilar-jobs-http',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          select decrypted_secret from vault.decrypted_secrets where name = 'supabase_cron_secret'
        )
      ),
      body := jsonb_build_object('fallos', v_fallos, 'muestra', v_muestra),
      timeout_milliseconds := 15000
    );
  end if;
end;
$function$;

-- Contrato del repo: toda función SECURITY DEFINER nueva decide por escrito
-- sobre anon en la misma migración (lib/rgpd-grants-anon-guardias-contrato.test.ts).
-- Solo la ejecuta pg_cron (rol postgres); nadie más debe poder llamarla.
revoke all on function public.vigilar_jobs_http() from public, anon, authenticated;
grant execute on function public.vigilar_jobs_http() to postgres, service_role;

-- Cada 15 min, igual que el resto de los "Bucket A" de este repo. Con TTL de
-- pg_net a 6h de sobra para no perder nada entre pasadas.
select cron.schedule(
  'vigilar-jobs-http',
  '*/15 * * * *',
  $$select public.vigilar_jobs_http();$$
);
