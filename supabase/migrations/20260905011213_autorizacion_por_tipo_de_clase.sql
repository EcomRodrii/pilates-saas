-- Niveles: que una alumna solo pueda reservar las clases para las que está
-- autorizada. Pedido por un estudio con Gentil / Intermedio / Avanzado.
--
-- ⚠️ POR QUÉ NO ES UN "NIVEL" ORDINAL EN LA FICHA.
-- Un número (1=Gentil, 2=Intermedio, 3=Avanzado) asume que los niveles ORDENAN,
-- y en un estudio real conviven con actividades que no se ordenan entre sí:
-- Máquina, Suelo, Gyrotonic, Yoga. «Autorizada a Gyrotonic» no es un escalón
-- por encima de «autorizada a Suelo». Además, subir de nivel a alguien le
-- abriría de golpe clases que no tienen nada que ver.
--
-- ⚠️ POR QUÉ HACE FALTA EL FLAG EN EL TIPO DE CLASE, Y NO SOLO LA LISTA.
-- Con una lista blanca a secas («solo puede lo que esté en su lista»), un
-- estudio que solo quiera proteger Avanzado tendría que enumerar TODO lo demás
-- para TODAS las alumnas, y cada tipo de clase nuevo dejaría fuera a todo el
-- mundo en silencio. Con el flag, la regla solo existe donde se enciende:
-- ningún estudio nota nada hasta que marca una clase, y ahí sí manda la lista.

alter table public.tipos_clase
  add column if not exists requiere_autorizacion boolean not null default false;

comment on column public.tipos_clase.requiere_autorizacion is
  'Si es true, solo pueden reservarla las socias con fila en socio_tipos_clase_autorizados. false (default) = como siempre, sin restricción.';

create table if not exists public.socio_tipos_clase_autorizados (
  studio_id text not null references public.studios(id) on delete cascade,
  socio_id text not null references public.socios(id) on delete cascade,
  tipo_clase_id text not null references public.tipos_clase(id) on delete cascade,
  autorizada_en timestamptz not null default now(),
  autorizada_por uuid,
  primary key (socio_id, tipo_clase_id)
);

comment on table public.socio_tipos_clase_autorizados is
  'Qué clases con requiere_autorizacion puede reservar cada socia. Sin fila = no puede. Solo aplica a los tipos con el flag encendido.';

create index if not exists idx_autorizados_studio_tipo
  on public.socio_tipos_clase_autorizados (studio_id, tipo_clase_id);

alter table public.socio_tipos_clase_autorizados enable row level security;

-- Mismo criterio que `recuperaciones` (migr 0122): lo lee todo el personal del
-- estudio, lo escribe quien gestiona clientas. Autorizar a alguien a una clase
-- es una decisión de mostrador, no de calendario.
drop policy if exists autorizados_lectura on public.socio_tipos_clase_autorizados;
create policy autorizados_lectura on public.socio_tipos_clase_autorizados
  for select to authenticated
  using (studio_id = public.current_studio_id());

drop policy if exists autorizados_insert on public.socio_tipos_clase_autorizados;
create policy autorizados_insert on public.socio_tipos_clase_autorizados
  for insert to authenticated
  with check (studio_id = public.current_studio_id() and public.puede_gestionar_clientas());

drop policy if exists autorizados_delete on public.socio_tipos_clase_autorizados;
create policy autorizados_delete on public.socio_tipos_clase_autorizados
  for delete to authenticated
  using (studio_id = public.current_studio_id() and public.puede_gestionar_clientas());

-- La tabla es de alta y baja: autorizar o dejar de autorizar. Sin política de
-- UPDATE, la RLS ya lo niega; se revoca además el privilegio para que no
-- dependa de que nadie añada una policy de UPDATE por descuido.
revoke update on public.socio_tipos_clase_autorizados from authenticated;

-- Motivo nuevo para el registro de intentos fallidos: sin esto, el intento se
-- perdería y el Decision OS no podría contar «cuántas se quedan fuera por
-- nivel». Se reescribe el CHECK entero — uno nuevo solo con el valor añadido
-- rechazaría todos los demás.
alter table public.intentos_reserva_fallidos
  drop constraint if exists intentos_reserva_fallidos_motivo_check;
alter table public.intentos_reserva_fallidos
  add constraint intentos_reserva_fallidos_motivo_check check (motivo in (
    'AFORO_LLENO_SIN_ESPERA', 'SIN_PLAN', 'PLAN_NO_INCLUYE_TIPO',
    'FUERA_VENTANA_MINIMA', 'FUERA_VENTANA_MAXIMA',
    'LIMITE_SEMANAL', 'MAX_SIMULTANEAS',
    'CONFLICTO_HORARIO', 'NECESITA_AUTORIZACION'
  ));

-- reservar_plaza: MISMA FIRMA (7 args), así que `CREATE OR REPLACE` conserva
-- los grants y no aplica el gotcha de la firma nueva. Verificado tras aplicar:
-- anon sigue sin EXECUTE, authenticated lo mantiene.
--
-- ⚠️ La comprobación va para TODO EL MUNDO, también para el mostrador. Es
-- deliberado: si recepción pudiera saltársela en silencio, el estudio creería
-- que la regla se aplica cuando la mitad de las reservas la esquivan. Si hoy
-- quieren dejar entrar a alguien, se la autoriza desde su ficha — que además
-- deja constancia de quién lo decidió.

create or replace function public.reservar_plaza(p_studio_id text, p_sesion_id text, p_socio_id text, p_reserva_id text, p_permite_lista_espera boolean DEFAULT true, p_requiere_aprobacion boolean DEFAULT false, p_spot_id text DEFAULT NULL::text)
 RETURNS TABLE(estado text, posicion_espera integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    select p.limite_semanal into v_limite
      from suscripciones s
      join planes_tarifa p on p.id = s.plan_id
     where s.studio_id = p_studio_id and s.socio_id = p_socio_id and s.estado = 'ACTIVA'
       and p.limite_semanal is not null
       and (s.fecha_fin is null or s.fecha_fin >= current_date)
     order by p.limite_semanal asc
     limit 1;
    if v_limite is not null then
      v_semana_ini := date_trunc('week', v_inicio at time zone 'Europe/Madrid') at time zone 'Europe/Madrid';
      select count(*) into v_semana
        from reservas r
        join sesiones ss on ss.id = r.sesion_id
       where r.socio_id = p_socio_id and r.studio_id = p_studio_id
         and r.estado in ('CONFIRMADA', 'ASISTIDA')
         and coalesce(ss.cancelada, false) = false
         and ss.inicio >= v_semana_ini
         and ss.inicio <  v_semana_ini + interval '7 days';
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
