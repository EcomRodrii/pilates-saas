-- Community & Messaging OS (P0) — digest de baja frecuencia de mensajes sin
-- leer. Nunca un email por mensaje individual: EVENTOS.MENSAJE_RECIBIDO
-- (lib/notifications/catalog.ts) es solo PUSH; este es el ÚNICO camino de
-- EMAIL de toda la mensajería.
--
-- La comparación `leido_hasta < ultimo_mensaje_en` vive en esta función SQL
-- (STABLE) en vez de traer todas las filas de `conversacion_participantes`
-- al cliente para filtrarlas en JS — mismo criterio de eficiencia que el
-- resto de agregados server-side del repo (informe_ingresos_server_agg,
-- stats_clientas_server_agg...). Solo cubre conversaciones con un
-- `leido_hasta` por persona real (ALUMNA_INSTRUCTORA en los dos lados,
-- ALUMNA_MOSTRADOR solo en el lado SOCIO) — el staff dinámico de
-- ALUMNA_MOSTRADOR/EQUIPO no tiene fila propia (ver migración de RLS 2/4) y
-- queda fuera de este digest, límite conocido y documentado en
-- lib/mensajeria/digest.ts.
--
-- SECURITY DEFINER pero SOLO alcanzable por service_role (el cron llama con
-- getSupabaseAdmin(), nunca desde el cliente): revoke explícito de
-- PUBLIC/anon/authenticated + grant a service_role, y no al revés — pg_default_acl
-- da EXECUTE directo a authenticated/anon en toda función SECURITY DEFINER
-- nueva de este proyecto (ver nota de memoria "pg_default_acl: REVOKE FROM
-- PUBLIC no basta"), así que un solo REVOKE FROM PUBLIC no habría bastado.
create or replace function public.mensajes_no_leidos_para_digest()
returns table(auth_user_id uuid, studio_id text, studio_slug text, conversaciones bigint)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select cp.auth_user_id, c.studio_id, s.slug, count(*)::bigint as conversaciones
    from conversacion_participantes cp
    join conversaciones c on c.id = cp.conversacion_id
    join studios s on s.id = c.studio_id
   where cp.leido_hasta < c.ultimo_mensaje_en
   group by cp.auth_user_id, c.studio_id, s.slug;
$function$;

revoke all on function public.mensajes_no_leidos_para_digest() from public;
revoke all on function public.mensajes_no_leidos_para_digest() from anon;
revoke all on function public.mensajes_no_leidos_para_digest() from authenticated;
grant execute on function public.mensajes_no_leidos_para_digest() to service_role;

-- Cada 3 horas: suficientemente frecuente para que "tienes mensajes sin
-- leer" no llegue con más de medio día de retraso, y suficientemente
-- espaciado (8 tics/día) para no acercarse al límite de invocaciones de
-- Vercel que ya obligó a bajar otros crons de 1min/15min a ventanas más
-- anchas (ver `inngest-limite-recordatorios-fan-out`) — aquí ni siquiera
-- aplica ese límite (es pg_cron + pg_net, no Inngest), pero el criterio de
-- "no más frecuente de lo que el negocio necesita" es el mismo. El dedup
-- diario del propio motor de notificaciones (mensaje-digest:<id>:<fecha>)
-- hace que solo el primer tic del día por persona cree aviso de verdad.
select cron.schedule(
  'notif-mensajes-digest',
  '0 */3 * * *',
  $$
  select net.http_post(
    url := 'https://www.tentare.app/api/cron/notif-mensajes-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
