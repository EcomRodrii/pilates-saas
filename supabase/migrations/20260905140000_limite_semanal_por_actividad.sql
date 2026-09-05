-- El límite semanal se contaba mal en cuanto una socia tenía DOS planes.
--
-- Caso real (Studio Pilates Muévete, Almería): «2 de Máquina + 1 de Gyrotonic
-- por semana». Se representa con dos planes acotados por tipo de clase, que es
-- justo para lo que existe `plan_tipos_clase` (0111). Pero `reservar_plaza`
-- ignoraba esa tabla en los DOS sitios donde importa:
--
--   1. Elegía el límite con `order by limite_semanal asc limit 1` — el MÁS
--      PEQUEÑO de todos los planes activos, cubriera o no la clase que se está
--      reservando. Con 2 y 1, salía 1.
--   2. Contaba TODAS las reservas de la semana, de cualquier tipo de clase.
--
-- Resultado: 1 clase por semana en total en vez de 2+1. La regla que la
-- propietaria configuró y la que el programa aplicaba no eran la misma, y no
-- había forma de notarlo salvo probándolo.
--
-- Hoy no afecta a nadie en producción (1 plan con límite, 0 filas en
-- `plan_tipos_clase`, 0 socias con dos planes limitados) — es un bug latente,
-- no una incidencia abierta. Para ese caso único el comportamiento no cambia:
-- un plan sin acotar sigue cubriendo todas las clases y contando todo.

-- La cobertura plan → tipo de clase, con la MISMA semántica que su gemela en
-- TypeScript (`planCubreTipoClase`, lib/bono-logic.ts) para que una divergencia
-- futura salte a la vista por el nombre.
--
-- SECURITY INVOKER a propósito: no necesita saltarse ninguna RLS. Se la salta
-- ya quien la llama (`reservar_plaza` es SECURITY DEFINER), y si alguien la
-- invoca suelta, lee `plan_tipos_clase` con SUS permisos, no con los de nadie
-- más. Por eso aquí no aplica el endurecimiento de grants habitual.
create or replace function public.plan_cubre_tipo_clase(p_plan_id text, p_tipo_clase_id text)
returns boolean
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  select
    -- Sin filas en `plan_tipos_clase`, el plan cubre TODAS las clases.
    not exists (select 1 from plan_tipos_clase pt where pt.plan_id = p_plan_id)
    -- Sin clase concreta delante no se puede descartar una cobertura que aún no
    -- sabemos si aplica: se responde por el plan, no por la clase.
    or p_tipo_clase_id is null
    or exists (
      select 1 from plan_tipos_clase pt
       where pt.plan_id = p_plan_id and pt.tipo_clase_id = p_tipo_clase_id
    );
$$;

comment on function public.plan_cubre_tipo_clase(text, text) is
  'Si un plan cubre un tipo de clase. Sin filas en plan_tipos_clase = cubre todas; sin tipo de clase = se responde por el plan. Gemela de planCubreTipoClase (lib/bono-logic.ts).';

-- ⚠️ Se reescribe con la MISMA firma (7 argumentos). Eso importa: es lo que
-- deja que `create or replace` conserve los grants ya endurecidos. Si algún día
-- se le añade un parámetro, Postgres crea un objeto NUEVO con `EXECUTE` por
-- defecto a PUBLIC y hay que rehacer el REVOKE/GRANT — el tropiezo que este
-- repo ya lleva tres veces.
create or replace function public.reservar_plaza(
  p_studio_id text, p_sesion_id text, p_socio_id text, p_reserva_id text,
  p_permite_lista_espera boolean default true,
  p_requiere_aprobacion boolean default false,
  p_spot_id text default null
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
  v_limite int;
  v_plan_limite text;
  v_semana int;
  v_recup text;
  v_semana_ini timestamptz;
  v_spot_sala_id text;
  v_spot_activo boolean;
  v_spot_ocupado text;
  v_solapa int;
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

  if auth.uid() is not null and public.current_rol() = 'INSTRUCTOR' then
    if v_instructor_id is distinct from public.current_instructor_id() then
      raise exception 'NO_AUTORIZADO';
    end if;
  end if;

  -- Autorización por tipo de clase (niveles). Solo mira la lista si el tipo
  -- tiene la regla encendida: un estudio que no la use no paga ni una consulta
  -- de más en el camino caliente de reservar.
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
    select count(*) into v_solapa
      from reservas r
      join sesiones ssol on ssol.id = r.sesion_id
     where r.socio_id = p_socio_id
       and r.studio_id = p_studio_id
       and r.estado in ('CONFIRMADA', 'ASISTIDA', 'PENDIENTE_APROBACION')
       and r.sesion_id is distinct from p_sesion_id
       and coalesce(ssol.cancelada, false) = false
       and ssol.inicio is not null and ssol.fin is not null
       and tstzrange(ssol.inicio, ssol.fin) && tstzrange(v_inicio, v_fin);
    if v_solapa > 0 then
      raise exception 'CONFLICTO_HORARIO';
    end if;

    select count(*) into v_solapa
      from citas c
     where c.socio_id = p_socio_id
       and c.studio_id = p_studio_id
       and c.estado in ('PENDIENTE', 'CONFIRMADA')
       and c.inicio is not null and c.fin is not null
       and tstzrange(c.inicio, c.fin) && tstzrange(v_inicio, v_fin);
    if v_solapa > 0 then
      raise exception 'CONFLICTO_HORARIO';
    end if;
  end if;

  if v_estado = 'CONFIRMADA' then
    -- ⚠️ AQUÍ ESTABA EL BUG, y son dos, no uno.
    --
    -- (1) El límite se elige solo entre los planes que CUBREN esta clase. Antes
    --     cogía el más pequeño de todos los activos, cubriera o no la clase que
    --     se estaba reservando.
    select p.id, p.limite_semanal into v_plan_limite, v_limite
      from suscripciones s
      join planes_tarifa p on p.id = s.plan_id
     where s.studio_id = p_studio_id and s.socio_id = p_socio_id and s.estado = 'ACTIVA'
       and p.limite_semanal is not null
       and (s.fecha_fin is null or s.fecha_fin >= current_date)
       and public.plan_cubre_tipo_clase(p.id, v_tipo_clase_id)
     order by p.limite_semanal asc
     limit 1;
    if v_limite is not null then
      v_semana_ini := date_trunc('week', v_inicio at time zone 'Europe/Madrid') at time zone 'Europe/Madrid';
      -- (2) Y se cuenta solo lo que consume ESE plan. Antes contaba todas las
      --     reservas de la semana, de cualquier actividad, contra un límite que
      --     era de otra.
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
        select id into v_recup
          from recuperaciones
         where socio_id = p_socio_id and studio_id = p_studio_id
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

  insert into reservas (id, studio_id, sesion_id, socio_id, estado, spot_id, posicion_espera, check_in_en, creado_en)
    values (
      p_reserva_id, p_studio_id, p_sesion_id, p_socio_id, v_estado,
      case when v_estado = 'CONFIRMADA' then p_spot_id else null end,
      v_pos, null, now()
    );

  return query select v_estado, v_pos;
end;
$function$;
