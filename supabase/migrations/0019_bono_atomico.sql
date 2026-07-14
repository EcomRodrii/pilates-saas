-- ═══════════════════════════════════════════════════════════════════
-- Consumo/devolución ATÓMICOS del saldo de bono (sesiones_restantes).
--
-- Antes, ambas rutas (servidor público y panel/recepción) leían el saldo,
-- calculaban el nuevo valor en JS y sobrescribían la fila entera. Dos
-- mutaciones concurrentes de la MISMA socia — p. ej. una reserva por el portal
-- y la promoción de su plaza desde lista de espera, o recepción y portal a la
-- vez — leían el mismo saldo inicial y el último UPDATE pisaba al otro
-- (transacción perdida = sesión regalada). Además, con el saldo ya en 0, cada
-- intento de consumo regeneraba el recibo de renovación.
--
-- Mismo patrón atómico ya usado en `reservar_plaza` (aforo) y `ajustar_creditos`
-- (créditos): el incremento/decremento se hace en la BD con un UPDATE guardado
-- y RETURNING, no en el cliente.
-- ═══════════════════════════════════════════════════════════════════

-- Decrementa una sesión del bono de forma atómica y guardada (nunca < 0).
-- Devuelve consumido=false si no había saldo (guard WHERE > 0), de modo que el
-- recibo de renovación se genera SOLO en la transición 1 → 0 (agotado=true).
create or replace function consumir_sesion_bono(
  p_studio_id text, p_suscripcion_id text
) returns table(consumido boolean, restantes int, agotado boolean)
language plpgsql security definer as $$
declare
  v_rest int;
begin
  -- Aislamiento por negocio en llamadas autenticadas (panel). Las de
  -- service-role (endpoints públicos) no tienen auth.uid() y se saltan el check.
  if auth.uid() is not null and p_studio_id is distinct from current_studio_id() then
    raise exception 'STUDIO_MISMATCH';
  end if;

  update suscripciones
    set sesiones_restantes = sesiones_restantes - 1
    where id = p_suscripcion_id and studio_id = p_studio_id
      and sesiones_restantes is not null and sesiones_restantes > 0
    returning sesiones_restantes into v_rest;

  if not found then
    return query select false, null::int, false;
  else
    return query select true, v_rest, (v_rest = 0);
  end if;
end;
$$;

-- Devuelve una sesión al bono de forma atómica, sin superar el total del plan
-- (p_tope null = sin tope). Guardado contra saldos null.
create or replace function devolver_sesion_bono(
  p_studio_id text, p_suscripcion_id text, p_tope int default null
) returns int
language plpgsql security definer as $$
declare
  v_rest int;
begin
  if auth.uid() is not null and p_studio_id is distinct from current_studio_id() then
    raise exception 'STUDIO_MISMATCH';
  end if;

  update suscripciones
    set sesiones_restantes = case
      when p_tope is null then sesiones_restantes + 1
      else least(p_tope, sesiones_restantes + 1)
    end
    where id = p_suscripcion_id and studio_id = p_studio_id
      and sesiones_restantes is not null
    returning sesiones_restantes into v_rest;

  return v_rest;
end;
$$;

grant execute on function consumir_sesion_bono(text, text) to authenticated, service_role;
grant execute on function devolver_sesion_bono(text, text, int) to authenticated, service_role;

-- Elimina la función de reserva muerta: `crear_reserva_atomica` quedó superada
-- por `reservar_plaza` (la única que usa el código) y nadie la invoca. Dos
-- funciones para el mismo trabajo es deuda/confusión.
drop function if exists crear_reserva_atomica(text, text, text, text, text);
