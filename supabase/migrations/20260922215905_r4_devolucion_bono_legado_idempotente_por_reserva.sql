-- R-4 (auditoría 22-sep): `devolver_sesion_bono_por_reserva` (migr
-- 20260919075507) selló la idempotencia SOLO para la rama rastreada
-- (`bono_consumo_rastreado is true and bono_suscripcion_id is not null`).
-- Una reserva LEGADA (anterior a esa migración, o insertada por un camino que
-- no rastrea) cae al `devolver_sesion_bono` original: un `+1` ciego topado
-- por el plan, SIN ninguna marca por reserva. Repetir el POST de
-- `/api/reservas/devolver-bonos` con los mismos ids vuelve a sumar cada vez,
-- hasta el tope del plan — el mismo bug que 20260919075507 cerró para la
-- rama rastreada, sin cerrar en la legada. Medido en la auditoría: 11
-- reservas en producción caían en esta rama.
--
-- Arreglo ADITIVO, mismo patrón exacto que la RPC hermana: `bono_devuelto_en`
-- es una columna genérica de `reservas` (no exige rastreo), así que sella
-- igual para la rama legada — reclama la fila ANTES de decidir de qué
-- suscripción devolver (que sigue siendo la heurística `bonoDevolvible` de
-- TS, sin cambios: una reserva legada no sabe de qué bono se cobró). Si el
-- incremento no encuentra hueco, retira la marca — igual que la RPC hermana,
-- para no dejar sin recuperar una sesión que sí podría devolverse más tarde.

create or replace function public.devolver_sesion_bono_legado_por_reserva(
  p_studio_id text,
  p_reserva_id text,
  p_suscripcion_id text
)
returns int
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_sellada boolean;
  v_saldo int;
begin
  if not public.es_llamada_servicio() and p_studio_id is distinct from public.current_studio_id() then
    raise exception 'STUDIO_MISMATCH';
  end if;
  if not public.es_llamada_servicio() and not public.puede_gestionar_calendario() then
    raise exception 'NO_AUTORIZADO';
  end if;

  -- 1. RECLAMAR la reserva. Sin exigir `bono_consumo_rastreado`: esta RPC es
  --    justo para las que NO lo cumplen. Bloquea la fila hasta el commit —
  --    dos peticiones simultáneas con el mismo `p_reserva_id` no pasan las dos.
  update public.reservas r
     set bono_devuelto_en = now()
   where r.id = p_reserva_id
     and r.studio_id = p_studio_id
     and r.bono_devuelto_en is null
  returning true into v_sellada;

  if not coalesce(v_sellada, false) then
    return null;
  end if;

  -- 2. Devolver a la suscripción que TS ya eligió (`bonoDevolvible`), con el
  --    mismo tope en el WHERE que las dos RPCs hermanas.
  update public.suscripciones s
     set sesiones_restantes = s.sesiones_restantes + 1
    from public.planes_tarifa p
   where s.id = p_suscripcion_id and s.studio_id = p_studio_id
     and p.id = s.plan_id and p.studio_id = p_studio_id
     and s.sesiones_restantes is not null
     and (p.sesiones is null or s.sesiones_restantes < p.sesiones)
  returning s.sesiones_restantes into v_saldo;

  if v_saldo is null then
    update public.reservas set bono_devuelto_en = null
     where id = p_reserva_id and studio_id = p_studio_id;
    return null;
  end if;

  return v_saldo;
end;
$function$;

-- Mismos tres roles que sus dos hermanas (`devolver_sesion_bono[_por_reserva]`):
-- la llama el servidor (service-role) y, para simetría, `authenticated`.
-- `anon`, nunca.
revoke all on function public.devolver_sesion_bono_legado_por_reserva(text, text, text) from public, anon;
grant execute on function public.devolver_sesion_bono_legado_por_reserva(text, text, text) to authenticated, service_role, postgres;
