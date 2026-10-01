-- La única puerta por la que entra una reserva de otra plataforma.
--
-- Hermana de `reservar_plaza`, sin tocarla: aquella está construida alrededor
-- de la socia (validación, candado por socia, entitlement, límite semanal,
-- bono), y nada de eso aplica a quien viene de ClassPass o Urban Sports Club.
--
-- Lo que SÍ comparte, y es lo que importa: el MISMO candado de la sesión
-- (`select … from sesiones … for update`) y el MISMO recuento de aforo contra
-- `aforo_efectivo()`. Una reserva externa y una de socia compiten por la misma
-- plaza bajo el mismo candado, así que no hay una segunda vía de overbooking
-- (ver memoria overbooking-lista-espera-aforo).
--
-- Una externa NUNCA va a lista de espera ni a aprobación: la plataforma ya le
-- ha confirmado la plaza a su clienta. O hay sitio, o se rechaza.
--
-- Idempotente por (estudio, origen, id externo): si la plataforma repite la
-- llamada con el mismo id, se devuelve la reserva que ya existe
-- (`repetida = true`) sin tocar nada.
--
-- `p_exigir_cupo`: con la API (la plataforma reserva sola), superar las plazas
-- cedidas se rechaza. En modo manual (recepción apunta una venta que YA ocurrió
-- en la plataforma) solo se informa: bloquear no evita que la persona venga.

create or replace function public.reservar_plaza_externa(
  p_studio_id text,
  p_sesion_id text,
  p_reserva_id text,
  p_origen text,
  p_nombre text,
  p_id_reserva_externa text default null,
  p_id_cliente_externo text default null,
  p_exigir_cupo boolean default false
)
 returns table(reserva_id text, estado text, repetida boolean, plazas_libres integer, cupo integer, cupo_usado integer)
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
#variable_conflict use_column
declare
  v_existente text;
  v_existente_estado text;
  v_inicio timestamptz;
  v_fin timestamptz;
  v_cancelada boolean;
  v_tipo_clase_id text;
  v_requiere_autorizacion boolean;
  v_aforo int;
  v_ocupadas int;
  v_cupo int;
  v_cupo_usado int;
  v_nombre text := btrim(coalesce(p_nombre, ''));
