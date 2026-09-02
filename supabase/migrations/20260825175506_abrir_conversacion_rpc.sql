-- Community & Messaging OS — P0, pieza 3/4: RPC `abrir_conversacion`.
--
-- Único camino de escritura para crear una conversación/sus participantes
-- (conversaciones/conversacion_participantes no tienen policy de INSERT para
-- `authenticated`, migración 2/4). Se llama SIEMPRE con service-role desde la
-- API route correspondiente — mismo patrón que `crearReservaPublica`/
-- `reservar_plaza`/`resolver_reserva_pendiente`: el guardia de autorización
-- vive DENTRO de la función (`if auth.uid() is not null and not <condición>
-- then raise exception`) para no depender de que el caller recuerde
-- comprobarlo, pero como el caller real es service-role, auth.uid() es NULL
-- ahí y el guardia queda como defensa en profundidad, no como el único
-- candado — el candado real es que esta RPC no es alcanzable con menos
-- privilegio que `authenticated` (ver grants al final).

CREATE OR REPLACE FUNCTION public.abrir_conversacion(
  p_studio_id text,
  p_tipo text,
  p_socio_id text DEFAULT NULL,
  p_instructor_id text DEFAULT NULL,
  p_ancla_sesion_id text DEFAULT NULL,
  p_ancla_reserva_id text DEFAULT NULL
)
 RETURNS TABLE(id text, creada boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
declare
  v_socio_auth uuid;
  v_instructor_auth uuid;
  v_id text;
begin
  perform public.validar_studio_mismatch(p_studio_id);

  if p_tipo not in ('ALUMNA_INSTRUCTORA', 'ALUMNA_MOSTRADOR', 'EQUIPO') then
    raise exception 'TIPO_INVALIDO';
  end if;

  if p_tipo = 'ALUMNA_INSTRUCTORA' then
    if p_socio_id is null or p_instructor_id is null then
      raise exception 'PARAMETROS_INCOMPLETOS';
    end if;

    perform public.validar_socio_del_studio(p_socio_id, p_studio_id);

    if not exists (
      select 1 from reservas r
      join sesiones s on s.id = r.sesion_id
     where r.socio_id = p_socio_id
       and s.instructor_id = p_instructor_id
       and r.studio_id = p_studio_id
       and r.estado in ('CONFIRMADA', 'ASISTIDA', 'NO_ASISTIO')
    ) then
      raise exception 'SIN_RELACION_VALIDA';
    end if;

    select auth_user_id into v_socio_auth from socios where id = p_socio_id;
    select auth_user_id into v_instructor_auth from instructores where id = p_instructor_id and studio_id = p_studio_id;

    if v_socio_auth is null or v_instructor_auth is null then
      raise exception 'PARTICIPANTE_SIN_CUENTA';
    end if;

    if auth.uid() is not null and auth.uid() not in (v_socio_auth, v_instructor_auth) then
      raise exception 'NO_AUTORIZADO';
    end if;

    select c.id into v_id
      from conversaciones c
     where c.studio_id = p_studio_id
       and c.tipo = 'ALUMNA_INSTRUCTORA'
       and exists (select 1 from conversacion_participantes cp where cp.conversacion_id = c.id and cp.auth_user_id = v_socio_auth)
       and exists (select 1 from conversacion_participantes cp where cp.conversacion_id = c.id and cp.auth_user_id = v_instructor_auth)
     limit 1;

    if v_id is not null then
      return query select v_id, false;
      return;
    end if;

    v_id := 'conv-' || gen_random_uuid()::text;
    insert into conversaciones (id, studio_id, tipo, ancla_sesion_id, ancla_reserva_id)
      values (v_id, p_studio_id, p_tipo, p_ancla_sesion_id, p_ancla_reserva_id);
    insert into conversacion_participantes (conversacion_id, auth_user_id, rol_en_conversacion, socio_id)
      values (v_id, v_socio_auth, 'SOCIO', p_socio_id),
             (v_id, v_instructor_auth, 'STAFF', null);

    return query select v_id, true;
    return;

  elsif p_tipo = 'ALUMNA_MOSTRADOR' then
    if p_socio_id is null then
      raise exception 'PARAMETROS_INCOMPLETOS';
    end if;

    perform public.validar_socio_del_studio(p_socio_id, p_studio_id);

    select auth_user_id into v_socio_auth from socios where id = p_socio_id;
    if v_socio_auth is null then
      raise exception 'PARTICIPANTE_SIN_CUENTA';
    end if;

    if auth.uid() is not null
       and auth.uid() is distinct from v_socio_auth
       and not public.puede_gestionar_calendario() then
      raise exception 'NO_AUTORIZADO';
    end if;

    select c.id into v_id
      from conversaciones c
     where c.studio_id = p_studio_id
       and c.tipo = 'ALUMNA_MOSTRADOR'
       and exists (select 1 from conversacion_participantes cp where cp.conversacion_id = c.id and cp.auth_user_id = v_socio_auth)
     limit 1;

    if v_id is not null then
      return query select v_id, false;
      return;
    end if;

    v_id := 'conv-' || gen_random_uuid()::text;
    insert into conversaciones (id, studio_id, tipo, ancla_sesion_id, ancla_reserva_id)
      values (v_id, p_studio_id, p_tipo, p_ancla_sesion_id, p_ancla_reserva_id);
    insert into conversacion_participantes (conversacion_id, auth_user_id, rol_en_conversacion, socio_id)
      values (v_id, v_socio_auth, 'SOCIO', p_socio_id);

    -- El mostrador se resuelve DINÁMICAMENTE, igual que EQUIPO: no se
    -- inserta ninguna fila STAFF aquí. Quien tenga
    -- `puede_gestionar_calendario()` (PROPIETARIO/MANAGER/RECEPCION) en este
    -- studio ve y escribe en CUALQUIER conversación ALUMNA_MOSTRADOR en todo
    -- momento (RLS, migración 2/4) — incluida la contratada después de
    -- abrirse el hilo, sin depender de una foto fija tomada al crearlo.
    -- Cambio de diseño explícito del usuario tras el primer borrador de esta
    -- migración, que sí guardaba un snapshot de STAFF (ver comentario que
    -- había al final del fichero, ya retirado).

    return query select v_id, true;
    return;

  else -- EQUIPO
    if auth.uid() is not null and p_studio_id is distinct from public.current_studio_id() then
      raise exception 'NO_AUTORIZADO';
    end if;

    select c.id into v_id
      from conversaciones c
     where c.studio_id = p_studio_id
       and c.tipo = 'EQUIPO'
     limit 1;

    if v_id is not null then
      return query select v_id, false;
      return;
    end if;

    v_id := 'conv-' || gen_random_uuid()::text;
    insert into conversaciones (id, studio_id, tipo)
      values (v_id, p_studio_id, p_tipo);
    -- Sin participantes: EQUIPO es studio-wide, la RLS ya lo trata así.

    return query select v_id, true;
    return;
  end if;
end;
$function$;

revoke execute on function public.abrir_conversacion(text, text, text, text, text, text) from public;
revoke execute on function public.abrir_conversacion(text, text, text, text, text, text) from anon;
grant execute on function public.abrir_conversacion(text, text, text, text, text, text) to authenticated, service_role;

-- ALUMNA_MOSTRADOR ya no guarda snapshot de STAFF en
-- `conversacion_participantes` (cambio de diseño sobre el borrador
-- original): se resuelve dinámicamente vía `puede_gestionar_calendario()`
-- en la RLS, exactamente igual que EQUIPO. Coherente con que esta migración
-- no añade policy de INSERT propia para `conversacion_participantes` desde
-- `authenticated` — el único camino de escritura sigue siendo esta RPC.
