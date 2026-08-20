-- R-2 (auditoría 20-ago): la aprobación manual se saltaba el límite semanal.
--
-- `resolver_reserva_pendiente` validaba la guardia de inicio y el aforo, pero
-- NO el bloque de limite_semanal/recuperaciones que sí tiene `reservar_plaza`
-- — la cabecera de 20260730192445 prometía esa paridad y nunca estuvo. En un
-- tipo de clase con aprobación manual, un plan de «2 clases/semana» era
-- ilimitado: la reserva nace PENDIENTE_APROBACION sin consumir nada (correcto,
-- mismo criterio que LISTA_ESPERA) y la aprobación confirmaba sin mirar el
-- límite. Verificado en producción: hay un tipo de clase con
-- `requiere_aprobacion` activo — la feature está viva.
--
-- El bloque injertado es copia literal del de `reservar_plaza` VIGENTE EN
-- PRODUCCIÓN (pg_get_functiondef, no el fichero de migración — este repo tiene
-- historial de deriva), con `p_socio_id` → `v_socio_id`. Decisiones:
--
--  · Solo en la rama que CONFIRMA: caer a lista de espera no consume límite,
--    igual que allí. La reserva PENDIENTE_APROBACION no se cuenta a sí misma
--    (el conteo semanal solo mira CONFIRMADA/ASISTIDA).
--  · Sin recuperación disponible → `raise exception 'LIMITE_SEMANAL'`: la
--    aprobación falla, la excepción revierte y la reserva SE QUEDA
--    PENDIENTE_APROBACION — quien aprueba decide (liberar una clase de esa
--    semana, o rechazar), la RPC no cancela por su cuenta. El wrapper TS
--    (`resolverReservaPendiente`, lib/db/supabase-data-admin.ts) traduce el
--    error a un mensaje accionable.
--  · Con recuperación DISPONIBLE vigente, se consume (estado USADA +
--    usada_en_reserva_id), exactamente como una reserva normal por encima del
--    límite.
--
-- Firma SIN cambios (text,text,boolean) → CREATE OR REPLACE conserva los ACL
-- (anon=false, authenticated=true, service_role=true — el endurecimiento de
-- 20260730192616/20260730192657). No hay REVOKE/GRANT aquí a propósito;
-- verificado con has_function_privilege antes y después de aplicar.
--
-- Carrera conocida y HEREDADA, no ampliada: dos aprobaciones simultáneas de
-- clases DISTINTAS de la misma socia en la misma semana no se serializan entre
-- sí (bloquean filas de `sesiones` diferentes) — la misma exposición que ya
-- tiene `reservar_plaza` con dos reservas paralelas.
--
-- Verificado en vivo con execute_sql + ROLLBACK (5 asserts): bloqueo sin
-- recuperación, reserva intacta tras el bloqueo, consumo de recuperación al
-- aprobar, socia sin límite no afectada, y rechazo intacto.

create or replace function public.resolver_reserva_pendiente(
  p_studio_id text,
  p_reserva_id text,
  p_aprobar boolean
)
returns table(estado text, posicion_espera integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
#variable_conflict use_column
declare
  v_sesion_id text;
  v_socio_id text;
  v_inicio timestamptz;
  v_aforo int;
  v_ocupadas int;
  v_espera int;
  v_estado text;
  v_pos int;
  v_limite int;
  v_semana int;
  v_recup text;
  v_semana_ini timestamptz;
begin
  perform public.validar_studio_mismatch(p_studio_id);

  if auth.uid() is not null and not public.puede_gestionar_calendario() then
    raise exception 'NO_AUTORIZADO';
  end if;

  select sesion_id, socio_id into v_sesion_id, v_socio_id
    from reservas
   where id = p_reserva_id and studio_id = p_studio_id and estado = 'PENDIENTE_APROBACION'
   for update;
  if not found then
    raise exception 'NO_ENCONTRADA_O_YA_RESUELTA';
  end if;

  select inicio into v_inicio from sesiones where id = v_sesion_id for update;

  -- Guardia de inicio: sin importar p_aprobar, una clase ya empezada cancela
  -- en vez de aprobar. El caller detecta este caso comparando lo que pidió
  -- (aprobar=true) contra lo que volvió (CANCELADA) — no hace falta un motivo
  -- explícito aquí, es el único camino por el que aprobar puede cancelar.
  if v_inicio is null or v_inicio <= now() then
    update reservas set estado = 'CANCELADA' where id = p_reserva_id;
    return query select 'CANCELADA'::text, null::int;
    return;
  end if;

  if not p_aprobar then
    update reservas set estado = 'CANCELADA' where id = p_reserva_id;
    return query select 'CANCELADA'::text, null::int;
    return;
  end if;

  v_aforo := aforo_efectivo(v_sesion_id);
  select count(*) into v_ocupadas
    from reservas where sesion_id = v_sesion_id and estado in ('CONFIRMADA', 'ASISTIDA');

  if v_aforo is null or v_ocupadas < v_aforo then
    v_estado := 'CONFIRMADA';
    v_pos := null;
  else
    select count(*) into v_espera
      from reservas where sesion_id = v_sesion_id and estado = 'LISTA_ESPERA';
    v_estado := 'LISTA_ESPERA';
    v_pos := v_espera + 1;
  end if;

  -- R-2 (auditoría 20-ago): el MISMO bloque de límite semanal que
  -- reservar_plaza, que la cabecera de 20260730192445 prometía y nunca estuvo.
  -- Solo en la rama que CONFIRMA: caer a lista de espera no consume límite,
  -- igual que allí. Sin recuperación disponible → LIMITE_SEMANAL: la
  -- aprobación falla y la reserva SE QUEDA pendiente — quien aprueba decide,
  -- esta función no cancela por su cuenta.
  if v_estado = 'CONFIRMADA' then
    select p.limite_semanal into v_limite
      from suscripciones s
      join planes_tarifa p on p.id = s.plan_id
     where s.studio_id = p_studio_id and s.socio_id = v_socio_id and s.estado = 'ACTIVA'
       and p.limite_semanal is not null
       and (s.fecha_fin is null or s.fecha_fin >= current_date)
     order by p.limite_semanal asc
     limit 1;
    if v_limite is not null then
      v_semana_ini := date_trunc('week', v_inicio at time zone 'Europe/Madrid') at time zone 'Europe/Madrid';
      select count(*) into v_semana
        from reservas r
        join sesiones ss on ss.id = r.sesion_id
       where r.socio_id = v_socio_id and r.studio_id = p_studio_id
         and r.estado in ('CONFIRMADA', 'ASISTIDA')
         and ss.inicio >= v_semana_ini
         and ss.inicio <  v_semana_ini + interval '7 days';
      if v_semana >= v_limite then
        select id into v_recup
          from recuperaciones
         where socio_id = v_socio_id and studio_id = p_studio_id
           and estado = 'DISPONIBLE' and caduca_el >= current_date
         order by caduca_el asc
         limit 1
         for update;
        if v_recup is null then
          raise exception 'LIMITE_SEMANAL';
        end if;
        update recuperaciones
           set estado = 'USADA', usada_en_reserva_id = p_reserva_id
         where id = v_recup;
      end if;
    end if;
  end if;

  update reservas set estado = v_estado, posicion_espera = v_pos where id = p_reserva_id;
  return query select v_estado, v_pos;
end;
$function$;
