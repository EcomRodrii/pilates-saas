-- Cuota combinada: «2 de Máquina + 1 de Gyrotonic» como UN producto.
--
-- Con dos planes acotados ya funcionaba desde 20260905143242. Lo que no se
-- podía era venderlo como una sola cuota: un precio, un cobro, una renovación.
-- Y así es como lo vende un estudio de verdad —«Cuota combinada, 65 €/mes»—,
-- no como dos suscripciones que la socia ve por separado y que hay que dar de
-- baja a la vez para que no quede media viva.
--
-- Faltaba una sola cosa: `plan_tipos_clase` (0111) decía QUÉ cubre un plan y no
-- CUÁNTO de cada cosa. `planes_tarifa.limite_semanal` es un entero para todo el
-- plan, así que «3 a la semana» dejaba hacer 3 de Gyrotonic y 0 de Máquina.
--
-- Los dos límites conviven y significan cosas distintas:
--   · `planes_tarifa.limite_semanal`      → techo TOTAL de la cuota (3)
--   · `plan_tipos_clase.limite_semanal`   → techo de esa actividad (2 y 1)
-- Cualquiera de los dos puede ir a null. Con los dos puestos se comprueban los
-- dos, que es justo lo que hace falta para que «2+1» no sea «3 de lo que sea».
--
-- Puramente aditivo: `plan_tipos_clase` tiene CERO filas en producción
-- (comprobado antes de escribir esto), así que no hay nada que migrar y ningún
-- estudio cambia de comportamiento.

alter table public.plan_tipos_clase
  add column if not exists limite_semanal integer;

-- Un 0 no es un límite, es «cubierto pero nunca reservable»: eso se expresa no
-- poniendo la fila.
alter table public.plan_tipos_clase
  drop constraint if exists plan_tipos_clase_limite_positivo;
alter table public.plan_tipos_clase
  add constraint plan_tipos_clase_limite_positivo
  check (limite_semanal is null or limite_semanal > 0);

comment on column public.plan_tipos_clase.limite_semanal is
  'Máximo de sesiones de ESTE tipo por semana ISO dentro del plan. NULL = sin sublímite (solo manda planes_tarifa.limite_semanal). Se aplica en reservar_plaza.';

-- ⚠️ MISMA FIRMA (8 argumentos), a propósito: es lo que deja que
-- `create or replace` conserve los grants ya endurecidos. Añadirle un parámetro
-- crearía un objeto NUEVO con EXECUTE por defecto a PUBLIC y habría que rehacer
-- el REVOKE/GRANT — el tropiezo que este repo ya lleva varias veces.
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
  v_limite int;
  v_plan_limite text;
  v_semana int;
  v_recup text;
  v_semana_ini timestamptz;
  v_spot_sala_id text;
  v_spot_activo boolean;
  v_spot_ocupado text;
  v_solapa int;
  v_bloquea_impago boolean;
  v_limite_tipo int;
  v_semana_tipo int;
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

  -- Cierre del centro. Va junto al gate de impago y por el mismo motivo: si no
  -- se puede reservar, mejor saberlo antes de contar aforo o tocar un bono.
  --
  -- No se salta para el staff. Un impago es discutible en mostrador —por eso
  -- ahí sí se deja pasar—, pero un día cerrado no: el estudio no abre, y
  -- apuntar a alguien a una clase que no va a existir no ayuda a nadie. Si de
  -- verdad se abre ese día, se quita el cierre y ya.
  if public.fecha_en_cierre(p_studio_id, (v_inicio at time zone 'Europe/Madrid')::date) then
    raise exception 'ESTUDIO_CERRADO';
  end if;

  -- Impago. Va aquí arriba, antes de contar aforo o consumir nada: si no
  -- puede reservar, que no se haya movido ya media máquina.
  if not p_saltar_gate_impago and public.current_rol() is null then
    select coalesce(st.bloquear_reserva_impago, false) into v_bloquea_impago
      from studios st where st.id = p_studio_id;
    if v_bloquea_impago and public.socio_tiene_impago(p_studio_id, p_socio_id) then
      raise exception 'RESERVA_BLOQUEADA_IMPAGO';
    end if;
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
    v_semana_ini := date_trunc('week', v_inicio at time zone 'Europe/Madrid') at time zone 'Europe/Madrid';

    -- ── Techo TOTAL de la cuota (sin cambios desde 20260905143242) ──────────
    -- (1) El límite se elige solo entre los planes que CUBREN esta clase.
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
      -- (2) Y se cuenta solo lo que consume ESE plan.
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

    -- ── Techo de ESTA actividad dentro de la cuota (nuevo) ──────────────────
    -- Deliberadamente independiente del bloque de arriba: una cuota combinada
    -- puede tener sublímites y NO tener techo total (2 de Máquina + 1 de
    -- Gyrotonic, sin un «3» escrito en ningún sitio). Colgarlo del plan elegido
    -- arriba lo dejaría muerto en ese caso, que es el caso normal.
    if v_tipo_clase_id is not null then
      select pt.limite_semanal into v_limite_tipo
        from suscripciones s
        join plan_tipos_clase pt
          on pt.plan_id = s.plan_id and pt.studio_id = s.studio_id
       where s.studio_id = p_studio_id and s.socio_id = p_socio_id and s.estado = 'ACTIVA'
         and pt.tipo_clase_id = v_tipo_clase_id
         and pt.limite_semanal is not null
         and (s.fecha_fin is null or s.fecha_fin >= current_date)
       order by pt.limite_semanal asc   -- el más restrictivo si tuviera varias cuotas
       limit 1;

      if v_limite_tipo is not null then
        -- Aquí se cuenta por TIPO DE CLASE, no por cobertura de plan: el
        -- sublímite es de la actividad, y da igual qué cuota la pagara.
        select count(*) into v_semana_tipo
          from reservas r
          join sesiones ss on ss.id = r.sesion_id
         where r.socio_id = p_socio_id and r.studio_id = p_studio_id
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

    -- ⚠️ UNA sola recuperación aunque se pasen los DOS techos. Comprobarlos por
    -- separado y gastar una en cada bloque le cobraría dos por una clase.
    if v_excede_total or v_excede_tipo then
      select id into v_recup
        from recuperaciones
       where socio_id = p_socio_id and studio_id = p_studio_id
         and estado = 'DISPONIBLE' and caduca_el >= current_date
       order by caduca_el asc
       limit 1
       for update;
      if v_recup is null then
        -- El motivo concreto primero: «ya has hecho tus 2 de Máquina» se
        -- entiende y «has llegado a tu tope» no, cuando además te quedan clases
        -- de la otra actividad.
        if v_excede_tipo then
          raise exception 'LIMITE_SEMANAL_ACTIVIDAD';
        else
          raise exception 'LIMITE_SEMANAL';
        end if;
      end if;
      -- ⚠️ Una recuperación NO está atada a una actividad (`recuperaciones` no
      -- guarda tipo de clase), así que sirve para saltarse cualquiera de los dos
      -- techos. Es deliberado y no rompe nada: el aforo se comprueba aparte y
      -- sigue protegiendo la sala. Si algún día se quiere recuperación por
      -- actividad, es una columna nueva y una decisión de producto, no un
      -- retoque de aquí.
      update recuperaciones
         set estado = 'USADA', usada_en_reserva_id = p_reserva_id
       where id = v_recup;
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
