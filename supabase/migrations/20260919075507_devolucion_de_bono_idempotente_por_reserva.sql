-- Auditoría 2026-09-19 · La devolución de bono se puede repetir a voluntad.
--
-- `devolver_sesion_bono(p_suscripcion_id, p_studio_id)` es un `+1` ciego, topado
-- solo por `planes_tarifa.sesiones`. No sabe NADA de qué reserva lo provocó.
--
-- `POST /api/reservas/devolver-bonos` filtra bien (reserva `CANCELADA`, no
-- `res-pf-`, sesión `cancelada`, política del estudio, rol) — pero NINGUNO de
-- esos filtros cambia al devolver. Mandar dos veces el mismo `reservaIds`
-- vuelve a sumar +1 cada vez, hasta el tope del plan. Un doble clic, un
-- reintento de red o una propietaria impaciente inflan el saldo de la socia, y
-- ese saldo son clases: es dinero.
--
-- Arreglo ADITIVO (no se toca `devolver_sesion_bono`, que tiene otros cinco
-- llamadores, incluido el cliente): una marca por reserva y una RPC nueva que
-- la reclama y devuelve en la MISMA transacción.

alter table public.reservas
  add column if not exists bono_devuelto_en timestamptz;

comment on column public.reservas.bono_devuelto_en is
  'Sella que esta reserva ya recuperó su sesión de bono. Es el candado de idempotencia de devolver_sesion_bono_por_reserva: sin él, la devolución se podía repetir.';

create or replace function public.devolver_sesion_bono_por_reserva(
  p_studio_id text,
  p_reserva_id text
)
returns int
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_suscripcion_id text;
  v_saldo int;
begin
  -- Mismas cerraduras que `devolver_sesion_bono`: con service-role
  -- (`es_llamada_servicio()`) manda el TypeScript, que ya ha comprobado rol y
  -- política; con un JWT de staff se exigen estudio y permiso aquí.
  if not public.es_llamada_servicio() and p_studio_id is distinct from public.current_studio_id() then
    raise exception 'STUDIO_MISMATCH';
  end if;
  if not public.es_llamada_servicio() and not public.puede_gestionar_calendario() then
    raise exception 'NO_AUTORIZADO';
  end if;

  -- 1. RECLAMAR la reserva. Este update es el que serializa: bloquea la fila
  --    hasta el commit, así que dos peticiones simultáneas con el mismo
  --    `p_reserva_id` no pueden pasar las dos. Si ya estaba sellada, `not
  --    found` → null, que el llamante lee como «no había nada que devolver».
  update public.reservas r
     set bono_devuelto_en = now()
   where r.id = p_reserva_id
     and r.studio_id = p_studio_id
     and r.bono_devuelto_en is null
     and r.bono_consumo_rastreado is true
     and r.bono_suscripcion_id is not null
  returning r.bono_suscripcion_id into v_suscripcion_id;

  if v_suscripcion_id is null then
    return null;
  end if;

  -- 2. Devolver, con el mismo tope en el WHERE que la RPC original.
  update public.suscripciones s
     set sesiones_restantes = s.sesiones_restantes + 1
    from public.planes_tarifa p
   where s.id = v_suscripcion_id and s.studio_id = p_studio_id
     and p.id = s.plan_id and p.studio_id = p_studio_id
     and s.sesiones_restantes is not null
     and (p.sesiones is null or s.sesiones_restantes < p.sesiones)
  returning s.sesiones_restantes into v_saldo;

  if v_saldo is null then
    -- El bono estaba al tope: no se ha devuelto nada, así que la marca se
    -- retira. Sellar una devolución que no ocurrió dejaría a la socia sin
    -- poder recuperar esa sesión más adelante, cuando sí hubiera hueco.
    update public.reservas set bono_devuelto_en = null
     where id = p_reserva_id and studio_id = p_studio_id;
    return null;
  end if;

  return v_saldo;
end;
$function$;

-- Decisión explícita sobre los tres roles: la llama el servidor (service-role)
-- y, como su hermana, también el panel con JWT de staff — que es por lo que las
-- guardias de arriba existen. `anon`, nunca.
revoke all on function public.devolver_sesion_bono_por_reserva(text, text) from public, anon;
grant execute on function public.devolver_sesion_bono_por_reserva(text, text) to authenticated, service_role, postgres;
