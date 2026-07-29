create or replace function public.congelar_suscripcion(p_id text, p_suscripcion_id text, p_studio_id text, p_motivo text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  perform public.validar_studio_mismatch(p_studio_id);

  begin
    insert into congelaciones (id, studio_id, suscripcion_id, desde, motivo)
      values (p_id, p_studio_id, p_suscripcion_id, current_date, p_motivo);
  exception when unique_violation then
    return;
  end;

  update suscripciones set estado = 'PAUSADA'
    where id = p_suscripcion_id and studio_id = p_studio_id and estado = 'ACTIVA';
end;
$function$;