begin
  perform public.validar_studio_mismatch(p_studio_id);

  if p_origen not in ('CLASSPASS', 'URBAN_SPORTS_CLUB', 'WELLHUB') then
    raise exception 'ORIGEN_NO_VALIDO';
  end if;
  if length(v_nombre) = 0 then
    raise exception 'NOMBRE_REQUERIDO';
  end if;
  v_nombre := left(v_nombre, 200);

  -- El candado de la sesión, ANTES de mirar nada más: el mismo que toma
  -- `reservar_plaza`. También serializa dos llamadas con el mismo id externo,
  -- así que la comprobación de idempotencia de abajo no tiene carrera.
  select s.inicio, s.fin, s.tipo_clase_id, s.cancelada
    into v_inicio, v_fin, v_tipo_clase_id, v_cancelada
    from sesiones s where s.id = p_sesion_id and s.studio_id = p_studio_id
    for update;
  if not found then
    raise exception 'SESION_NO_ENCONTRADA';
  end if;

  if p_id_reserva_externa is not null then
    select r.id, r.estado into v_existente, v_existente_estado
      from reservas r
     where r.studio_id = p_studio_id and r.origen = p_origen
       and r.id_reserva_externa = p_id_reserva_externa;
    if v_existente is not null then
      return query
        select v_existente, v_existente_estado, true,
               greatest(0, coalesce(aforo_efectivo(p_sesion_id), 0) - (
                 select count(*)::int from reservas x
                  where x.sesion_id = p_sesion_id and x.estado in ('CONFIRMADA', 'ASISTIDA'))),
               public.cupo_plataforma(p_sesion_id, p_origen),
               (select count(*)::int from reservas x
                 where x.sesion_id = p_sesion_id and x.origen = p_origen
                   and x.estado in ('CONFIRMADA', 'ASISTIDA'));
      return;
    end if;
  end if;

  if coalesce(v_cancelada, false) then
    raise exception 'SESION_CANCELADA';
  end if;
  -- Se admite mientras la clase no haya terminado: el mismo corte que la
  -- reserva de mostrador (alguien que llega con la clase empezada).
  if v_fin is not null and v_fin <= now() then
    raise exception 'SESION_TERMINADA';
  end if;
  if public.fecha_en_cierre(p_studio_id, (v_inicio at time zone 'Europe/Madrid')::date) then
    raise exception 'ESTUDIO_CERRADO';
  end if;

  -- Las clases que exigen autorización previa (p. ej. reformer para quien ya
  -- ha hecho la iniciación) no se venden fuera: la persona externa no tiene
  -- ficha donde constar esa autorización. Sin esto, el trigger
  -- `exigir_autorizacion_tipo_clase` lo rechazaría con un error confuso.
  if v_tipo_clase_id is not null then
    select tc.requiere_autorizacion into v_requiere_autorizacion
      from tipos_clase tc where tc.id = v_tipo_clase_id and tc.studio_id = p_studio_id;
    if coalesce(v_requiere_autorizacion, false) then
      raise exception 'TIPO_REQUIERE_AUTORIZACION';
    end if;
  end if;

  if p_id_cliente_externo is not null and exists (
    select 1 from reservas r
     where r.sesion_id = p_sesion_id and r.origen = p_origen
       and r.id_cliente_externo = p_id_cliente_externo
       and r.estado in ('CONFIRMADA', 'ASISTIDA')
  ) then
    raise exception 'YA_RESERVADA';
  end if;

  v_aforo := aforo_efectivo(p_sesion_id);
  select count(*) into v_ocupadas
    from reservas where sesion_id = p_sesion_id and estado in ('CONFIRMADA', 'ASISTIDA');
  if v_aforo is not null and v_ocupadas >= v_aforo then
    raise exception 'AFORO_LLENO';
  end if;

  v_cupo := public.cupo_plataforma(p_sesion_id, p_origen);
  select count(*) into v_cupo_usado
    from reservas
   where sesion_id = p_sesion_id and origen = p_origen and estado in ('CONFIRMADA', 'ASISTIDA');
  if p_exigir_cupo and v_cupo is not null and v_cupo_usado >= v_cupo then
    raise exception 'CUPO_PLATAFORMA_AGOTADO';
  end if;

  -- Sin bono, sin cobro, sin recuperación: `bono_consumo_rastreado = false`
  -- escrito de forma explícita (el default de la columna es `true`, y el CHECK
  -- `reservas_origen_coherente` rechazaría la fila si no).
  insert into reservas (id, studio_id, sesion_id, socio_id, estado, spot_id, posicion_espera,
                        check_in_en, creado_en, bono_consumo_rastreado,
                        origen, nombre_externo, id_reserva_externa, id_cliente_externo)
    values (p_reserva_id, p_studio_id, p_sesion_id, null, 'CONFIRMADA', null, null,
            null, now(), false,
            p_origen, v_nombre, p_id_reserva_externa, p_id_cliente_externo);

  return query select p_reserva_id, 'CONFIRMADA'::text, false,
                      case when v_aforo is null then null else greatest(0, v_aforo - v_ocupadas - 1) end,
                      v_cupo, v_cupo_usado + 1;
end;
$function$;

revoke all on function public.reservar_plaza_externa(text, text, text, text, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.reservar_plaza_externa(text, text, text, text, text, text, text, boolean) to service_role, postgres;

do $$
begin
  if has_function_privilege('anon', 'public.reservar_plaza_externa(text,text,text,text,text,text,text,boolean)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.reservar_plaza_externa(text,text,text,text,text,text,text,boolean)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.reservar_plaza_externa(text,text,text,text,text,text,text,boolean)', 'EXECUTE') then
    raise exception 'reservar_plaza_externa: permisos distintos de lo previsto';
  end if;
end $$;
