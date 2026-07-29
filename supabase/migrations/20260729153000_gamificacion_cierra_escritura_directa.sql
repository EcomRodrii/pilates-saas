-- Cierra el hueco real detrás de otorgar_credito_disparador: esa RPC solo
-- protege a quien pasa por el CÓDIGO de la app. La política RLS `admin_*` de
-- member_credits/reward_actions era `ALL ... studio_id = current_studio_id()`
-- — cualquier cuenta de personal autenticada podía seguir escribiendo esas
-- tablas DIRECTAMENTE (supabase.from('member_credits').update(...)) desde la
-- consola del navegador, sin pasar por ninguna RPC, y otorgarse cualquier
-- saldo. Se restringe a SELECT para `authenticated` — todas las escrituras
-- reales ya pasan por RPCs SECURITY DEFINER (otorgar_credito_disparador,
-- ajustar_creditos) o por el service-role del servidor (checkin/canje
-- públicos), que no dependen de esta policy.
--
-- Además, ajustar_creditos (ya usada para el DÉBITO del canje, delta negativo)
-- no comprobaba el signo: llamada directamente con p_delta_saldo positivo
-- otorgaba crédito arbitrario igual que el hueco que otorgar_credito_disparador
-- cierra para el camino "normal". Se le exige delta_saldo <= 0 cuando la llama
-- una SESIÓN de staff (auth.uid() no nulo) — su único uso legítimo desde el
-- cliente autenticado es descontar en un canje. El servidor (service-role,
-- auth.uid() nulo) SIGUE pudiendo otorgar con delta positivo: lo usan
-- evaluarLogrosServidor/evaluarRetosServidor y el checkin público, que ya
-- calculan el importe desde reward_rules/achievement_definitions/
-- challenge_definitions en servidor — no reciben nada del cliente.

drop policy if exists admin_member_credits on member_credits;
create policy staff_lee_member_credits on member_credits
  for select using (studio_id = current_studio_id());

drop policy if exists admin_reward_actions on reward_actions;
create policy staff_lee_reward_actions on reward_actions
  for select using (studio_id = current_studio_id());

create or replace function public.ajustar_creditos(p_socio_id text, p_studio_id text, p_delta_saldo integer, p_delta_ganado integer, p_delta_canjeado integer)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_saldo int;
begin
  if auth.uid() is not null and p_studio_id is distinct from public.current_studio_id() then
    raise exception 'STUDIO_MISMATCH';
  end if;

  if not exists (select 1 from socios where id = p_socio_id and studio_id = p_studio_id) then
    raise exception 'SOCIO_NO_PERTENECE_AL_STUDIO';
  end if;

  -- Desde una sesión de staff, ganar créditos pasa SIEMPRE por
  -- otorgar_credito_disparador (recalcula el importe en servidor); esta RPC
  -- solo debe poder DEBITAR (canje) para ese caso. El servidor (service-role,
  -- sin sesión) sigue pudiendo otorgar con delta positivo — ya calcula el
  -- importe él mismo, no recibe nada del cliente.
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
