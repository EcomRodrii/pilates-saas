-- Auditoría 2026-09-16 (RES-2): la cabecera de
-- `20260907152834_cierre_bloquea_plazas_fijas_y_lista_espera.sql` afirmaba que
-- `resolver_reserva_pendiente` ya respetaba `fecha_en_cierre` — no era
-- cierto. Con `requiere_aprobacion` activo, una petición creada ANTES del
-- cierre se podía aprobar DESPUÉS: quedaba CONFIRMADA, consumía bono y
-- avisaba a la socia de una clase que el estudio ya dijo que no da.
--
-- Mismo criterio que `reservar_plaza`, pero el desenlace es distinto a
-- propósito: aquí la petición NO se cancela sola (a diferencia del caso "la
-- clase ya empezó", unos renglones más abajo) — se deja PENDIENTE, la misma
-- rama que ya usa LIMITE_SEMANAL, porque un cierre puede ser un error de
-- tecleo que se corrija, y `resolverReservaPendiente`
-- (lib/db/supabase-data-admin.ts) ya sabe tratar ese "sigue pendiente,
-- decide tú" sin perder nada. Verificado en vivo con execute_sql+ROLLBACK en
-- los dos sentidos: bloquea con el día cerrado, aprueba igual que siempre sin
-- cierre. Misma firma (3 args) — sin cambio de grants.
create or replace function public.resolver_reserva_pendiente(p_studio_id text, p_reserva_id text, p_aprobar boolean)
 returns table(estado text, posicion_espera integer)
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
#variable_conflict use_column
declare
  v_sesion_id text;
  v_socio_id text;
  v_inicio timestamptz;
  v_tipo_clase_id text;
  v_aforo int;
  v_ocupadas int;
  v_espera int;
  v_estado text;
  v_pos int;
  v_limite int;
  v_plan_limite text;
  v_semana int;
  v_recup text;
  v_semana_ini timestamptz;
  v_limite_tipo int;
  v_semana_tipo int;
  v_excede_total boolean := false;
  v_excede_tipo boolean := false;
begin
  perform public.validar_studio_mismatch(p_studio_id);

  if not public.es_llamada_servicio() and not public.puede_gestionar_calendario() then
    raise exception 'NO_AUTORIZADO';
  end if;

  select sesion_id, socio_id into v_sesion_id, v_socio_id
    from reservas
   where id = p_reserva_id and studio_id = p_studio_id and estado = 'PENDIENTE_APROBACION'
   for update;
  if not found then
    raise exception 'NO_ENCONTRADA_O_YA_RESUELTA';
  end if;

  select inicio, tipo_clase_id into v_inicio, v_tipo_clase_id
    from sesiones where id = v_sesion_id for update;

  -- RES-2: si el día se cerró después de crear esta petición, no se aprueba.
  if public.fecha_en_cierre(p_studio_id, (v_inicio at time zone 'Europe/Madrid')::date) then
    raise exception 'ESTUDIO_CERRADO';
  end if;

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

  if v_estado = 'CONFIRMADA' then
    v_semana_ini := date_trunc('week', v_inicio at time zone 'Europe/Madrid') at time zone 'Europe/Madrid';

    select p.id, p.limite_semanal into v_plan_limite, v_limite
      from suscripciones s
      join planes_tarifa p on p.id = s.plan_id
     where s.studio_id = p_studio_id and s.socio_id = v_socio_id and s.estado = 'ACTIVA'
       and p.limite_semanal is not null
       and (s.fecha_fin is null or s.fecha_fin >= current_date)
       and public.plan_cubre_tipo_clase(p.id, v_tipo_clase_id)
     order by p.limite_semanal asc
     limit 1;
    if v_limite is not null then
      select count(*) into v_semana
        from reservas r
        join sesiones ss on ss.id = r.sesion_id
       where r.socio_id = v_socio_id and r.studio_id = p_studio_id
         and r.estado in ('CONFIRMADA', 'ASISTIDA')
         and coalesce(ss.cancelada, false) = false
         and ss.inicio >= v_semana_ini
         and ss.inicio <  v_semana_ini + interval '7 days'
         and public.plan_cubre_tipo_clase(v_plan_limite, ss.tipo_clase_id);
      if v_semana >= v_limite then
        v_excede_total := true;
      end if;
    end if;

    if v_tipo_clase_id is not null then
      select pt.limite_semanal into v_limite_tipo
        from suscripciones s
        join plan_tipos_clase pt
          on pt.plan_id = s.plan_id and pt.studio_id = s.studio_id
       where s.studio_id = p_studio_id and s.socio_id = v_socio_id and s.estado = 'ACTIVA'
         and pt.tipo_clase_id = v_tipo_clase_id
         and pt.limite_semanal is not null
         and (s.fecha_fin is null or s.fecha_fin >= current_date)
       order by pt.limite_semanal asc
       limit 1;

      if v_limite_tipo is not null then
        select count(*) into v_semana_tipo
          from reservas r
          join sesiones ss on ss.id = r.sesion_id
         where r.socio_id = v_socio_id and r.studio_id = p_studio_id
           and r.estado in ('CONFIRMADA', 'ASISTIDA')
           and coalesce(ss.cancelada, false) = false
           and ss.tipo_clase_id = v_tipo_clase_id
           and ss.inicio >= v_semana_ini
           and ss.inicio <  v_semana_ini + interval '7 days';
        if v_semana_tipo >= v_limite_tipo then
          v_excede_tipo := true;
        end if;
      end if;
    end if;

    if v_excede_total or v_excede_tipo then
      select id into v_recup
        from recuperaciones
       where socio_id = v_socio_id and studio_id = p_studio_id
         and estado = 'DISPONIBLE' and caduca_el >= current_date
       order by caduca_el asc
       limit 1
       for update;
      if v_recup is null then
        if v_excede_tipo then
          raise exception 'LIMITE_SEMANAL_ACTIVIDAD';
        else
          raise exception 'LIMITE_SEMANAL';
        end if;
      end if;
      update recuperaciones
         set estado = 'USADA', usada_en_reserva_id = p_reserva_id
       where id = v_recup;
    end if;
  end if;

  update reservas set estado = v_estado, posicion_espera = v_pos where id = p_reserva_id;
  return query select v_estado, v_pos;
end;
$function$;

-- Declarado por escrito (guardián de contrato RGPD/seguridad,
-- lib/rgpd-grants-anon-guardias-contrato.test.ts): esta función es
-- SECURITY DEFINER, y `anon` no la ha alcanzado nunca (verificado con
-- has_function_privilege antes y después). No cambia nada real, solo lo deja
-- escrito en la misma migración que toca la función.
revoke execute on function public.resolver_reserva_pendiente(text, text, boolean) from anon;
