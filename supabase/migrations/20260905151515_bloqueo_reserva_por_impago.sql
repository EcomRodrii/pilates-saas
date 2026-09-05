-- Bloquear la reserva a quien tiene un recibo impagado.
--
-- Pedido por un estudio que llega desde Timp. Hasta ahora nada miraba `recibos`
-- al reservar: se podía deber dinero y seguir apuntándose.
--
-- ═══ QUÉ CUENTA COMO IMPAGO ═══
-- SOLO `FALLIDO` y `DEVUELTO`: un cobro que se INTENTÓ de verdad y no salió
-- (tarjeta rechazada, devolución SEPA). Ahí no hay duda de que hay deuda.
--
-- `PENDIENTE` queda fuera a propósito, y no es un olvido: un recibo emitido
-- esta mañana está PENDIENTE y todavía en plazo. Bloquear por eso echaría a
-- socias que están al corriente. Si algún día se quiere cubrir el efectivo y
-- las transferencias —que nunca llegan a FALLIDO porque nadie las intenta
-- cobrar— hace falta un plazo configurable, que es otra decisión.
--
-- ═══ OPT-IN, NO POR DEFECTO ═══
-- `studios.bloquear_reserva_impago` arranca en false. No es prudencia
-- decorativa: HOY hay 2 recibos impagados de 2 socias reales en producción.
-- Encenderlo por defecto las dejaría fuera mañana sin que nadie lo pidiera.
--
-- ═══ LOS TRES SITIOS DONDE NO SE APLICA, Y POR QUÉ ═══
--
-- 1. ⚠️ EL PAGO QUE ACABA DE OCURRIR. `reservarPlazaTrasPagoPublico` corre
--    DESDE EL WEBHOOK DE STRIPE, con el dinero YA COBRADO. Un gate ciego ahí
--    cobraría y acto seguido negaría la plaza — el peor fallo posible de este
--    repo y uno que ya pasó una vez por otra vía. Se salta con
--    `p_saltar_gate_impago`, que SOLO pone a true ese caller: quien acaba de
--    pagar no es quien debe.
--
-- 2. EL MOSTRADOR. Si `current_rol()` devuelve un rol de staff, no se bloquea:
--    delante hay una persona que puede mirar a la socia y decidir. El bloqueo
--    es para el autoservicio (portal y widget), donde no hay nadie que juzgue.
--
-- 3. LAS PLAZAS FIJAS. `materializar_plazas_fijas` inserta directo, sin pasar
--    por esta función, así que quedan fuera por construcción. Es lo correcto:
--    una plaza fija es un acuerdo permanente, y que un cron deje de
--    materializarla en silencio es peor que dejarla pasar — el estudio ve la
--    deuda igual en su panel.

alter table public.studios
  add column if not exists bloquear_reserva_impago boolean not null default false;

-- ⚠️ El motivo nuevo TIENE que entrar en el CHECK. `registrarIntentoFallido`
-- inserta sin `await` a propósito (un fallo al registrar no debe retrasar el
-- mensaje real a la socia), así que un motivo no permitido no da error: la fila
-- se pierde en silencio y el estudio no llega a ver por qué se le fue nadie.
alter table public.intentos_reserva_fallidos
  drop constraint if exists intentos_reserva_fallidos_motivo_check;
alter table public.intentos_reserva_fallidos
  add constraint intentos_reserva_fallidos_motivo_check check (motivo in (
    'AFORO_LLENO_SIN_ESPERA', 'SIN_PLAN', 'PLAN_NO_INCLUYE_TIPO',
    'FUERA_VENTANA_MINIMA', 'FUERA_VENTANA_MAXIMA',
    'LIMITE_SEMANAL', 'MAX_SIMULTANEAS',
    'CONFLICTO_HORARIO', 'NECESITA_AUTORIZACION',
    'RESERVA_BLOQUEADA_IMPAGO'
  ));

comment on column public.studios.bloquear_reserva_impago is
  'Si se impide reservar a quien tiene un recibo FALLIDO o DEVUELTO. Solo afecta al autoservicio (portal y widget): el mostrador nunca se bloquea, y quien acaba de pagar tampoco.';

-- Un solo sitio decide si alguien debe dinero, para que no haya dos respuestas
-- distintas según por dónde se pregunte.
create or replace function public.socio_tiene_impago(p_studio_id text, p_socio_id text)
returns boolean
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  select exists (
    select 1 from recibos r
     where r.studio_id = p_studio_id
       and r.socio_id = p_socio_id
       and r.estado in ('FALLIDO', 'DEVUELTO')
  );
$$;

comment on function public.socio_tiene_impago(text, text) is
  'Si la socia tiene algún recibo FALLIDO o DEVUELTO. PENDIENTE no cuenta: puede estar aún en plazo.';

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

-- ⚠️ LA FIRMA CAMBIA (7 → 8 argumentos), y eso arrastra DOS cosas, no una.
--
-- 1. `create or replace` con una firma nueva NO reemplaza: crea una SOBRECARGA.
--    Las dos quedarían vivas y PostgREST tendría que elegir — exactamente el
--    problema que ya dio la sobrecarga de 6 parámetros y que está documentado
--    en lib/db/supabase-data-admin.ts. Se borra la vieja explícitamente.
drop function if exists public.reservar_plaza(text, text, text, text, boolean, boolean, text);

-- 2. El objeto función NUEVO nace con `EXECUTE` para PUBLIC y no hereda nada
--    del endurecimiento anterior. Se reproduce el estado exacto que tenía la
--    firma de 7 argumentos, verificado antes de escribir esto:
--    anon=false, authenticated=true, service_role=true.
--
--    `revoke from anon` no sobra por venir después del de PUBLIC: en este
--    proyecto `pg_default_acl` da EXECUTE DIRECTO a anon/authenticated en cada
--    función nueva, así que quitarle PUBLIC no le quita ese privilegio propio.
revoke execute on function public.reservar_plaza(text, text, text, text, boolean, boolean, text, boolean) from public;
revoke execute on function public.reservar_plaza(text, text, text, text, boolean, boolean, text, boolean) from anon;
grant  execute on function public.reservar_plaza(text, text, text, text, boolean, boolean, text, boolean) to authenticated, service_role;
