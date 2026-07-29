create or replace function public.ajustar_creditos(p_socio_id text, p_studio_id text, p_delta_saldo integer, p_delta_ganado integer, p_delta_canjeado integer)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_saldo int;
begin
  perform public.validar_studio_mismatch(p_studio_id);
  perform public.validar_socio_del_studio(p_socio_id, p_studio_id);

  if auth.uid() is not null and p_delta_saldo > 0 then
    raise exception 'GANANCIA_NO_PERMITIDA_AQUI';
  end if;

  insert into member_credits (socio_id, studio_id, saldo, total_ganado, total_canjeado, actualizado_en)
    values (p_socio_id, p_studio_id, p_delta_saldo, p_delta_ganado, p_delta_canjeado, now())
  on conflict (socio_id) do update set
    saldo = member_credits.saldo + p_delta_saldo,
    total_ganado = member_credits.total_ganado + p_delta_ganado,
    total_canjeado = member_credits.total_canjeado + p_delta_canjeado,
    actualizado_en = now()
  returning saldo into v_saldo;

  if v_saldo < 0 then
    raise exception 'SALDO_INSUFICIENTE';
  end if;

  return v_saldo;
end;
$function$;
