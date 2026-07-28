-- P2-4 de la auditoría de Cloe, la mitad que quedaba: `consumir_sesion_bono`
-- comprueba la cobertura por tipo de clase (migr 0129) SOLO si le llega
-- `p_sesion_id` — el parámetro se dejó opcional (default null) a propósito,
-- para no romper el JS viejo mientras salía la versión nueva. El despliegue
-- ya terminó: hoy los tres caminos que llaman a esta RPC
-- (dbConsumirSesionBono, consumirBonoServidor en reservar/cancelar) siempre
-- pasan la sesión. Dejar el parámetro opcional es una puerta que ya no usa
-- nadie, pero que un caller futuro (kiosko, integración) podría cruzar sin
-- saber que se salta la comprobación. Se hace obligatorio.
--
-- OJO, a propósito: esto NO se mete dentro de `reservar_plaza`. Reservar y
-- decidir el método de pago (bono / clase suelta / cortesía) son pasos
-- separados por diseño — una reserva de clase suelta o de cortesía no tiene
-- ni tiene que tener un bono que la cubra. La garantía real vive aquí, en el
-- consumo, no en la reserva.

drop function if exists public.consumir_sesion_bono(text, text, text);

create function public.consumir_sesion_bono(
  p_suscripcion_id text,
  p_studio_id text,
  p_sesion_id text
) returns integer
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $$
declare
  v_saldo int;
  v_plan_id text;
  v_tipo_clase_id text;
  v_acotado boolean;
begin
  if auth.uid() is not null and p_studio_id is distinct from public.current_studio_id() then
    raise exception 'STUDIO_MISMATCH';
  end if;

  -- Obligatorio de verdad: un parámetro requerido que acepta NULL sin más no
  -- cierra nada, porque `v_tipo_clase_id is not null` de más abajo se volvería
  -- falso y la comprobación se saltaría en silencio, exactamente el bypass que
  -- esta migración quiere cerrar.
  if p_sesion_id is null then
    raise exception 'SESION_REQUERIDA';
  end if;

  select s.plan_id into v_plan_id
    from public.suscripciones s
   where s.id = p_suscripcion_id and s.studio_id = p_studio_id;

  select ss.tipo_clase_id into v_tipo_clase_id
    from public.sesiones ss
   where ss.id = p_sesion_id and ss.studio_id = p_studio_id;

  -- Sin filas en la tabla puente, el plan cubre TODAS las clases: es la
  -- semántica de la 0106 y la que han tenido siempre los planes de antes.
  select exists (
    select 1 from public.plan_tipos_clase ptc
     where ptc.plan_id = v_plan_id and ptc.studio_id = p_studio_id
  ) into v_acotado;

  if v_acotado and v_tipo_clase_id is not null and not exists (
    select 1 from public.plan_tipos_clase ptc
     where ptc.plan_id = v_plan_id and ptc.studio_id = p_studio_id
       and ptc.tipo_clase_id = v_tipo_clase_id
  ) then
    raise exception 'BONO_NO_CUBRE_CLASE';
  end if;

  update public.suscripciones
     set sesiones_restantes = sesiones_restantes - 1
   where id = p_suscripcion_id
     and studio_id = p_studio_id
     and sesiones_restantes > 0
  returning sesiones_restantes into v_saldo;

  return v_saldo;
end;
$$;

revoke all on function public.consumir_sesion_bono(text, text, text) from public;
revoke all on function public.consumir_sesion_bono(text, text, text) from anon;
grant execute on function public.consumir_sesion_bono(text, text, text) to authenticated, service_role;
