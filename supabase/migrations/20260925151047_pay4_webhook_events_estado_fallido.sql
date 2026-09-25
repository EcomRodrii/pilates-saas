-- PAY-4 (auditoría 25-sep): `webhook_events.estado = 'procesando'` significaba a la vez
-- «en vuelo» y «se cayó / terminó sin completarse», y el evento no se podía reclamar de
-- nuevo hasta pasados 120 s. Se añade un tercer estado, 'fallido': lo escribe el
-- webhook al terminar sin haber completado el evento (error, excepción o éxito parcial
-- con trabajo a mano), y un reenvío desde el Dashboard de Stripe lo reclama AL INSTANTE
-- en vez de esperar la expiración. 'procesando' vuelve a significar solo «en vuelo».
--
-- La expiración de 120 s se conserva como red para el proceso que muere sin llegar a
-- escribir 'fallido' (timeout de la función).

create or replace function public.reclamar_webhook_event(
  p_event_id text,
  p_tipo text,
  p_expira_segundos int default 120
)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_reclamado boolean;
begin
  insert into public.webhook_events (id, tipo, estado, reclamado_en)
    values (p_event_id, p_tipo, 'procesando', now())
  on conflict (id) do update
    set reclamado_en = now(), tipo = excluded.tipo, estado = 'procesando'
    where webhook_events.estado = 'fallido'
       or (webhook_events.estado = 'procesando'
           and webhook_events.reclamado_en < now() - (p_expira_segundos || ' seconds')::interval)
  returning true into v_reclamado;

  return coalesce(v_reclamado, false);
end;
$function$;

-- Solo pasa de 'procesando' a 'fallido': nunca pisa un 'completado'.
create or replace function public.fallar_webhook_event(p_event_id text)
returns void
language sql
security definer
set search_path to 'public', 'pg_temp'
as $function$
  update public.webhook_events
     set estado = 'fallido'
   where id = p_event_id and estado = 'procesando';
$function$;

-- `pg_default_acl` da EXECUTE directo a anon/authenticated en toda función nueva.
revoke all on function public.reclamar_webhook_event(text, text, int) from public, anon, authenticated;
revoke all on function public.completar_webhook_event(text) from public, anon, authenticated;
revoke all on function public.fallar_webhook_event(text) from public, anon, authenticated;
grant execute on function public.reclamar_webhook_event(text, text, int) to service_role, postgres;
grant execute on function public.completar_webhook_event(text) to service_role, postgres;
grant execute on function public.fallar_webhook_event(text) to service_role, postgres;

do $$
declare f text;
begin
  foreach f in array array['reclamar_webhook_event(text,text,int)','completar_webhook_event(text)','fallar_webhook_event(text)'] loop
    if has_function_privilege('anon', 'public.' || f, 'EXECUTE') or has_function_privilege('authenticated', 'public.' || f, 'EXECUTE') then
      raise exception '% quedó llamable por roles de cliente', f;
    end if;
  end loop;
end $$;
