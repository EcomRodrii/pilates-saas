-- RES-1 (auditoría 2026-09-16): la lista de espera era una puerta trasera al
-- límite semanal del plan y al anti-solape horario. En `reservar_plaza` las
-- dos reglas —límite semanal (total y por tipo de clase) y anti-solape
-- horario (contra otras reservas y contra citas)— solo se comprobaban al
-- CONFIRMAR una reserva directa. Este fichero extrae esa lógica a dos
-- helpers SQL reutilizables (mismo patrón `*_usa_helpers` ya usado en el
-- repo), que también consume la migración hermana
-- `20260917094718_res1_lista_espera_resolver_pendiente_y_aceptar_oferta.sql`
-- (el resto de la cadena: `resolver_reserva_pendiente`,
-- `promocionar_siguiente_espera`, `aceptar_oferta_lista_espera`).
--
-- ⚠️ Por qué en un fichero APARTE y no todo junto: dos guardianes propios de
-- este repo escanean el TEXTO COMPLETO de la migración que define
-- `reservar_plaza` para verificar sus `raise exception` —
-- `lib/reservas/errores-rpc.test.ts` (desde donde empieza `function
-- public.reservar_plaza` hasta el final del fichero) y
-- `lib/student/cadena-rechazo-reserva.test.ts` (el fichero entero, sin
-- acotar). Si `resolver_reserva_pendiente`/`aceptar_oferta_lista_espera`
-- vivieran en el MISMO fichero, sus propios `raise exception` (`NO_ENCONTRADA_
-- O_YA_RESUELTA`, `OFERTA_CADUCADA`...) se colarían como si fueran de
-- `reservar_plaza`, y los dos guardianes exigirían traducirlos en el lado
-- equivocado (`lib/reservas/errores-rpc.ts`/`crearReservaPublica`, que no son
-- quienes llaman a esas otras dos RPC).
--
-- Los dos helpers son SECURITY INVOKER (no exponen nada nuevo a
-- anon/authenticated: solo leen y, el segundo, escribe sobre una fila ya
-- perteneciente al propio socio que llama, protegida por el `for update` de
-- quien invoca):
--   · `calcular_excede_limite_semanal`: el bloque de límite semanal (total +
--     por tipo de clase), sin la parte de recuperación.
--   · `intentar_consumir_recuperacion_semanal`: intenta gastar una
--     recuperación DISPONIBLE; `true` si lo consigue.
--   · `socio_tiene_conflicto_horario`: el anti-solape contra `reservas` y
--     contra `citas`.
--
-- `reservar_plaza` queda refactorizada para llamar a estos helpers:
-- comportamiento observable IDÉNTICO al de antes (verificado en vivo con
-- execute_sql+ROLLBACK, mismos códigos `LIMITE_SEMANAL`/
-- `LIMITE_SEMANAL_ACTIVIDAD`/`CONFLICTO_HORARIO` con `raise exception`
-- literal en su propio cuerpo). Sin cambio de firma → grants verificados sin
-- cambios con has_function_privilege antes/después.
--
-- De paso, pierde un `auth.uid() is not null` redundante delante de
-- `current_rol() = 'INSTRUCTOR'`: `current_rol()` ya usa `auth.uid()` en su
-- propio WHERE, así que sin sesión devuelve NULL por construcción — `NULL =
-- 'INSTRUCTOR'` es NULL, y `if NULL then` es `false` en PL/pgSQL.
-- Comportamiento idéntico, verificado en vivo, y necesario además para el
-- guardián `lib/rgpd-grants-anon-guardias-contrato.test.ts` ("ninguna guardia
-- lee «uid nulo» como servidor"): no es que este uso leyera mal el nulo
-- (comprueba lo contrario, que SÍ hay sesión), pero el guardián no distingue
-- el matiz y pide no tocar `auth.uid()` a pelo en ninguna forma.
--
-- `anon` no ha tenido nunca EXECUTE en `reservar_plaza` — verificado con
-- has_function_privilege antes y después: la declaración del final es
-- documentación, no un endurecimiento.

create or replace function public.calcular_excede_limite_semanal(p_studio_id text, p_socio_id text, p_tipo_clase_id text, p_inicio timestamp with time zone)
 returns table(excede_total boolean, excede_tipo boolean)
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_limite int;
  v_plan_limite text;
  v_semana int;
  v_semana_ini timestamptz;
  v_limite_tipo int;
  v_semana_tipo int;
  v_excede_total boolean := false;
  v_excede_tipo boolean := false;
begin
  v_semana_ini := date_trunc('week', p_inicio at time zone 'Europe/Madrid') at time zone 'Europe/Madrid';

  select p.id, p.limite_semanal into v_plan_limite, v_limite
    from suscripciones s
    join planes_tarifa p on p.id = s.plan_id
   where s.studio_id = p_studio_id and s.socio_id = p_socio_id and s.estado = 'ACTIVA'
     and p.limite_semanal is not null
     and (s.fecha_fin is null or s.fecha_fin >= current_date)
     and public.plan_cubre_tipo_clase(p.id, p_tipo_clase_id)
   order by p.limite_semanal asc
   limit 1;
  if v_limite is not null then
    select count(*) into v_semana
      from reservas r
      join sesiones ss on ss.id = r.sesion_id
     where r.socio_id = p_socio_id and r.studio_id = p_studio_id
       and r.estado in ('CONFIRMADA', 'ASISTIDA')
       and coalesce(ss.cancelada, false) = false
       and ss.inicio >= v_semana_ini
       and ss.inicio <  v_semana_ini + interval '7 days'
       and public.plan_cubre_tipo_clase(v_plan_limite, ss.tipo_clase_id);
    if v_semana >= v_limite then
      v_excede_total := true;
    end if;
  end if;

  if p_tipo_clase_id is not null then
    select pt.limite_semanal into v_limite_tipo
      from suscripciones s
      join plan_tipos_clase pt
        on pt.plan_id = s.plan_id and pt.studio_id = s.studio_id
     where s.studio_id = p_studio_id and s.socio_id = p_socio_id and s.estado = 'ACTIVA'
       and pt.tipo_clase_id = p_tipo_clase_id
       and pt.limite_semanal is not null
       and (s.fecha_fin is null or s.fecha_fin >= current_date)
     order by pt.limite_semanal asc
     limit 1;

    if v_limite_tipo is not null then
      select count(*) into v_semana_tipo
        from reservas r
        join sesiones ss on ss.id = r.sesion_id
       where r.socio_id = p_socio_id and r.studio_id = p_studio_id
         and r.estado in ('CONFIRMADA', 'ASISTIDA')
         and coalesce(ss.cancelada, false) = false
         and ss.tipo_clase_id = p_tipo_clase_id
         and ss.inicio >= v_semana_ini
         and ss.inicio <  v_semana_ini + interval '7 days';
      if v_semana_tipo >= v_limite_tipo then
        v_excede_tipo := true;
      end if;
    end if;
  end if;

  return query select v_excede_total, v_excede_tipo;
end;
$function$;

create or replace function public.intentar_consumir_recuperacion_semanal(p_studio_id text, p_socio_id text, p_reserva_id text)
 returns boolean
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
declare v_recup text;
begin
  select id into v_recup
    from recuperaciones
   where socio_id = p_socio_id and studio_id = p_studio_id
     and estado = 'DISPONIBLE' and caduca_el >= current_date
   order by caduca_el asc
   limit 1
   for update;
  if v_recup is null then
    return false;
  end if;
  update recuperaciones
     set estado = 'USADA', usada_en_reserva_id = p_reserva_id
   where id = v_recup;
  return true;
end;
$function$;

create or replace function public.socio_tiene_conflicto_horario(p_studio_id text, p_socio_id text, p_sesion_id text, p_inicio timestamp with time zone, p_fin timestamp with time zone)
 returns boolean
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
declare v_solapa int;
begin
  if p_inicio is null or p_fin is null then
    return false;
  end if;

  select count(*) into v_solapa
    from reservas r
    join sesiones ssol on ssol.id = r.sesion_id
   where r.socio_id = p_socio_id
     and r.studio_id = p_studio_id
     and r.estado in ('CONFIRMADA', 'ASISTIDA', 'PENDIENTE_APROBACION')
     and r.sesion_id is distinct from p_sesion_id
     and coalesce(ssol.cancelada, false) = false
     and ssol.inicio is not null and ssol.fin is not null
     and tstzrange(ssol.inicio, ssol.fin) && tstzrange(p_inicio, p_fin);
  if v_solapa > 0 then
    return true;
  end if;

  select count(*) into v_solapa
    from citas c
   where c.socio_id = p_socio_id
     and c.studio_id = p_studio_id
     and c.estado in ('PENDIENTE', 'CONFIRMADA')
     and c.inicio is not null and c.fin is not null
     and tstzrange(c.inicio, c.fin) && tstzrange(p_inicio, p_fin);
  return v_solapa > 0;
end;
$function$;

create or replace function public.reservar_plaza(
  p_studio_id text, p_sesion_id text, p_socio_id text, p_reserva_id text,
  p_permite_lista_espera boolean default true,
  p_requiere_aprobacion boolean default false,
  p_spot_id text default null,
  p_saltar_gate_impago boolean default false
)
returns table(estado text, posicion_espera integer)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
#variable_conflict use_column
declare
  v_inicio timestamptz;
  v_fin timestamptz;
  v_sala_id text;
  v_instructor_id text;
  v_tipo_clase_id text;
  v_requiere_autorizacion boolean;
  v_aforo int;
  v_ocupadas int;
  v_espera int;
  v_estado text;
  v_pos int;
  v_spot_sala_id text;
  v_spot_activo boolean;
  v_spot_ocupado text;
  v_bloquea_impago boolean;
  v_excede_total boolean := false;
  v_excede_tipo boolean := false;
begin
  perform public.validar_studio_mismatch(p_studio_id);
  perform public.validar_socio_del_studio(p_socio_id, p_studio_id);

  perform pg_advisory_xact_lock(hashtext(p_studio_id || ':' || p_socio_id));

  select inicio, fin, instructor_id, sala_id, tipo_clase_id
    into v_inicio, v_fin, v_instructor_id, v_sala_id, v_tipo_clase_id
    from sesiones where id = p_sesion_id and studio_id = p_studio_id
    for update;
  if not found then
    raise exception 'SESION_NO_ENCONTRADA';
  end if;

  if public.fecha_en_cierre(p_studio_id, (v_inicio at time zone 'Europe/Madrid')::date) then
    raise exception 'ESTUDIO_CERRADO';
  end if;

  if not p_saltar_gate_impago and public.current_rol() is null then
    select coalesce(st.bloquear_reserva_impago, false) into v_bloquea_impago
      from studios st where st.id = p_studio_id;
    if v_bloquea_impago and public.socio_tiene_impago(p_studio_id, p_socio_id) then
      raise exception 'RESERVA_BLOQUEADA_IMPAGO';
    end if;
  end if;

  if public.current_rol() = 'INSTRUCTOR' then
    if v_instructor_id is distinct from public.current_instructor_id() then
      raise exception 'NO_AUTORIZADO';
    end if;
  end if;

  if v_tipo_clase_id is not null then
    select tc.requiere_autorizacion into v_requiere_autorizacion
      from tipos_clase tc
     where tc.id = v_tipo_clase_id and tc.studio_id = p_studio_id;

    if coalesce(v_requiere_autorizacion, false) and not exists (
      select 1 from socio_tipos_clase_autorizados a
       where a.socio_id = p_socio_id
         and a.tipo_clase_id = v_tipo_clase_id
         and a.studio_id = p_studio_id
    ) then
      raise exception 'NECESITA_AUTORIZACION';
    end if;
  end if;

  if exists (
    select 1 from reservas
    where sesion_id = p_sesion_id and socio_id = p_socio_id
      and estado in ('CONFIRMADA', 'LISTA_ESPERA', 'ASISTIDA', 'PENDIENTE_APROBACION')
  ) then
    raise exception 'YA_RESERVADA';
  end if;

  if p_spot_id is not null then
    select sp.sala_id, coalesce(sp.activo, true) into v_spot_sala_id, v_spot_activo
      from spots sp
      where sp.id = p_spot_id and sp.studio_id = p_studio_id
      for update;
    if not found or v_spot_sala_id is distinct from v_sala_id then
      raise exception 'SPOT_NO_PERTENECE_A_LA_SALA';
    end if;
    if not v_spot_activo then
      raise exception 'SPOT_NO_DISPONIBLE';
    end if;

    select r.id into v_spot_ocupado
      from reservas r
      where r.sesion_id = p_sesion_id and r.spot_id = p_spot_id
        and r.estado in ('CONFIRMADA', 'ASISTIDA')
      for update;
    if v_spot_ocupado is not null then
      raise exception 'SPOT_OCUPADO';
    end if;
  end if;

  if p_requiere_aprobacion then
    v_estado := 'PENDIENTE_APROBACION';
    v_pos := null;
  else
    v_aforo := aforo_efectivo(p_sesion_id);

    select count(*) into v_ocupadas
      from reservas
      where sesion_id = p_sesion_id and estado in ('CONFIRMADA', 'ASISTIDA');

    if v_aforo is null or v_ocupadas < v_aforo then
      v_estado := 'CONFIRMADA';
      v_pos := null;
    else
      if not p_permite_lista_espera then
        raise exception 'AFORO_LLENO_SIN_ESPERA';
      end if;
      select count(*) into v_espera
        from reservas where sesion_id = p_sesion_id and estado = 'LISTA_ESPERA';
      v_estado := 'LISTA_ESPERA';
      v_pos := v_espera + 1;
    end if;
  end if;

  if v_estado in ('CONFIRMADA', 'PENDIENTE_APROBACION') and v_inicio is not null and v_fin is not null then
    if public.socio_tiene_conflicto_horario(p_studio_id, p_socio_id, p_sesion_id, v_inicio, v_fin) then
      raise exception 'CONFLICTO_HORARIO';
    end if;
  end if;

  if v_estado = 'CONFIRMADA' then
    select ce.excede_total, ce.excede_tipo into v_excede_total, v_excede_tipo
      from public.calcular_excede_limite_semanal(p_studio_id, p_socio_id, v_tipo_clase_id, v_inicio) ce;

    if v_excede_total or v_excede_tipo then
      if not public.intentar_consumir_recuperacion_semanal(p_studio_id, p_socio_id, p_reserva_id) then
        if v_excede_tipo then
          raise exception 'LIMITE_SEMANAL_ACTIVIDAD';
        else
          raise exception 'LIMITE_SEMANAL';
        end if;
      end if;
    end if;
  end if;

  insert into reservas (id, studio_id, sesion_id, socio_id, estado, spot_id, posicion_espera, check_in_en, creado_en)
    values (
      p_reserva_id, p_studio_id, p_sesion_id, p_socio_id, v_estado,
      case when v_estado = 'CONFIRMADA' then p_spot_id else null end,
      v_pos, null, now()
    );

  return query select v_estado, v_pos;
end;
$function$;

revoke execute on function public.reservar_plaza(text, text, text, text, boolean, boolean, text, boolean) from anon;
