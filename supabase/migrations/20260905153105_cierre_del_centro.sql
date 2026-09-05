-- «Cierre del centro»: la semana de vacaciones, el puente, la reforma.
--
-- Hasta ahora esto no existía como concepto. Cerrar una semana era ir clase por
-- clase cancelándolas a mano, y aun así los bonos seguían corriendo: una socia
-- con un bono de un mes perdía una semana de vigencia por un cierre que no
-- decidió ella.
--
-- Un cierre hace CUATRO cosas, y las cuatro se decidieron a propósito:
--   1. Impide reservar en esas fechas.
--   2. Cancela las clases ya programadas y avisa.
--   3. Devuelve el bono a quien tuviera reserva — no perdió la sesión por su
--      decisión. Mismo criterio que la cancelación por mínimo de asistentes,
--      que es el otro caso donde cancela el estudio y no la socia.
--   4. Prorroga la caducidad de bonos y recuperaciones tantos días como dure
--      el cierre, para que no le coma vigencia a nadie.
--
-- Las tres últimas las ejecuta el servidor al guardar el cierre (reutilizando
-- lo que ya existe: `cancelarSesionPorMotivo` y `ampliar_caducidades`). La
-- primera vive aquí, porque es la única que tiene que seguir siendo cierta
-- para una sesión creada DESPUÉS de declarar el cierre.

create table if not exists public.cierres_estudio (
  id text primary key,
  studio_id text not null references public.studios(id) on delete cascade,
  desde date not null,
  -- Inclusivo: un cierre de un solo día tiene desde = hasta.
  hasta date not null,
  motivo text,
  creado_en timestamptz not null default now(),
  constraint cierres_estudio_rango_valido check (hasta >= desde)
);

create index if not exists idx_cierres_estudio_rango
  on public.cierres_estudio (studio_id, desde, hasta);

comment on table public.cierres_estudio is
  'Días en que el estudio no abre. Bloquea reservas nuevas; cancelar clases y prorrogar bonos lo hace el servidor al crearlo.';

alter table public.cierres_estudio enable row level security;

drop policy if exists cierres_lectura on public.cierres_estudio;
create policy cierres_lectura on public.cierres_estudio
  for select to authenticated
  using (studio_id = public.current_studio_id());

drop policy if exists cierres_escritura on public.cierres_estudio;
create policy cierres_escritura on public.cierres_estudio
  for all to authenticated
  using (studio_id = public.current_studio_id() and public.puede_gestionar_calendario())
  with check (studio_id = public.current_studio_id() and public.puede_gestionar_calendario());

-- Una fecha cae en cierre. En un sitio solo, para que la RPC y cualquier
-- pantalla futura respondan lo mismo.
create or replace function public.fecha_en_cierre(p_studio_id text, p_fecha date)
returns boolean
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  select exists (
    select 1 from cierres_estudio c
     where c.studio_id = p_studio_id
       and p_fecha between c.desde and c.hasta
  );
$$;

comment on function public.fecha_en_cierre(text, date) is
  'Si esa fecha cae dentro de un cierre del estudio. Rango inclusivo por los dos extremos.';

-- reservar_plaza: MISMA FIRMA que la deja el cierre anterior (8 args), así que
-- `create or replace` conserva los grants y no aplica el gotcha de la firma
-- nueva. No se repiten aquí los REVOKE/GRANT a propósito: repetirlos sugeriría
-- que hace falta, y la próxima persona copiaría el patrón donde no toca.
create or replace function public.reservar_plaza(
  p_studio_id text, p_sesion_id text, p_socio_id text, p_reserva_id text,
  p_permite_lista_espera boolean default true,
  p_requiere_aprobacion boolean default false,
  p_spot_id text default null,
  -- SOLO lo pone a true el webhook de Stripe tras cobrar. Ver la cabecera.
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

  -- Impago. Va aquí arriba, antes de contar aforo o consumir nada: si no
  -- puede reservar, que no se haya movido ya media máquina.
  if not p_saltar_gate_impago and public.current_rol() is null then
    select coalesce(st.bloquear_reserva_impago, false) into v_bloquea_impago
      from studios st where st.id = p_studio_id;
    if v_bloquea_impago and public.socio_tiene_impago(p_studio_id, p_socio_id) then
      raise exception 'RESERVA_BLOQUEADA_IMPAGO';
    end if;
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
