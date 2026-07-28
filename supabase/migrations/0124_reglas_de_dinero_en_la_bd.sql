-- Las reglas del dinero dejan de vivir solo en JavaScript.
--
-- Hallazgo P2-4 de la auditoría de Cloe. `reservar_plaza` sí protege el aforo,
-- los duplicados, el límite semanal y el estudio — pero las dos reglas que
-- deciden a quién se le cobra qué vivían ENTERAS en el cliente:
--
--   1. La cobertura del bono por tipo de clase (`plan_tipos_clase`, migr 0106).
--      `consumir_sesion_bono` recibe un id de suscripción y lo descuenta a
--      ciegas: no sabe de qué clase se trata, así que no puede comprobar nada.
--      Quien decidía era `bonoConsumible` en el navegador. Un olvido allí
--      —pasó: faltaba el tipo en los cuatro caminos del panel— servía la clase
--      cara contra el bono barato, y ninguna capa de abajo lo veía.
--
--   2. Si al cancelar se devuelve la sesión del bono. La ventana de
--      cancelación puede acotarse por tipo de clase (migr 0111), pero
--      `cancelar_reserva_plaza` no la mira: devolvía un booleano de «era
--      confirmada» y el cliente decidía. El portal lo hacía bien y el panel
--      usaba la global — la misma cancelación salía tardía o no según por
--      dónde entrara la socia.
--
-- El patrón es el mismo en los dos casos: la regla está en un solo cliente, así
-- que CADA superficie nueva (una app, un kiosko, un importador, una integración)
-- nace desprotegida y hay que acordarse de replicarla. Aquí se bajan a la base,
-- que es la única capa por la que pasan todas.
--
-- Lo que NO se toca, a propósito: la capacidad de la sala. `sesiones.aforo_maximo`
-- es la capacidad autoritativa de cada clase POR DISEÑO —un taller puede tener
-- menos plazas que la sala— y `salas.capacidad` es el valor del que hereda.
-- Un CHECK de `aforo_maximo <= salas.capacidad` rompería además el caso de
-- bajar la sala por debajo de las plazas ya confirmadas, donde a propósito se
-- deja el aforo en las confirmadas para no echar a nadie. El fallo real ahí era
-- que nadie avisaba, y eso se arregló en la UI (#460).

-- ── 1. Consumir bono: solo si el plan cubre esa clase ────────────────────────
--
-- `p_sesion_id` es opcional para no romper nada a medio despliegue (el JS viejo
-- sigue llamando con dos argumentos mientras sale la versión nueva). Se sustituye
-- la función de 2 argumentos en vez de añadir una sobrecarga: con dos funciones
-- del mismo nombre, una llamada de 2 argumentos sería ambigua y fallaría.
drop function if exists public.consumir_sesion_bono(text, text);

create function public.consumir_sesion_bono(
  p_suscripcion_id text,
  p_studio_id text,
  p_sesion_id text default null
) returns integer
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $$
declare
  v_saldo int;
  v_plan_id text;
  v_tipo_clase_id text;
  v_acotado boolean;
begin
  if auth.uid() is not null and p_studio_id is distinct from public.current_studio_id() then
    raise exception 'STUDIO_MISMATCH';
  end if;

  if p_sesion_id is not null then
    select s.plan_id into v_plan_id
      from public.suscripciones s
     where s.id = p_suscripcion_id and s.studio_id = p_studio_id;

    select ss.tipo_clase_id into v_tipo_clase_id
      from public.sesiones ss
     where ss.id = p_sesion_id and ss.studio_id = p_studio_id;

    -- Sin filas en la tabla puente, el plan cubre TODAS las clases: es la
    -- semántica de la 0106 y la que han tenido siempre los planes de antes.
    select exists (
      select 1 from public.plan_tipos_clase ptc
       where ptc.plan_id = v_plan_id and ptc.studio_id = p_studio_id
    ) into v_acotado;

    if v_acotado and v_tipo_clase_id is not null and not exists (
      select 1 from public.plan_tipos_clase ptc
       where ptc.plan_id = v_plan_id and ptc.studio_id = p_studio_id
         and ptc.tipo_clase_id = v_tipo_clase_id
    ) then
      raise exception 'BONO_NO_CUBRE_CLASE';
    end if;
  end if;

  update public.suscripciones
     set sesiones_restantes = sesiones_restantes - 1
   where id = p_suscripcion_id
     and studio_id = p_studio_id
     and sesiones_restantes > 0
  returning sesiones_restantes into v_saldo;

  return v_saldo;
end;
$$;

-- Mismos permisos que tenía: authenticated y service_role. anon NO.
revoke all on function public.consumir_sesion_bono(text, text, text) from public;
revoke all on function public.consumir_sesion_bono(text, text, text) from anon;
grant execute on function public.consumir_sesion_bono(text, text, text) to authenticated, service_role;

-- ── 2. Cancelar: la BD decide si se devuelve la sesión del bono ──────────────
--
-- Se añade `devolver_bono` a la salida. Espejo exacto de `debeDevolverBono`
-- (lib/booking-logic.ts): devolver salvo que la cancelación sea tardía y la
-- política del estudio no devuelva en tardías; y `ventana <= 0` desactiva la
-- penalización. La ventana sale del tipo de clase si la tiene, y si no de la
-- del estudio (`??`, no `||`: un 0 explícito significa «sin penalización» y no
-- debe caer a la global).
--
-- El cliente pasa a obedecer este booleano en vez de recalcularlo.
drop function if exists public.cancelar_reserva_plaza(text, text, text);

create function public.cancelar_reserva_plaza(
  p_studio_id text, p_reserva_id text, p_socio_id text
) returns table(era_confirmada boolean, promovida_socio_id text, devolver_bono boolean)
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $$
declare
  v_sesion_id text;
  v_estado text;
  v_res_socio text;
  v_promo_id text;
  v_promo_socio text;
  v_inicio timestamptz;
  v_tipo_clase_id text;
  v_ventana int;
  v_devolver_tardia boolean;
  v_tardia boolean;
  v_devolver boolean;
begin
  if auth.uid() is not null and p_studio_id is distinct from current_studio_id() then
    raise exception 'STUDIO_MISMATCH';
  end if;

  select sesion_id, estado, socio_id into v_sesion_id, v_estado, v_res_socio
    from reservas where id = p_reserva_id and studio_id = p_studio_id
    for update;
  if not found then raise exception 'RESERVA_NO_ENCONTRADA'; end if;
  if p_socio_id is not null and v_res_socio is distinct from p_socio_id then
    raise exception 'NO_AUTORIZADO';
  end if;
  if v_estado = 'CANCELADA' then
    return query select false, null::text, false;
    return;
  end if;

  perform 1 from sesiones where id = v_sesion_id for update;

  -- Política de devolución, resuelta ANTES de tocar nada.
  select ss.inicio, ss.tipo_clase_id into v_inicio, v_tipo_clase_id
    from sesiones ss where ss.id = v_sesion_id;
  select coalesce(tc.ventana_cancelacion_horas, st.cancelacion_ventana_horas),
         coalesce(st.cancelacion_devolver_bono_tardia, false)
    into v_ventana, v_devolver_tardia
    from studios st
    left join tipos_clase tc on tc.id = v_tipo_clase_id and tc.studio_id = p_studio_id
   where st.id = p_studio_id;

  v_tardia := coalesce(v_ventana, 0) > 0
              and now() >= v_inicio - make_interval(hours => v_ventana);
  v_devolver := v_devolver_tardia or not v_tardia;

  update reservas set estado = 'CANCELADA', posicion_espera = null where id = p_reserva_id;

  update recuperaciones
     set estado = 'DISPONIBLE', usada_en_reserva_id = null
   where usada_en_reserva_id = p_reserva_id and estado = 'USADA';

  if v_estado in ('CONFIRMADA', 'ASISTIDA') then
    -- Promover al que lleva MÁS tiempo esperando (FIFO por creado_en), no por
    -- posicion_espera (corrompible por huecos).
    select id, socio_id into v_promo_id, v_promo_socio
      from reservas
      where sesion_id = v_sesion_id and estado = 'LISTA_ESPERA'
      order by creado_en asc, id asc
      limit 1 for update;
    if found then
      update reservas set estado = 'CONFIRMADA', posicion_espera = null where id = v_promo_id;
    end if;
  end if;

  -- Renumerar la lista de espera restante de forma DENSA y por antigüedad (1,2,3…),
  -- tanto si hubo promoción como si se canceló una reserva de la propia espera.
  update reservas r
     set posicion_espera = sub.rn
    from (
      select id, row_number() over (order by creado_en asc, id asc) as rn
        from reservas
       where sesion_id = v_sesion_id and estado = 'LISTA_ESPERA'
    ) sub
   where r.id = sub.id and r.posicion_espera is distinct from sub.rn;

  return query select (v_estado in ('CONFIRMADA', 'ASISTIDA')), v_promo_socio, v_devolver;
end;
$$;

revoke all on function public.cancelar_reserva_plaza(text, text, text) from public;
revoke all on function public.cancelar_reserva_plaza(text, text, text) from anon;
grant execute on function public.cancelar_reserva_plaza(text, text, text) to authenticated, service_role;
