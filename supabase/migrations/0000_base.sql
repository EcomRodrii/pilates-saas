--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS public;


--
-- Name: ajustar_creditos(text, text, integer, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ajustar_creditos(p_socio_id text, p_studio_id text, p_delta_saldo integer, p_delta_ganado integer, p_delta_canjeado integer) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
declare v_saldo int;
begin
  insert into member_credits (socio_id, studio_id, saldo, total_ganado, total_canjeado, actualizado_en)
    values (p_socio_id, p_studio_id, p_delta_saldo, p_delta_ganado, p_delta_canjeado, now())
  on conflict (socio_id) do update set
    saldo = member_credits.saldo + p_delta_saldo,
    total_ganado = member_credits.total_ganado + p_delta_ganado,
    total_canjeado = member_credits.total_canjeado + p_delta_canjeado,
    actualizado_en = now()
  returning saldo into v_saldo;
  if v_saldo < 0 then
    raise exception 'SALDO_INSUFICIENTE';
  end if;
  return v_saldo;
end;
$$;


--
-- Name: cancelar_reserva_plaza(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancelar_reserva_plaza(p_studio_id text, p_reserva_id text, p_socio_id text) RETURNS TABLE(era_confirmada boolean, promovida_socio_id text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
declare
  v_sesion_id text;
  v_estado text;
  v_res_socio text;
  v_promo_id text;
  v_promo_socio text;
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
    return query select false, null::text;
    return;
  end if;

  -- Serializa con nuevas reservas / otras cancelaciones de la misma sesión.
  perform 1 from sesiones where id = v_sesion_id for update;

  update reservas set estado = 'CANCELADA', posicion_espera = null where id = p_reserva_id;

  if v_estado in ('CONFIRMADA', 'ASISTIDA') then
    select id, socio_id into v_promo_id, v_promo_socio
      from reservas
      where sesion_id = v_sesion_id and estado = 'LISTA_ESPERA'
      order by posicion_espera asc nulls last
      limit 1 for update;
    if found then
      update reservas set estado = 'CONFIRMADA', posicion_espera = null where id = v_promo_id;
    end if;
  end if;

  return query select (v_estado in ('CONFIRMADA', 'ASISTIDA')), v_promo_socio;
end;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: reservas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reservas (
    id text NOT NULL,
    studio_id text NOT NULL,
    sesion_id text,
    socio_id text,
    estado text DEFAULT 'CONFIRMADA'::text NOT NULL,
    spot_id text,
    posicion_espera integer,
    check_in_en timestamp with time zone,
    creado_en timestamp with time zone DEFAULT now(),
    CONSTRAINT reservas_estado_check CHECK ((estado = ANY (ARRAY['CONFIRMADA'::text, 'LISTA_ESPERA'::text, 'ASISTIDA'::text, 'CANCELADA'::text, 'NO_ASISTIO'::text])))
);


--
-- Name: crear_reserva_atomica(text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crear_reserva_atomica(p_id text, p_studio_id text, p_sesion_id text, p_socio_id text, p_spot_id text DEFAULT NULL::text) RETURNS public.reservas
    LANGUAGE plpgsql
    AS $$
declare
  v_aforo int;
  v_confirmadas int;
  v_en_espera int;
  v_estado text;
  v_posicion int;
  v_row reservas;
begin
  select aforo_maximo into v_aforo
  from sesiones
  where id = p_sesion_id and studio_id = p_studio_id
  for update;

  if v_aforo is null then
    raise exception 'SESION_NO_ENCONTRADA';
  end if;

  select count(*) into v_confirmadas
  from reservas
  where sesion_id = p_sesion_id and estado in ('CONFIRMADA', 'ASISTIDA');

  if v_confirmadas < v_aforo then
    v_estado := 'CONFIRMADA';
    v_posicion := null;
  else
    select count(*) into v_en_espera
    from reservas
    where sesion_id = p_sesion_id and estado = 'LISTA_ESPERA';
    v_estado := 'LISTA_ESPERA';
    v_posicion := v_en_espera + 1;
  end if;

  insert into reservas (id, studio_id, sesion_id, socio_id, spot_id, estado, posicion_espera)
  values (p_id, p_studio_id, p_sesion_id, p_socio_id, p_spot_id, v_estado, v_posicion)
  returning * into v_row;

  return v_row;
end;
$$;


--
-- Name: current_rol(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_rol() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  -- Rol del usuario: el de su ficha de instructora, o PROPIETARIO si es la
  -- dueña del negocio (studios.owner_auth_user_id). SIN fallback general: antes
  -- devolvía 'PROPIETARIO' a CUALQUIER usuario autenticado sin ficha —una
  -- escalada de privilegios—. Ahora un usuario no vinculado obtiene NULL.
  select coalesce(
    (select rol from instructores where auth_user_id = auth.uid() limit 1),
    (select 'PROPIETARIO' from studios where owner_auth_user_id = auth.uid() limit 1)
  );
$$;


--
-- Name: current_studio_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_studio_id() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  -- Resuelve el estudio del usuario autenticado: primero como instructora
  -- vinculada, luego como propietaria. SIN fallback: si no resuelve devuelve
  -- NULL, y `studio_id = null` no casa ninguna fila (antes caía a 'studio-1',
  -- filtrando los datos de ese negocio a cualquier usuario no resuelto).
  select coalesce(
    (select studio_id from instructores where auth_user_id = auth.uid() limit 1),
    (select id from studios where owner_auth_user_id = auth.uid() limit 1)
  );
$$;


--
-- Name: reservar_plaza(text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reservar_plaza(p_studio_id text, p_sesion_id text, p_socio_id text, p_reserva_id text) RETURNS TABLE(estado text, posicion_espera integer)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
#variable_conflict use_column
declare
  v_aforo int;
  v_ocupadas int;
  v_espera int;
  v_estado text;
  v_pos int;
begin
  -- Aislamiento por negocio en llamadas autenticadas (panel). Las de
  -- service-role (endpoints públicos) no tienen auth.uid() y se saltan el check.
  if auth.uid() is not null and p_studio_id is distinct from current_studio_id() then
    raise exception 'STUDIO_MISMATCH';
  end if;

  -- Serializa las reservas concurrentes de ESTA sesión.
  select aforo_maximo into v_aforo
    from sesiones where id = p_sesion_id and studio_id = p_studio_id
    for update;
  if not found then
    raise exception 'SESION_NO_ENCONTRADA';
  end if;

  if exists (
    select 1 from reservas
    where sesion_id = p_sesion_id and socio_id = p_socio_id
      and estado in ('CONFIRMADA', 'LISTA_ESPERA', 'ASISTIDA')
  ) then
    raise exception 'YA_RESERVADA';
  end if;

  select count(*) into v_ocupadas
    from reservas
    where sesion_id = p_sesion_id and estado in ('CONFIRMADA', 'ASISTIDA');

  if v_aforo is null or v_ocupadas < v_aforo then
    v_estado := 'CONFIRMADA';
    v_pos := null;
  else
    select count(*) into v_espera
      from reservas where sesion_id = p_sesion_id and estado = 'LISTA_ESPERA';
    v_estado := 'LISTA_ESPERA';
    v_pos := v_espera + 1;
  end if;

  insert into reservas (id, studio_id, sesion_id, socio_id, estado, spot_id, posicion_espera, check_in_en, creado_en)
    values (p_reserva_id, p_studio_id, p_sesion_id, p_socio_id, v_estado, null, v_pos, null, now());

  return query select v_estado, v_pos;
end;
$$;


--
-- Name: achievement_definitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.achievement_definitions (
    id text NOT NULL,
    studio_id text NOT NULL,
    metric text NOT NULL,
    nombre text NOT NULL,
    descripcion text,
    umbral integer DEFAULT 1 NOT NULL,
    icono text DEFAULT '🏆'::text NOT NULL,
    creditos_recompensa integer DEFAULT 0 NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: achievement_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.achievement_history (
    id text NOT NULL,
    studio_id text NOT NULL,
    socio_id text,
    achievement_id text,
    nombre text NOT NULL,
    icono text NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: achievement_progress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.achievement_progress (
    id text NOT NULL,
    studio_id text NOT NULL,
    socio_id text,
    achievement_id text,
    progreso_actual integer DEFAULT 0 NOT NULL,
    completado boolean DEFAULT false NOT NULL,
    completado_en timestamp with time zone
);


--
-- Name: actividad_reciente; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.actividad_reciente (
    id text NOT NULL,
    studio_id text NOT NULL,
    tipo text NOT NULL,
    texto text NOT NULL,
    socio_id text,
    enlace text,
    creado_en timestamp with time zone DEFAULT now(),
    actor_nombre text
);


--
-- Name: automation_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.automation_logs (
    id text NOT NULL,
    studio_id text NOT NULL,
    rule_id text,
    rule_name text,
    socio_id text,
    socio_nombre text,
    paso_index integer,
    accion text,
    resultado text,
    detalle text,
    ejecutado_en timestamp with time zone DEFAULT now(),
    proxima_accion_en timestamp with time zone,
    recibo_id text
);


--
-- Name: automation_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.automation_rules (
    id text NOT NULL,
    studio_id text NOT NULL,
    nombre text NOT NULL,
    descripcion text,
    icono text,
    trigger text NOT NULL,
    condicion jsonb DEFAULT '{}'::jsonb,
    pasos jsonb DEFAULT '[]'::jsonb,
    activa boolean DEFAULT true,
    ejecutada_veces integer DEFAULT 0,
    ultima_ejecucion timestamp with time zone,
    creada_en timestamp with time zone DEFAULT now()
);


--
-- Name: automatizaciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.automatizaciones (
    id text NOT NULL,
    studio_id text NOT NULL,
    nombre text NOT NULL,
    trigger text NOT NULL,
    accion text NOT NULL,
    asunto text,
    mensaje text,
    activa boolean DEFAULT true,
    ejecutadas integer DEFAULT 0,
    creada_en timestamp with time zone DEFAULT now()
);


--
-- Name: backups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.backups (
    id text NOT NULL,
    studio_id text NOT NULL,
    tipo text NOT NULL,
    datos jsonb NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT backups_tipo_check CHECK ((tipo = ANY (ARRAY['DIARIO'::text, 'SEMANAL'::text, 'MENSUAL'::text, 'MANUAL'::text])))
);


--
-- Name: campanas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campanas (
    id text NOT NULL,
    studio_id text NOT NULL,
    nombre text NOT NULL,
    tipo text NOT NULL,
    asunto text,
    contenido text,
    estado text DEFAULT 'BORRADOR'::text,
    destinatarios text DEFAULT 'TODAS'::text,
    enviados integer DEFAULT 0,
    abiertos integer DEFAULT 0,
    clics integer DEFAULT 0,
    creada_en timestamp with time zone DEFAULT now(),
    enviada_en timestamp with time zone,
    programada_en timestamp with time zone,
    CONSTRAINT campanas_estado_check CHECK ((estado = ANY (ARRAY['BORRADOR'::text, 'PROGRAMADA'::text, 'ENVIADA'::text, 'ACTIVA'::text, 'PAUSADA'::text]))),
    CONSTRAINT campanas_tipo_check CHECK ((tipo = ANY (ARRAY['EMAIL'::text, 'WHATSAPP'::text, 'SMS'::text])))
);


--
-- Name: challenge_definitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.challenge_definitions (
    id text NOT NULL,
    studio_id text NOT NULL,
    nombre text NOT NULL,
    descripcion text,
    icono text DEFAULT '🎯'::text NOT NULL,
    metric text NOT NULL,
    objetivo integer DEFAULT 1 NOT NULL,
    fecha_inicio timestamp with time zone NOT NULL,
    fecha_fin timestamp with time zone NOT NULL,
    creditos_recompensa integer DEFAULT 0 NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: challenge_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.challenge_history (
    id text NOT NULL,
    studio_id text NOT NULL,
    socio_id text,
    challenge_id text,
    nombre text NOT NULL,
    icono text NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: challenge_progress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.challenge_progress (
    id text NOT NULL,
    studio_id text NOT NULL,
    socio_id text,
    challenge_id text,
    progreso_actual integer DEFAULT 0 NOT NULL,
    completado boolean DEFAULT false NOT NULL,
    completado_en timestamp with time zone
);


--
-- Name: citas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.citas (
    id text NOT NULL,
    studio_id text NOT NULL,
    socio_id text,
    instructor_id text,
    tipo text DEFAULT 'PRIVADA'::text NOT NULL,
    inicio timestamp with time zone NOT NULL,
    fin timestamp with time zone NOT NULL,
    notas text,
    estado text DEFAULT 'PENDIENTE'::text NOT NULL,
    precio numeric(10,2),
    creado_en timestamp with time zone DEFAULT now(),
    CONSTRAINT citas_estado_check CHECK ((estado = ANY (ARRAY['PENDIENTE'::text, 'CONFIRMADA'::text, 'COMPLETADA'::text, 'CANCELADA'::text, 'NO_ASISTIO'::text]))),
    CONSTRAINT citas_tipo_check CHECK ((tipo = ANY (ARRAY['PRIVADA'::text, 'EVALUACION'::text, 'FISIOTERAPIA'::text, 'ONLINE'::text])))
);


--
-- Name: codigos_descuento; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.codigos_descuento (
    id text NOT NULL,
    studio_id text NOT NULL,
    codigo text NOT NULL,
    descripcion text,
    tipo text NOT NULL,
    valor numeric(10,2) NOT NULL,
    usos integer DEFAULT 0,
    usos_max integer,
    expira date,
    activo boolean DEFAULT true,
    creado_en timestamp with time zone DEFAULT now(),
    CONSTRAINT codigos_descuento_tipo_check CHECK ((tipo = ANY (ARRAY['PORCENTAJE'::text, 'IMPORTE_FIJO'::text])))
);


--
-- Name: credit_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.credit_transactions (
    id text NOT NULL,
    studio_id text NOT NULL,
    socio_id text,
    tipo text NOT NULL,
    creditos integer NOT NULL,
    descripcion text NOT NULL,
    ref_id text,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT credit_transactions_tipo_check CHECK ((tipo = ANY (ARRAY['GANANCIA'::text, 'CANJE'::text])))
);


--
-- Name: dashboard_charts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dashboard_charts (
    id text NOT NULL,
    studio_id text NOT NULL,
    nombre text NOT NULL,
    tipo text DEFAULT 'LINEA'::text NOT NULL,
    metrica text NOT NULL,
    agrupacion text DEFAULT 'MES'::text NOT NULL,
    rango integer DEFAULT 6 NOT NULL,
    color text DEFAULT '#F7A6C4'::text NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT dashboard_charts_agrupacion_check CHECK ((agrupacion = ANY (ARRAY['DIA'::text, 'SEMANA'::text, 'MES'::text]))),
    CONSTRAINT dashboard_charts_tipo_check CHECK ((tipo = ANY (ARRAY['LINEA'::text, 'BARRAS'::text])))
);


--
-- Name: facturas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.facturas (
    id text NOT NULL,
    studio_id text NOT NULL,
    recibo_id text,
    numero_completo text NOT NULL,
    fecha_emision date NOT NULL,
    receptor_nombre text,
    receptor_nif text,
    base_imponible numeric(10,2),
    tipo_iva numeric(5,2) DEFAULT 21,
    cuota_iva numeric(10,2),
    total numeric(10,2),
    verifactu_hash text,
    verifactu_prev_hash text,
    verifactu_ts text,
    verifactu_seq bigint
);


--
-- Name: instructores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instructores (
    id text NOT NULL,
    studio_id text NOT NULL,
    nombre text NOT NULL,
    email text,
    telefono text,
    color text DEFAULT '#4F46E5'::text,
    activo boolean DEFAULT true,
    rol text DEFAULT 'INSTRUCTOR'::text,
    auth_user_id uuid,
    avatar text
);


--
-- Name: integracion_credenciales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.integracion_credenciales (
    studio_id text NOT NULL,
    provider text NOT NULL,
    access_token text,
    refresh_token text,
    expires_at timestamp with time zone,
    actualizado_en timestamp with time zone DEFAULT now()
);


--
-- Name: integraciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.integraciones (
    id text NOT NULL,
    studio_id text NOT NULL,
    tipo text NOT NULL,
    activo boolean DEFAULT false NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: level_definitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.level_definitions (
    id text NOT NULL,
    studio_id text NOT NULL,
    nombre text NOT NULL,
    orden integer DEFAULT 0 NOT NULL,
    umbral_creditos integer DEFAULT 0 NOT NULL,
    color text DEFAULT '#B08D57'::text NOT NULL,
    icono text DEFAULT '🏅'::text NOT NULL,
    beneficios text,
    activo boolean DEFAULT true NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: member_credits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.member_credits (
    socio_id text NOT NULL,
    studio_id text NOT NULL,
    saldo integer DEFAULT 0 NOT NULL,
    total_ganado integer DEFAULT 0 NOT NULL,
    total_canjeado integer DEFAULT 0 NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: mensajes_equipo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mensajes_equipo (
    id text NOT NULL,
    studio_id text NOT NULL,
    autor_instructor_id text,
    autor_nombre text NOT NULL,
    texto text NOT NULL,
    creado_en timestamp with time zone DEFAULT now()
);


--
-- Name: notas_internas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notas_internas (
    id text NOT NULL,
    studio_id text NOT NULL,
    socio_id text,
    texto text NOT NULL,
    tipo text DEFAULT 'NOTA'::text,
    creado_en timestamp with time zone DEFAULT now(),
    CONSTRAINT notas_internas_tipo_check CHECK ((tipo = ANY (ARRAY['NOTA'::text, 'SISTEMA'::text])))
);


--
-- Name: notas_progreso; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notas_progreso (
    id text NOT NULL,
    studio_id text NOT NULL,
    socio_id text,
    instructor_id text,
    sesion_id text,
    texto_libre text,
    progreso text,
    alertas text,
    plan_proxima_sesion text,
    ejercicios_casa text,
    creada_en timestamp with time zone DEFAULT now()
);


--
-- Name: notificaciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notificaciones (
    id text NOT NULL,
    studio_id text NOT NULL,
    titulo text NOT NULL,
    texto text NOT NULL,
    leida boolean DEFAULT false,
    tipo text DEFAULT 'INFO'::text,
    enlace text,
    creada_en timestamp with time zone DEFAULT now(),
    CONSTRAINT notificaciones_tipo_check CHECK ((tipo = ANY (ARRAY['INFO'::text, 'AVISO'::text, 'ERROR'::text, 'EXITO'::text])))
);


--
-- Name: planes_tarifa; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.planes_tarifa (
    id text NOT NULL,
    studio_id text NOT NULL,
    nombre text NOT NULL,
    descripcion text,
    precio numeric(10,2) NOT NULL,
    tipo text NOT NULL,
    sesiones integer,
    activo boolean DEFAULT true,
    CONSTRAINT planes_tarifa_tipo_check CHECK ((tipo = ANY (ARRAY['MENSUAL'::text, 'BONO'::text, 'PUNTUAL'::text])))
);


--
-- Name: posts_comunidad; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.posts_comunidad (
    id text NOT NULL,
    studio_id text NOT NULL,
    autor_id text,
    autor_nombre text NOT NULL,
    autor_inicial text,
    texto text NOT NULL,
    likes integer DEFAULT 0,
    comentarios_count integer DEFAULT 0,
    fijado boolean DEFAULT false,
    creado_en timestamp with time zone DEFAULT now()
);


--
-- Name: preferencias_socio; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.preferencias_socio (
    socio_id text NOT NULL,
    studio_id text NOT NULL,
    disponibilidad jsonb DEFAULT '{}'::jsonb NOT NULL,
    instructor_favorito_id text,
    tipo_clase_favorita text,
    duracion_preferida integer,
    nivel text,
    notif_email boolean DEFAULT true NOT NULL,
    notif_whatsapp boolean DEFAULT true NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: productos_pos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.productos_pos (
    id text NOT NULL,
    studio_id text NOT NULL,
    nombre text NOT NULL,
    categoria text NOT NULL,
    precio numeric(10,2) NOT NULL,
    activo boolean DEFAULT true,
    CONSTRAINT productos_pos_categoria_check CHECK ((categoria = ANY (ARRAY['SESION'::text, 'PACK'::text, 'PRODUCTO'::text, 'OTRO'::text])))
);


--
-- Name: recibos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recibos (
    id text NOT NULL,
    studio_id text NOT NULL,
    socio_id text,
    suscripcion_id text,
    concepto text NOT NULL,
    importe numeric(10,2) NOT NULL,
    estado text DEFAULT 'PENDIENTE'::text NOT NULL,
    fecha_vencimiento date NOT NULL,
    fecha_cobro date,
    fecha_devolucion date,
    intentos_reintento integer DEFAULT 0,
    CONSTRAINT recibos_estado_check CHECK ((estado = ANY (ARRAY['PENDIENTE'::text, 'COBRADO'::text, 'DEVUELTO'::text, 'EN_CURSO'::text])))
);


--
-- Name: reward_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reward_actions (
    id text NOT NULL,
    studio_id text NOT NULL,
    socio_id text,
    trigger text NOT NULL,
    ref_id text,
    creado_en timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: reward_catalog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reward_catalog (
    id text NOT NULL,
    studio_id text NOT NULL,
    nombre text NOT NULL,
    descripcion text,
    coste_creditos integer DEFAULT 0 NOT NULL,
    icono text DEFAULT '🎁'::text NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    stock integer,
    creado_en timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: reward_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reward_history (
    id text NOT NULL,
    studio_id text NOT NULL,
    socio_id text,
    rule_id text,
    action_id text,
    creditos integer NOT NULL,
    descripcion text NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: reward_redemptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reward_redemptions (
    id text NOT NULL,
    studio_id text NOT NULL,
    socio_id text,
    catalog_item_id text,
    creditos_gastados integer NOT NULL,
    estado text DEFAULT 'PENDIENTE'::text NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT reward_redemptions_estado_check CHECK ((estado = ANY (ARRAY['PENDIENTE'::text, 'ENTREGADO'::text, 'CANCELADO'::text])))
);


--
-- Name: reward_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reward_rules (
    id text NOT NULL,
    studio_id text NOT NULL,
    trigger text NOT NULL,
    nombre text NOT NULL,
    descripcion text,
    creditos integer DEFAULT 0 NOT NULL,
    activa boolean DEFAULT true NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    tope_mensual integer
);


--
-- Name: salas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.salas (
    id text NOT NULL,
    studio_id text NOT NULL,
    nombre text NOT NULL,
    capacidad integer DEFAULT 10 NOT NULL,
    color text DEFAULT '#6366F1'::text
);


--
-- Name: sesiones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sesiones (
    id text NOT NULL,
    studio_id text NOT NULL,
    tipo_clase_id text,
    sala_id text,
    instructor_id text,
    inicio timestamp with time zone NOT NULL,
    fin timestamp with time zone NOT NULL,
    aforo_maximo integer DEFAULT 10 NOT NULL,
    cancelada boolean DEFAULT false,
    notas text,
    precio_puntual numeric(10,2),
    google_event_id text,
    serie_id text
);


--
-- Name: socios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.socios (
    id text NOT NULL,
    studio_id text NOT NULL,
    nombre text NOT NULL,
    apellidos text NOT NULL,
    email text NOT NULL,
    telefono text,
    nif text,
    fecha_alta timestamp with time zone DEFAULT now(),
    activo boolean DEFAULT true,
    lead_stage text,
    tags text[] DEFAULT '{}'::text[],
    aceptacion_fecha timestamp with time zone,
    aceptacion_firma text,
    aceptacion_version text,
    stripe_customer_id text,
    stripe_payment_method_id text,
    avatar text,
    referido_por text,
    fecha_nacimiento date,
    foto_url text,
    auth_user_id uuid,
    direccion text
);


--
-- Name: soporte_solicitudes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.soporte_solicitudes (
    id text NOT NULL,
    studio_id text NOT NULL,
    tipo text DEFAULT 'DUDA'::text NOT NULL,
    mensaje text NOT NULL,
    contacto text,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT soporte_solicitudes_tipo_check CHECK ((tipo = ANY (ARRAY['DUDA'::text, 'MEJORA'::text, 'BUG'::text])))
);


--
-- Name: spots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.spots (
    id text NOT NULL,
    sala_id text,
    studio_id text NOT NULL,
    numero integer NOT NULL,
    nombre text,
    fila integer DEFAULT 0,
    columna integer DEFAULT 0,
    tipo text DEFAULT 'MAT'::text,
    activo boolean DEFAULT true
);


--
-- Name: studios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.studios (
    id text NOT NULL,
    nombre text NOT NULL,
    nif text,
    razon_social text,
    direccion text,
    ciudad text,
    codigo_postal text,
    email text,
    telefono text,
    color_primario text DEFAULT '#4F46E5'::text,
    plan text DEFAULT 'BASE'::text,
    creado_en timestamp with time zone DEFAULT now(),
    owner_auth_user_id uuid,
    slug text,
    stripe_account_id text,
    avatar_admin text,
    tema_portal text DEFAULT 'original'::text,
    google_calendar_email text,
    cancelacion_ventana_horas integer DEFAULT 12,
    cancelacion_devolver_bono_tardia boolean DEFAULT false,
    reserva_exigir_plan boolean DEFAULT false,
    reserva_max_simultaneas integer,
    stripe_customer_id text,
    subscription_id text,
    subscription_status text,
    current_period_end timestamp with time zone
);


--
-- Name: suscripciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.suscripciones (
    id text NOT NULL,
    studio_id text NOT NULL,
    socio_id text,
    plan_id text,
    estado text DEFAULT 'ACTIVA'::text NOT NULL,
    fecha_inicio date NOT NULL,
    fecha_fin date,
    sesiones_restantes integer,
    stripe_subscription_id text,
    CONSTRAINT suscripciones_estado_check CHECK ((estado = ANY (ARRAY['ACTIVA'::text, 'PAUSADA'::text, 'CANCELADA'::text, 'EXPIRADA'::text])))
);


--
-- Name: tipos_clase; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tipos_clase (
    id text NOT NULL,
    studio_id text NOT NULL,
    nombre text NOT NULL,
    color text DEFAULT '#4F46E5'::text,
    duracion_minutos integer DEFAULT 60,
    descripcion text,
    nivel text DEFAULT 'TODOS'::text,
    foto_url text,
    CONSTRAINT tipos_clase_nivel_check CHECK ((nivel = ANY (ARRAY['TODOS'::text, 'PRINCIPIANTE'::text, 'MEDIO'::text, 'AVANZADO'::text])))
);


--
-- Name: usuarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usuarios (
    id text NOT NULL,
    studio_id text,
    rol text,
    nombre text,
    email text,
    telefono text,
    avatar_url text
);


--
-- Name: ventas_pos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ventas_pos (
    id text NOT NULL,
    studio_id text NOT NULL,
    socio_id text,
    items jsonb DEFAULT '[]'::jsonb NOT NULL,
    subtotal numeric(10,2) NOT NULL,
    descuento numeric(10,2) DEFAULT 0,
    total numeric(10,2) NOT NULL,
    metodo_pago text NOT NULL,
    notas text,
    realizada_en timestamp with time zone DEFAULT now(),
    CONSTRAINT ventas_pos_metodo_pago_check CHECK ((metodo_pago = ANY (ARRAY['EFECTIVO'::text, 'TARJETA'::text, 'BIZUM'::text, 'TRANSFERENCIA'::text])))
);


--
-- Name: videos_on_demand; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.videos_on_demand (
    id text NOT NULL,
    studio_id text NOT NULL,
    titulo text NOT NULL,
    descripcion text,
    categoria text NOT NULL,
    duracion_minutos integer,
    nivel text DEFAULT 'TODOS'::text,
    instructor_id text,
    vistas integer DEFAULT 0,
    likes integer DEFAULT 0,
    activo boolean DEFAULT true,
    creado_en timestamp with time zone DEFAULT now()
);


--
-- Name: achievement_definitions achievement_definitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.achievement_definitions
    ADD CONSTRAINT achievement_definitions_pkey PRIMARY KEY (id);


--
-- Name: achievement_history achievement_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.achievement_history
    ADD CONSTRAINT achievement_history_pkey PRIMARY KEY (id);


--
-- Name: achievement_progress achievement_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.achievement_progress
    ADD CONSTRAINT achievement_progress_pkey PRIMARY KEY (id);


--
-- Name: achievement_progress achievement_progress_socio_id_achievement_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.achievement_progress
    ADD CONSTRAINT achievement_progress_socio_id_achievement_id_key UNIQUE (socio_id, achievement_id);


--
-- Name: actividad_reciente actividad_reciente_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.actividad_reciente
    ADD CONSTRAINT actividad_reciente_pkey PRIMARY KEY (id);


--
-- Name: automation_logs automation_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_logs
    ADD CONSTRAINT automation_logs_pkey PRIMARY KEY (id);


--
-- Name: automation_rules automation_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_rules
    ADD CONSTRAINT automation_rules_pkey PRIMARY KEY (id);


--
-- Name: automatizaciones automatizaciones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automatizaciones
    ADD CONSTRAINT automatizaciones_pkey PRIMARY KEY (id);


--
-- Name: backups backups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.backups
    ADD CONSTRAINT backups_pkey PRIMARY KEY (id);


--
-- Name: campanas campanas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campanas
    ADD CONSTRAINT campanas_pkey PRIMARY KEY (id);


--
-- Name: challenge_definitions challenge_definitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.challenge_definitions
    ADD CONSTRAINT challenge_definitions_pkey PRIMARY KEY (id);


--
-- Name: challenge_history challenge_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.challenge_history
    ADD CONSTRAINT challenge_history_pkey PRIMARY KEY (id);


--
-- Name: challenge_progress challenge_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.challenge_progress
    ADD CONSTRAINT challenge_progress_pkey PRIMARY KEY (id);


--
-- Name: challenge_progress challenge_progress_socio_id_challenge_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.challenge_progress
    ADD CONSTRAINT challenge_progress_socio_id_challenge_id_key UNIQUE (socio_id, challenge_id);


--
-- Name: citas citas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.citas
    ADD CONSTRAINT citas_pkey PRIMARY KEY (id);


--
-- Name: codigos_descuento codigos_descuento_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.codigos_descuento
    ADD CONSTRAINT codigos_descuento_pkey PRIMARY KEY (id);


--
-- Name: credit_transactions credit_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_transactions
    ADD CONSTRAINT credit_transactions_pkey PRIMARY KEY (id);


--
-- Name: dashboard_charts dashboard_charts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dashboard_charts
    ADD CONSTRAINT dashboard_charts_pkey PRIMARY KEY (id);


--
-- Name: facturas facturas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.facturas
    ADD CONSTRAINT facturas_pkey PRIMARY KEY (id);


--
-- Name: instructores instructores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructores
    ADD CONSTRAINT instructores_pkey PRIMARY KEY (id);


--
-- Name: integracion_credenciales integracion_credenciales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integracion_credenciales
    ADD CONSTRAINT integracion_credenciales_pkey PRIMARY KEY (studio_id, provider);


--
-- Name: integraciones integraciones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integraciones
    ADD CONSTRAINT integraciones_pkey PRIMARY KEY (id);


--
-- Name: integraciones integraciones_studio_id_tipo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integraciones
    ADD CONSTRAINT integraciones_studio_id_tipo_key UNIQUE (studio_id, tipo);


--
-- Name: level_definitions level_definitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.level_definitions
    ADD CONSTRAINT level_definitions_pkey PRIMARY KEY (id);


--
-- Name: member_credits member_credits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_credits
    ADD CONSTRAINT member_credits_pkey PRIMARY KEY (socio_id);


--
-- Name: mensajes_equipo mensajes_equipo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mensajes_equipo
    ADD CONSTRAINT mensajes_equipo_pkey PRIMARY KEY (id);


--
-- Name: notas_internas notas_internas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notas_internas
    ADD CONSTRAINT notas_internas_pkey PRIMARY KEY (id);


--
-- Name: notas_progreso notas_progreso_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notas_progreso
    ADD CONSTRAINT notas_progreso_pkey PRIMARY KEY (id);


--
-- Name: notificaciones notificaciones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notificaciones
    ADD CONSTRAINT notificaciones_pkey PRIMARY KEY (id);


--
-- Name: planes_tarifa planes_tarifa_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.planes_tarifa
    ADD CONSTRAINT planes_tarifa_pkey PRIMARY KEY (id);


--
-- Name: posts_comunidad posts_comunidad_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posts_comunidad
    ADD CONSTRAINT posts_comunidad_pkey PRIMARY KEY (id);


--
-- Name: preferencias_socio preferencias_socio_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.preferencias_socio
    ADD CONSTRAINT preferencias_socio_pkey PRIMARY KEY (socio_id);


--
-- Name: productos_pos productos_pos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.productos_pos
    ADD CONSTRAINT productos_pos_pkey PRIMARY KEY (id);


--
-- Name: recibos recibos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recibos
    ADD CONSTRAINT recibos_pkey PRIMARY KEY (id);


--
-- Name: reservas reservas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservas
    ADD CONSTRAINT reservas_pkey PRIMARY KEY (id);


--
-- Name: reward_actions reward_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reward_actions
    ADD CONSTRAINT reward_actions_pkey PRIMARY KEY (id);


--
-- Name: reward_actions reward_actions_studio_id_trigger_ref_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reward_actions
    ADD CONSTRAINT reward_actions_studio_id_trigger_ref_id_key UNIQUE (studio_id, trigger, ref_id);


--
-- Name: reward_catalog reward_catalog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reward_catalog
    ADD CONSTRAINT reward_catalog_pkey PRIMARY KEY (id);


--
-- Name: reward_history reward_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reward_history
    ADD CONSTRAINT reward_history_pkey PRIMARY KEY (id);


--
-- Name: reward_redemptions reward_redemptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reward_redemptions
    ADD CONSTRAINT reward_redemptions_pkey PRIMARY KEY (id);


--
-- Name: reward_rules reward_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reward_rules
    ADD CONSTRAINT reward_rules_pkey PRIMARY KEY (id);


--
-- Name: salas salas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salas
    ADD CONSTRAINT salas_pkey PRIMARY KEY (id);


--
-- Name: sesiones sesiones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sesiones
    ADD CONSTRAINT sesiones_pkey PRIMARY KEY (id);


--
-- Name: socios socios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.socios
    ADD CONSTRAINT socios_pkey PRIMARY KEY (id);


--
-- Name: soporte_solicitudes soporte_solicitudes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.soporte_solicitudes
    ADD CONSTRAINT soporte_solicitudes_pkey PRIMARY KEY (id);


--
-- Name: spots spots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spots
    ADD CONSTRAINT spots_pkey PRIMARY KEY (id);


--
-- Name: studios studios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studios
    ADD CONSTRAINT studios_pkey PRIMARY KEY (id);


--
-- Name: studios studios_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studios
    ADD CONSTRAINT studios_slug_key UNIQUE (slug);


--
-- Name: suscripciones suscripciones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suscripciones
    ADD CONSTRAINT suscripciones_pkey PRIMARY KEY (id);


--
-- Name: tipos_clase tipos_clase_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tipos_clase
    ADD CONSTRAINT tipos_clase_pkey PRIMARY KEY (id);


--
-- Name: usuarios usuarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_pkey PRIMARY KEY (id);


--
-- Name: ventas_pos ventas_pos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ventas_pos
    ADD CONSTRAINT ventas_pos_pkey PRIMARY KEY (id);


--
-- Name: videos_on_demand videos_on_demand_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.videos_on_demand
    ADD CONSTRAINT videos_on_demand_pkey PRIMARY KEY (id);


--
-- Name: idx_achievement_definitions_studio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_achievement_definitions_studio ON public.achievement_definitions USING btree (studio_id);


--
-- Name: idx_achievement_history_studio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_achievement_history_studio ON public.achievement_history USING btree (studio_id);


--
-- Name: idx_achievement_progress_studio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_achievement_progress_studio ON public.achievement_progress USING btree (studio_id);


--
-- Name: idx_actividad_reciente_studio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_actividad_reciente_studio ON public.actividad_reciente USING btree (studio_id);


--
-- Name: idx_automation_logs_studio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_automation_logs_studio ON public.automation_logs USING btree (studio_id);


--
-- Name: idx_automation_rules_studio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_automation_rules_studio ON public.automation_rules USING btree (studio_id);


--
-- Name: idx_automatizaciones_studio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_automatizaciones_studio ON public.automatizaciones USING btree (studio_id);


--
-- Name: idx_backups_studio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_backups_studio ON public.backups USING btree (studio_id);


--
-- Name: idx_campanas_studio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campanas_studio ON public.campanas USING btree (studio_id);


--
-- Name: idx_challenge_definitions_studio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_challenge_definitions_studio ON public.challenge_definitions USING btree (studio_id);


--
-- Name: idx_challenge_history_studio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_challenge_history_studio ON public.challenge_history USING btree (studio_id);


--
-- Name: idx_challenge_progress_studio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_challenge_progress_studio ON public.challenge_progress USING btree (studio_id);


--
-- Name: idx_citas_studio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_citas_studio ON public.citas USING btree (studio_id);


--
-- Name: idx_codigos_descuento_studio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_codigos_descuento_studio ON public.codigos_descuento USING btree (studio_id);


--
-- Name: idx_credit_transactions_studio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_credit_transactions_studio ON public.credit_transactions USING btree (studio_id);


--
-- Name: idx_dashboard_charts_studio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dashboard_charts_studio ON public.dashboard_charts USING btree (studio_id);


--
-- Name: idx_facturas_studio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_facturas_studio ON public.facturas USING btree (studio_id);


--
-- Name: idx_instructores_studio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_instructores_studio ON public.instructores USING btree (studio_id);


--
-- Name: idx_integracion_credenciales_studio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_integracion_credenciales_studio ON public.integracion_credenciales USING btree (studio_id);


--
-- Name: idx_integraciones_studio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_integraciones_studio ON public.integraciones USING btree (studio_id);


--
-- Name: idx_level_definitions_studio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_level_definitions_studio ON public.level_definitions USING btree (studio_id);


--
-- Name: idx_member_credits_studio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_member_credits_studio ON public.member_credits USING btree (studio_id);


--
-- Name: idx_mensajes_equipo_studio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mensajes_equipo_studio ON public.mensajes_equipo USING btree (studio_id);


--
-- Name: idx_notas_internas_studio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notas_internas_studio ON public.notas_internas USING btree (studio_id);


--
-- Name: idx_notas_progreso_studio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notas_progreso_studio ON public.notas_progreso USING btree (studio_id);


--
-- Name: idx_notificaciones_studio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notificaciones_studio ON public.notificaciones USING btree (studio_id);


--
-- Name: idx_planes_tarifa_studio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_planes_tarifa_studio ON public.planes_tarifa USING btree (studio_id);


--
-- Name: idx_posts_comunidad_studio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_comunidad_studio ON public.posts_comunidad USING btree (studio_id);


--
-- Name: idx_preferencias_socio_studio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_preferencias_socio_studio ON public.preferencias_socio USING btree (studio_id);


--
-- Name: idx_productos_pos_studio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_productos_pos_studio ON public.productos_pos USING btree (studio_id);


--
-- Name: idx_recibos_studio_estado_venc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recibos_studio_estado_venc ON public.recibos USING btree (studio_id, estado, fecha_vencimiento);


--
-- Name: idx_recibos_studio_socio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recibos_studio_socio ON public.recibos USING btree (studio_id, socio_id);


--
-- Name: idx_reservas_sesion_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reservas_sesion_estado ON public.reservas USING btree (sesion_id, estado);


--
-- Name: idx_reservas_studio_sesion; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reservas_studio_sesion ON public.reservas USING btree (studio_id, sesion_id);


--
-- Name: idx_reservas_studio_socio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reservas_studio_socio ON public.reservas USING btree (studio_id, socio_id);


--
-- Name: idx_reward_actions_studio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reward_actions_studio ON public.reward_actions USING btree (studio_id);


--
-- Name: idx_reward_catalog_studio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reward_catalog_studio ON public.reward_catalog USING btree (studio_id);


--
-- Name: idx_reward_history_studio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reward_history_studio ON public.reward_history USING btree (studio_id);


--
-- Name: idx_reward_redemptions_studio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reward_redemptions_studio ON public.reward_redemptions USING btree (studio_id);


--
-- Name: idx_reward_rules_studio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reward_rules_studio ON public.reward_rules USING btree (studio_id);


--
-- Name: idx_salas_studio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_salas_studio ON public.salas USING btree (studio_id);


--
-- Name: idx_sesiones_serie; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sesiones_serie ON public.sesiones USING btree (serie_id) WHERE (serie_id IS NOT NULL);


--
-- Name: idx_sesiones_studio_inicio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sesiones_studio_inicio ON public.sesiones USING btree (studio_id, inicio);


--
-- Name: idx_socios_auth_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_socios_auth_user_id ON public.socios USING btree (auth_user_id);


--
-- Name: idx_socios_studio_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_socios_studio_email ON public.socios USING btree (studio_id, lower(email));


--
-- Name: idx_soporte_solicitudes_studio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_soporte_solicitudes_studio ON public.soporte_solicitudes USING btree (studio_id);


--
-- Name: idx_spots_studio_sala; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_spots_studio_sala ON public.spots USING btree (studio_id, sala_id);


--
-- Name: idx_suscripciones_studio_socio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_suscripciones_studio_socio ON public.suscripciones USING btree (studio_id, socio_id);


--
-- Name: idx_tipos_clase_studio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tipos_clase_studio ON public.tipos_clase USING btree (studio_id);


--
-- Name: idx_ventas_pos_studio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ventas_pos_studio ON public.ventas_pos USING btree (studio_id);


--
-- Name: idx_videos_on_demand_studio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_videos_on_demand_studio ON public.videos_on_demand USING btree (studio_id);


--
-- Name: uq_reserva_activa_socio_sesion; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_reserva_activa_socio_sesion ON public.reservas USING btree (sesion_id, socio_id) WHERE (estado = ANY (ARRAY['CONFIRMADA'::text, 'LISTA_ESPERA'::text, 'ASISTIDA'::text]));


--
-- Name: uq_reserva_spot_activo; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_reserva_spot_activo ON public.reservas USING btree (sesion_id, spot_id) WHERE ((spot_id IS NOT NULL) AND (estado = ANY (ARRAY['CONFIRMADA'::text, 'ASISTIDA'::text])));


--
-- Name: achievement_definitions achievement_definitions_studio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.achievement_definitions
    ADD CONSTRAINT achievement_definitions_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES public.studios(id) ON DELETE CASCADE;


--
-- Name: achievement_history achievement_history_achievement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.achievement_history
    ADD CONSTRAINT achievement_history_achievement_id_fkey FOREIGN KEY (achievement_id) REFERENCES public.achievement_definitions(id) ON DELETE CASCADE;


--
-- Name: achievement_history achievement_history_socio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.achievement_history
    ADD CONSTRAINT achievement_history_socio_id_fkey FOREIGN KEY (socio_id) REFERENCES public.socios(id) ON DELETE CASCADE;


--
-- Name: achievement_history achievement_history_studio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.achievement_history
    ADD CONSTRAINT achievement_history_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES public.studios(id) ON DELETE CASCADE;


--
-- Name: achievement_progress achievement_progress_achievement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.achievement_progress
    ADD CONSTRAINT achievement_progress_achievement_id_fkey FOREIGN KEY (achievement_id) REFERENCES public.achievement_definitions(id) ON DELETE CASCADE;


--
-- Name: achievement_progress achievement_progress_socio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.achievement_progress
    ADD CONSTRAINT achievement_progress_socio_id_fkey FOREIGN KEY (socio_id) REFERENCES public.socios(id) ON DELETE CASCADE;


--
-- Name: achievement_progress achievement_progress_studio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.achievement_progress
    ADD CONSTRAINT achievement_progress_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES public.studios(id) ON DELETE CASCADE;


--
-- Name: actividad_reciente actividad_reciente_socio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.actividad_reciente
    ADD CONSTRAINT actividad_reciente_socio_id_fkey FOREIGN KEY (socio_id) REFERENCES public.socios(id);


--
-- Name: actividad_reciente actividad_reciente_studio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.actividad_reciente
    ADD CONSTRAINT actividad_reciente_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES public.studios(id) ON DELETE CASCADE;


--
-- Name: automation_logs automation_logs_rule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_logs
    ADD CONSTRAINT automation_logs_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES public.automation_rules(id);


--
-- Name: automation_logs automation_logs_studio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_logs
    ADD CONSTRAINT automation_logs_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES public.studios(id) ON DELETE CASCADE;


--
-- Name: automation_rules automation_rules_studio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_rules
    ADD CONSTRAINT automation_rules_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES public.studios(id) ON DELETE CASCADE;


--
-- Name: automatizaciones automatizaciones_studio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automatizaciones
    ADD CONSTRAINT automatizaciones_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES public.studios(id) ON DELETE CASCADE;


--
-- Name: backups backups_studio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.backups
    ADD CONSTRAINT backups_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES public.studios(id) ON DELETE CASCADE;


--
-- Name: campanas campanas_studio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campanas
    ADD CONSTRAINT campanas_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES public.studios(id) ON DELETE CASCADE;


--
-- Name: challenge_definitions challenge_definitions_studio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.challenge_definitions
    ADD CONSTRAINT challenge_definitions_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES public.studios(id) ON DELETE CASCADE;


--
-- Name: challenge_history challenge_history_challenge_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.challenge_history
    ADD CONSTRAINT challenge_history_challenge_id_fkey FOREIGN KEY (challenge_id) REFERENCES public.challenge_definitions(id) ON DELETE CASCADE;


--
-- Name: challenge_history challenge_history_socio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.challenge_history
    ADD CONSTRAINT challenge_history_socio_id_fkey FOREIGN KEY (socio_id) REFERENCES public.socios(id) ON DELETE CASCADE;


--
-- Name: challenge_history challenge_history_studio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.challenge_history
    ADD CONSTRAINT challenge_history_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES public.studios(id) ON DELETE CASCADE;


--
-- Name: challenge_progress challenge_progress_challenge_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.challenge_progress
    ADD CONSTRAINT challenge_progress_challenge_id_fkey FOREIGN KEY (challenge_id) REFERENCES public.challenge_definitions(id) ON DELETE CASCADE;


--
-- Name: challenge_progress challenge_progress_socio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.challenge_progress
    ADD CONSTRAINT challenge_progress_socio_id_fkey FOREIGN KEY (socio_id) REFERENCES public.socios(id) ON DELETE CASCADE;


--
-- Name: challenge_progress challenge_progress_studio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.challenge_progress
    ADD CONSTRAINT challenge_progress_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES public.studios(id) ON DELETE CASCADE;


--
-- Name: citas citas_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.citas
    ADD CONSTRAINT citas_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES public.instructores(id);


--
-- Name: citas citas_socio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.citas
    ADD CONSTRAINT citas_socio_id_fkey FOREIGN KEY (socio_id) REFERENCES public.socios(id) ON DELETE CASCADE;


--
-- Name: citas citas_studio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.citas
    ADD CONSTRAINT citas_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES public.studios(id) ON DELETE CASCADE;


--
-- Name: codigos_descuento codigos_descuento_studio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.codigos_descuento
    ADD CONSTRAINT codigos_descuento_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES public.studios(id) ON DELETE CASCADE;


--
-- Name: credit_transactions credit_transactions_socio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_transactions
    ADD CONSTRAINT credit_transactions_socio_id_fkey FOREIGN KEY (socio_id) REFERENCES public.socios(id) ON DELETE CASCADE;


--
-- Name: credit_transactions credit_transactions_studio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_transactions
    ADD CONSTRAINT credit_transactions_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES public.studios(id) ON DELETE CASCADE;


--
-- Name: dashboard_charts dashboard_charts_studio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dashboard_charts
    ADD CONSTRAINT dashboard_charts_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES public.studios(id) ON DELETE CASCADE;


--
-- Name: facturas facturas_recibo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.facturas
    ADD CONSTRAINT facturas_recibo_id_fkey FOREIGN KEY (recibo_id) REFERENCES public.recibos(id);


--
-- Name: facturas facturas_studio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.facturas
    ADD CONSTRAINT facturas_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES public.studios(id) ON DELETE CASCADE;


--
-- Name: instructores instructores_auth_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructores
    ADD CONSTRAINT instructores_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: instructores instructores_studio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructores
    ADD CONSTRAINT instructores_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES public.studios(id) ON DELETE CASCADE;


--
-- Name: integracion_credenciales integracion_credenciales_studio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integracion_credenciales
    ADD CONSTRAINT integracion_credenciales_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES public.studios(id) ON DELETE CASCADE;


--
-- Name: integraciones integraciones_studio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integraciones
    ADD CONSTRAINT integraciones_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES public.studios(id) ON DELETE CASCADE;


--
-- Name: level_definitions level_definitions_studio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.level_definitions
    ADD CONSTRAINT level_definitions_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES public.studios(id) ON DELETE CASCADE;


--
-- Name: member_credits member_credits_socio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_credits
    ADD CONSTRAINT member_credits_socio_id_fkey FOREIGN KEY (socio_id) REFERENCES public.socios(id) ON DELETE CASCADE;


--
-- Name: member_credits member_credits_studio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_credits
    ADD CONSTRAINT member_credits_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES public.studios(id) ON DELETE CASCADE;


--
-- Name: mensajes_equipo mensajes_equipo_autor_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mensajes_equipo
    ADD CONSTRAINT mensajes_equipo_autor_instructor_id_fkey FOREIGN KEY (autor_instructor_id) REFERENCES public.instructores(id) ON DELETE SET NULL;


--
-- Name: mensajes_equipo mensajes_equipo_studio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mensajes_equipo
    ADD CONSTRAINT mensajes_equipo_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES public.studios(id) ON DELETE CASCADE;


--
-- Name: notas_internas notas_internas_socio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notas_internas
    ADD CONSTRAINT notas_internas_socio_id_fkey FOREIGN KEY (socio_id) REFERENCES public.socios(id) ON DELETE CASCADE;


--
-- Name: notas_internas notas_internas_studio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notas_internas
    ADD CONSTRAINT notas_internas_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES public.studios(id) ON DELETE CASCADE;


--
-- Name: notas_progreso notas_progreso_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notas_progreso
    ADD CONSTRAINT notas_progreso_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES public.instructores(id);


--
-- Name: notas_progreso notas_progreso_socio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notas_progreso
    ADD CONSTRAINT notas_progreso_socio_id_fkey FOREIGN KEY (socio_id) REFERENCES public.socios(id) ON DELETE CASCADE;


--
-- Name: notas_progreso notas_progreso_studio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notas_progreso
    ADD CONSTRAINT notas_progreso_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES public.studios(id) ON DELETE CASCADE;


--
-- Name: notificaciones notificaciones_studio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notificaciones
    ADD CONSTRAINT notificaciones_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES public.studios(id) ON DELETE CASCADE;


--
-- Name: planes_tarifa planes_tarifa_studio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.planes_tarifa
    ADD CONSTRAINT planes_tarifa_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES public.studios(id) ON DELETE CASCADE;


--
-- Name: posts_comunidad posts_comunidad_studio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posts_comunidad
    ADD CONSTRAINT posts_comunidad_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES public.studios(id) ON DELETE CASCADE;


--
-- Name: preferencias_socio preferencias_socio_instructor_favorito_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.preferencias_socio
    ADD CONSTRAINT preferencias_socio_instructor_favorito_id_fkey FOREIGN KEY (instructor_favorito_id) REFERENCES public.instructores(id) ON DELETE SET NULL;


--
-- Name: preferencias_socio preferencias_socio_socio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.preferencias_socio
    ADD CONSTRAINT preferencias_socio_socio_id_fkey FOREIGN KEY (socio_id) REFERENCES public.socios(id) ON DELETE CASCADE;


--
-- Name: preferencias_socio preferencias_socio_studio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.preferencias_socio
    ADD CONSTRAINT preferencias_socio_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES public.studios(id) ON DELETE CASCADE;


--
-- Name: productos_pos productos_pos_studio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.productos_pos
    ADD CONSTRAINT productos_pos_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES public.studios(id) ON DELETE CASCADE;


--
-- Name: recibos recibos_socio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recibos
    ADD CONSTRAINT recibos_socio_id_fkey FOREIGN KEY (socio_id) REFERENCES public.socios(id) ON DELETE CASCADE;


--
-- Name: recibos recibos_studio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recibos
    ADD CONSTRAINT recibos_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES public.studios(id) ON DELETE CASCADE;


--
-- Name: recibos recibos_suscripcion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recibos
    ADD CONSTRAINT recibos_suscripcion_id_fkey FOREIGN KEY (suscripcion_id) REFERENCES public.suscripciones(id);


--
-- Name: reservas reservas_sesion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservas
    ADD CONSTRAINT reservas_sesion_id_fkey FOREIGN KEY (sesion_id) REFERENCES public.sesiones(id) ON DELETE CASCADE;


--
-- Name: reservas reservas_socio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservas
    ADD CONSTRAINT reservas_socio_id_fkey FOREIGN KEY (socio_id) REFERENCES public.socios(id) ON DELETE CASCADE;


--
-- Name: reservas reservas_spot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservas
    ADD CONSTRAINT reservas_spot_id_fkey FOREIGN KEY (spot_id) REFERENCES public.spots(id);


--
-- Name: reservas reservas_studio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservas
    ADD CONSTRAINT reservas_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES public.studios(id) ON DELETE CASCADE;


--
-- Name: reward_actions reward_actions_socio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reward_actions
    ADD CONSTRAINT reward_actions_socio_id_fkey FOREIGN KEY (socio_id) REFERENCES public.socios(id) ON DELETE CASCADE;


--
-- Name: reward_actions reward_actions_studio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reward_actions
    ADD CONSTRAINT reward_actions_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES public.studios(id) ON DELETE CASCADE;


--
-- Name: reward_catalog reward_catalog_studio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reward_catalog
    ADD CONSTRAINT reward_catalog_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES public.studios(id) ON DELETE CASCADE;


--
-- Name: reward_history reward_history_action_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reward_history
    ADD CONSTRAINT reward_history_action_id_fkey FOREIGN KEY (action_id) REFERENCES public.reward_actions(id) ON DELETE SET NULL;


--
-- Name: reward_history reward_history_rule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reward_history
    ADD CONSTRAINT reward_history_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES public.reward_rules(id) ON DELETE SET NULL;


--
-- Name: reward_history reward_history_socio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reward_history
    ADD CONSTRAINT reward_history_socio_id_fkey FOREIGN KEY (socio_id) REFERENCES public.socios(id) ON DELETE CASCADE;


--
-- Name: reward_history reward_history_studio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reward_history
    ADD CONSTRAINT reward_history_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES public.studios(id) ON DELETE CASCADE;


--
-- Name: reward_redemptions reward_redemptions_catalog_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reward_redemptions
    ADD CONSTRAINT reward_redemptions_catalog_item_id_fkey FOREIGN KEY (catalog_item_id) REFERENCES public.reward_catalog(id) ON DELETE CASCADE;


--
-- Name: reward_redemptions reward_redemptions_socio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reward_redemptions
    ADD CONSTRAINT reward_redemptions_socio_id_fkey FOREIGN KEY (socio_id) REFERENCES public.socios(id) ON DELETE CASCADE;


--
-- Name: reward_redemptions reward_redemptions_studio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reward_redemptions
    ADD CONSTRAINT reward_redemptions_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES public.studios(id) ON DELETE CASCADE;


--
-- Name: reward_rules reward_rules_studio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reward_rules
    ADD CONSTRAINT reward_rules_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES public.studios(id) ON DELETE CASCADE;


--
-- Name: salas salas_studio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salas
    ADD CONSTRAINT salas_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES public.studios(id) ON DELETE CASCADE;


--
-- Name: sesiones sesiones_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sesiones
    ADD CONSTRAINT sesiones_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES public.instructores(id);


--
-- Name: sesiones sesiones_sala_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sesiones
    ADD CONSTRAINT sesiones_sala_id_fkey FOREIGN KEY (sala_id) REFERENCES public.salas(id);


--
-- Name: sesiones sesiones_studio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sesiones
    ADD CONSTRAINT sesiones_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES public.studios(id) ON DELETE CASCADE;


--
-- Name: sesiones sesiones_tipo_clase_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sesiones
    ADD CONSTRAINT sesiones_tipo_clase_id_fkey FOREIGN KEY (tipo_clase_id) REFERENCES public.tipos_clase(id);


--
-- Name: socios socios_auth_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.socios
    ADD CONSTRAINT socios_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: socios socios_referido_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.socios
    ADD CONSTRAINT socios_referido_por_fkey FOREIGN KEY (referido_por) REFERENCES public.socios(id) ON DELETE SET NULL;


--
-- Name: socios socios_studio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.socios
    ADD CONSTRAINT socios_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES public.studios(id) ON DELETE CASCADE;


--
-- Name: soporte_solicitudes soporte_solicitudes_studio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.soporte_solicitudes
    ADD CONSTRAINT soporte_solicitudes_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES public.studios(id) ON DELETE CASCADE;


--
-- Name: spots spots_sala_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spots
    ADD CONSTRAINT spots_sala_id_fkey FOREIGN KEY (sala_id) REFERENCES public.salas(id) ON DELETE CASCADE;


--
-- Name: spots spots_studio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spots
    ADD CONSTRAINT spots_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES public.studios(id) ON DELETE CASCADE;


--
-- Name: studios studios_owner_auth_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studios
    ADD CONSTRAINT studios_owner_auth_user_id_fkey FOREIGN KEY (owner_auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: suscripciones suscripciones_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suscripciones
    ADD CONSTRAINT suscripciones_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.planes_tarifa(id);


--
-- Name: suscripciones suscripciones_socio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suscripciones
    ADD CONSTRAINT suscripciones_socio_id_fkey FOREIGN KEY (socio_id) REFERENCES public.socios(id) ON DELETE CASCADE;


--
-- Name: suscripciones suscripciones_studio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suscripciones
    ADD CONSTRAINT suscripciones_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES public.studios(id) ON DELETE CASCADE;


--
-- Name: tipos_clase tipos_clase_studio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tipos_clase
    ADD CONSTRAINT tipos_clase_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES public.studios(id) ON DELETE CASCADE;


--
-- Name: usuarios usuarios_studio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES public.studios(id) ON DELETE CASCADE;


--
-- Name: ventas_pos ventas_pos_socio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ventas_pos
    ADD CONSTRAINT ventas_pos_socio_id_fkey FOREIGN KEY (socio_id) REFERENCES public.socios(id);


--
-- Name: ventas_pos ventas_pos_studio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ventas_pos
    ADD CONSTRAINT ventas_pos_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES public.studios(id) ON DELETE CASCADE;


--
-- Name: videos_on_demand videos_on_demand_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.videos_on_demand
    ADD CONSTRAINT videos_on_demand_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES public.instructores(id);


--
-- Name: videos_on_demand videos_on_demand_studio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.videos_on_demand
    ADD CONSTRAINT videos_on_demand_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES public.studios(id) ON DELETE CASCADE;


--
-- Name: achievement_definitions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.achievement_definitions ENABLE ROW LEVEL SECURITY;

--
-- Name: achievement_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.achievement_history ENABLE ROW LEVEL SECURITY;

--
-- Name: achievement_progress; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.achievement_progress ENABLE ROW LEVEL SECURITY;

--
-- Name: actividad_reciente; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.actividad_reciente ENABLE ROW LEVEL SECURITY;

--
-- Name: achievement_definitions admin_achievement_definitions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_achievement_definitions ON public.achievement_definitions TO authenticated USING ((studio_id = public.current_studio_id())) WITH CHECK ((studio_id = public.current_studio_id()));


--
-- Name: achievement_history admin_achievement_history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_achievement_history ON public.achievement_history TO authenticated USING ((studio_id = public.current_studio_id())) WITH CHECK ((studio_id = public.current_studio_id()));


--
-- Name: achievement_progress admin_achievement_progress; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_achievement_progress ON public.achievement_progress TO authenticated USING ((studio_id = public.current_studio_id())) WITH CHECK ((studio_id = public.current_studio_id()));


--
-- Name: challenge_definitions admin_challenge_definitions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_challenge_definitions ON public.challenge_definitions TO authenticated USING ((studio_id = public.current_studio_id())) WITH CHECK ((studio_id = public.current_studio_id()));


--
-- Name: challenge_history admin_challenge_history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_challenge_history ON public.challenge_history TO authenticated USING ((studio_id = public.current_studio_id())) WITH CHECK ((studio_id = public.current_studio_id()));


--
-- Name: challenge_progress admin_challenge_progress; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_challenge_progress ON public.challenge_progress TO authenticated USING ((studio_id = public.current_studio_id())) WITH CHECK ((studio_id = public.current_studio_id()));


--
-- Name: citas admin_citas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_citas ON public.citas TO authenticated USING ((studio_id = public.current_studio_id())) WITH CHECK ((studio_id = public.current_studio_id()));


--
-- Name: credit_transactions admin_credit_transactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_credit_transactions ON public.credit_transactions TO authenticated USING ((studio_id = public.current_studio_id())) WITH CHECK ((studio_id = public.current_studio_id()));


--
-- Name: dashboard_charts admin_dashboard_charts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_dashboard_charts ON public.dashboard_charts TO authenticated USING ((studio_id = public.current_studio_id())) WITH CHECK ((studio_id = public.current_studio_id()));


--
-- Name: facturas admin_facturas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_facturas ON public.facturas TO authenticated USING ((studio_id = public.current_studio_id())) WITH CHECK ((studio_id = public.current_studio_id()));


--
-- Name: level_definitions admin_level_definitions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_level_definitions ON public.level_definitions TO authenticated USING ((studio_id = public.current_studio_id())) WITH CHECK ((studio_id = public.current_studio_id()));


--
-- Name: member_credits admin_member_credits; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_member_credits ON public.member_credits TO authenticated USING ((studio_id = public.current_studio_id())) WITH CHECK ((studio_id = public.current_studio_id()));


--
-- Name: mensajes_equipo admin_mensajes_equipo; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_mensajes_equipo ON public.mensajes_equipo TO authenticated USING ((studio_id = public.current_studio_id())) WITH CHECK ((studio_id = public.current_studio_id()));


--
-- Name: notas_progreso admin_notas_progreso; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_notas_progreso ON public.notas_progreso TO authenticated USING ((studio_id = public.current_studio_id())) WITH CHECK ((studio_id = public.current_studio_id()));


--
-- Name: notificaciones admin_notificaciones; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_notificaciones ON public.notificaciones TO authenticated USING ((studio_id = public.current_studio_id())) WITH CHECK ((studio_id = public.current_studio_id()));


--
-- Name: planes_tarifa admin_planes_tarifa; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_planes_tarifa ON public.planes_tarifa TO authenticated USING ((studio_id = public.current_studio_id())) WITH CHECK ((studio_id = public.current_studio_id()));


--
-- Name: posts_comunidad admin_posts_comunidad; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_posts_comunidad ON public.posts_comunidad TO authenticated USING ((studio_id = public.current_studio_id())) WITH CHECK ((studio_id = public.current_studio_id()));


--
-- Name: preferencias_socio admin_preferencias_socio; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_preferencias_socio ON public.preferencias_socio TO authenticated USING ((studio_id = public.current_studio_id())) WITH CHECK ((studio_id = public.current_studio_id()));


--
-- Name: productos_pos admin_productos_pos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_productos_pos ON public.productos_pos TO authenticated USING ((studio_id = public.current_studio_id())) WITH CHECK ((studio_id = public.current_studio_id()));


--
-- Name: backups admin_read_backups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_read_backups ON public.backups FOR SELECT TO authenticated USING (((public.current_rol() = 'PROPIETARIO'::text) AND (studio_id = public.current_studio_id())));


--
-- Name: recibos admin_recibos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_recibos ON public.recibos TO authenticated USING ((studio_id = public.current_studio_id())) WITH CHECK ((studio_id = public.current_studio_id()));


--
-- Name: reservas admin_reservas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_reservas ON public.reservas TO authenticated USING ((studio_id = public.current_studio_id())) WITH CHECK ((studio_id = public.current_studio_id()));


--
-- Name: reward_actions admin_reward_actions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_reward_actions ON public.reward_actions TO authenticated USING ((studio_id = public.current_studio_id())) WITH CHECK ((studio_id = public.current_studio_id()));


--
-- Name: reward_catalog admin_reward_catalog; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_reward_catalog ON public.reward_catalog TO authenticated USING ((studio_id = public.current_studio_id())) WITH CHECK ((studio_id = public.current_studio_id()));


--
-- Name: reward_history admin_reward_history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_reward_history ON public.reward_history TO authenticated USING ((studio_id = public.current_studio_id())) WITH CHECK ((studio_id = public.current_studio_id()));


--
-- Name: reward_redemptions admin_reward_redemptions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_reward_redemptions ON public.reward_redemptions TO authenticated USING ((studio_id = public.current_studio_id())) WITH CHECK ((studio_id = public.current_studio_id()));


--
-- Name: reward_rules admin_reward_rules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_reward_rules ON public.reward_rules TO authenticated USING ((studio_id = public.current_studio_id())) WITH CHECK ((studio_id = public.current_studio_id()));


--
-- Name: salas admin_salas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_salas ON public.salas TO authenticated USING ((studio_id = public.current_studio_id())) WITH CHECK ((studio_id = public.current_studio_id()));


--
-- Name: sesiones admin_sesiones; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_sesiones ON public.sesiones TO authenticated USING ((studio_id = public.current_studio_id())) WITH CHECK ((studio_id = public.current_studio_id()));


--
-- Name: socios admin_socios; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_socios ON public.socios TO authenticated USING ((studio_id = public.current_studio_id())) WITH CHECK ((studio_id = public.current_studio_id()));


--
-- Name: soporte_solicitudes admin_soporte_solicitudes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_soporte_solicitudes ON public.soporte_solicitudes TO authenticated USING ((studio_id = public.current_studio_id())) WITH CHECK ((studio_id = public.current_studio_id()));


--
-- Name: spots admin_spots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_spots ON public.spots TO authenticated USING ((studio_id = public.current_studio_id())) WITH CHECK ((studio_id = public.current_studio_id()));


--
-- Name: suscripciones admin_suscripciones; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_suscripciones ON public.suscripciones TO authenticated USING ((studio_id = public.current_studio_id())) WITH CHECK ((studio_id = public.current_studio_id()));


--
-- Name: tipos_clase admin_tipos_clase; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_tipos_clase ON public.tipos_clase TO authenticated USING ((studio_id = public.current_studio_id())) WITH CHECK ((studio_id = public.current_studio_id()));


--
-- Name: usuarios admin_usuarios; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_usuarios ON public.usuarios TO authenticated USING ((studio_id = public.current_studio_id())) WITH CHECK ((studio_id = public.current_studio_id()));


--
-- Name: ventas_pos admin_ventas_pos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_ventas_pos ON public.ventas_pos TO authenticated USING ((studio_id = public.current_studio_id())) WITH CHECK ((studio_id = public.current_studio_id()));


--
-- Name: videos_on_demand admin_videos_on_demand; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_videos_on_demand ON public.videos_on_demand TO authenticated USING ((studio_id = public.current_studio_id())) WITH CHECK ((studio_id = public.current_studio_id()));


--
-- Name: automation_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.automation_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: automation_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: automatizaciones; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.automatizaciones ENABLE ROW LEVEL SECURITY;

--
-- Name: backups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.backups ENABLE ROW LEVEL SECURITY;

--
-- Name: campanas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campanas ENABLE ROW LEVEL SECURITY;

--
-- Name: challenge_definitions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.challenge_definitions ENABLE ROW LEVEL SECURITY;

--
-- Name: challenge_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.challenge_history ENABLE ROW LEVEL SECURITY;

--
-- Name: challenge_progress; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.challenge_progress ENABLE ROW LEVEL SECURITY;

--
-- Name: citas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.citas ENABLE ROW LEVEL SECURITY;

--
-- Name: codigos_descuento; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.codigos_descuento ENABLE ROW LEVEL SECURITY;

--
-- Name: credit_transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: dashboard_charts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dashboard_charts ENABLE ROW LEVEL SECURITY;

--
-- Name: facturas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.facturas ENABLE ROW LEVEL SECURITY;

--
-- Name: studios insert_studios; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY insert_studios ON public.studios FOR INSERT TO authenticated WITH CHECK ((owner_auth_user_id = auth.uid()));


--
-- Name: instructores; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instructores ENABLE ROW LEVEL SECURITY;

--
-- Name: integracion_credenciales; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.integracion_credenciales ENABLE ROW LEVEL SECURITY;

--
-- Name: integraciones; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.integraciones ENABLE ROW LEVEL SECURITY;

--
-- Name: level_definitions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.level_definitions ENABLE ROW LEVEL SECURITY;

--
-- Name: member_credits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.member_credits ENABLE ROW LEVEL SECURITY;

--
-- Name: mensajes_equipo; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mensajes_equipo ENABLE ROW LEVEL SECURITY;

--
-- Name: notas_internas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notas_internas ENABLE ROW LEVEL SECURITY;

--
-- Name: notas_progreso; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notas_progreso ENABLE ROW LEVEL SECURITY;

--
-- Name: notificaciones; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notificaciones ENABLE ROW LEVEL SECURITY;

--
-- Name: actividad_reciente owner_actividad_reciente; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_actividad_reciente ON public.actividad_reciente TO authenticated USING (((public.current_rol() = 'PROPIETARIO'::text) AND (studio_id = public.current_studio_id()))) WITH CHECK (((public.current_rol() = 'PROPIETARIO'::text) AND (studio_id = public.current_studio_id())));


--
-- Name: automation_logs owner_automation_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_automation_logs ON public.automation_logs TO authenticated USING (((public.current_rol() = 'PROPIETARIO'::text) AND (studio_id = public.current_studio_id()))) WITH CHECK (((public.current_rol() = 'PROPIETARIO'::text) AND (studio_id = public.current_studio_id())));


--
-- Name: automation_rules owner_automation_rules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_automation_rules ON public.automation_rules TO authenticated USING (((public.current_rol() = 'PROPIETARIO'::text) AND (studio_id = public.current_studio_id()))) WITH CHECK (((public.current_rol() = 'PROPIETARIO'::text) AND (studio_id = public.current_studio_id())));


--
-- Name: automatizaciones owner_automatizaciones; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_automatizaciones ON public.automatizaciones TO authenticated USING (((public.current_rol() = 'PROPIETARIO'::text) AND (studio_id = public.current_studio_id()))) WITH CHECK (((public.current_rol() = 'PROPIETARIO'::text) AND (studio_id = public.current_studio_id())));


--
-- Name: campanas owner_campanas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_campanas ON public.campanas TO authenticated USING (((public.current_rol() = 'PROPIETARIO'::text) AND (studio_id = public.current_studio_id()))) WITH CHECK (((public.current_rol() = 'PROPIETARIO'::text) AND (studio_id = public.current_studio_id())));


--
-- Name: codigos_descuento owner_codigos_descuento; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_codigos_descuento ON public.codigos_descuento TO authenticated USING (((public.current_rol() = 'PROPIETARIO'::text) AND (studio_id = public.current_studio_id()))) WITH CHECK (((public.current_rol() = 'PROPIETARIO'::text) AND (studio_id = public.current_studio_id())));


--
-- Name: integraciones owner_integraciones; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_integraciones ON public.integraciones TO authenticated USING (((public.current_rol() = 'PROPIETARIO'::text) AND (studio_id = public.current_studio_id()))) WITH CHECK (((public.current_rol() = 'PROPIETARIO'::text) AND (studio_id = public.current_studio_id())));


--
-- Name: notas_internas owner_notas_internas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_notas_internas ON public.notas_internas TO authenticated USING (((public.current_rol() = 'PROPIETARIO'::text) AND (studio_id = public.current_studio_id()))) WITH CHECK (((public.current_rol() = 'PROPIETARIO'::text) AND (studio_id = public.current_studio_id())));


--
-- Name: studios owner_studios; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_studios ON public.studios TO authenticated USING (((public.current_rol() = 'PROPIETARIO'::text) AND (id = public.current_studio_id()))) WITH CHECK (((public.current_rol() = 'PROPIETARIO'::text) AND (id = public.current_studio_id())));


--
-- Name: instructores owner_write_instructores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_write_instructores ON public.instructores TO authenticated USING (((public.current_rol() = 'PROPIETARIO'::text) AND (studio_id = public.current_studio_id()))) WITH CHECK (((public.current_rol() = 'PROPIETARIO'::text) AND (studio_id = public.current_studio_id())));


--
-- Name: planes_tarifa; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.planes_tarifa ENABLE ROW LEVEL SECURITY;

--
-- Name: posts_comunidad; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.posts_comunidad ENABLE ROW LEVEL SECURITY;

--
-- Name: preferencias_socio; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.preferencias_socio ENABLE ROW LEVEL SECURITY;

--
-- Name: productos_pos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.productos_pos ENABLE ROW LEVEL SECURITY;

--
-- Name: achievement_definitions public_read_achievement_definitions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY public_read_achievement_definitions ON public.achievement_definitions FOR SELECT TO anon USING (true);


--
-- Name: challenge_definitions public_read_challenge_definitions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY public_read_challenge_definitions ON public.challenge_definitions FOR SELECT TO anon USING (true);


--
-- Name: level_definitions public_read_level_definitions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY public_read_level_definitions ON public.level_definitions FOR SELECT TO anon USING (true);


--
-- Name: planes_tarifa public_read_planes_tarifa; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY public_read_planes_tarifa ON public.planes_tarifa FOR SELECT TO anon USING (true);


--
-- Name: reward_catalog public_read_reward_catalog; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY public_read_reward_catalog ON public.reward_catalog FOR SELECT TO anon USING (true);


--
-- Name: reward_rules public_read_reward_rules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY public_read_reward_rules ON public.reward_rules FOR SELECT TO anon USING (true);


--
-- Name: salas public_read_salas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY public_read_salas ON public.salas FOR SELECT TO anon USING (true);


--
-- Name: sesiones public_read_sesiones; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY public_read_sesiones ON public.sesiones FOR SELECT TO anon USING (true);


--
-- Name: spots public_read_spots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY public_read_spots ON public.spots FOR SELECT TO anon USING (true);


--
-- Name: studios public_read_studios; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY public_read_studios ON public.studios FOR SELECT USING (true);


--
-- Name: tipos_clase public_read_tipos_clase; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY public_read_tipos_clase ON public.tipos_clase FOR SELECT TO anon USING (true);


--
-- Name: videos_on_demand public_read_videos_on_demand; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY public_read_videos_on_demand ON public.videos_on_demand FOR SELECT TO anon USING (true);


--
-- Name: instructores read_instructores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY read_instructores ON public.instructores FOR SELECT TO authenticated USING ((studio_id = public.current_studio_id()));


--
-- Name: recibos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.recibos ENABLE ROW LEVEL SECURITY;

--
-- Name: reservas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reservas ENABLE ROW LEVEL SECURITY;

--
-- Name: reward_actions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reward_actions ENABLE ROW LEVEL SECURITY;

--
-- Name: reward_catalog; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reward_catalog ENABLE ROW LEVEL SECURITY;

--
-- Name: reward_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reward_history ENABLE ROW LEVEL SECURITY;

--
-- Name: reward_redemptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reward_redemptions ENABLE ROW LEVEL SECURITY;

--
-- Name: reward_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reward_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: salas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.salas ENABLE ROW LEVEL SECURITY;

--
-- Name: instructores self_claim_instructores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY self_claim_instructores ON public.instructores FOR UPDATE TO authenticated USING (((auth_user_id IS NULL) AND (email = (auth.jwt() ->> 'email'::text)))) WITH CHECK ((auth_user_id = auth.uid()));


--
-- Name: sesiones; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sesiones ENABLE ROW LEVEL SECURITY;

--
-- Name: socios; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.socios ENABLE ROW LEVEL SECURITY;

--
-- Name: soporte_solicitudes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.soporte_solicitudes ENABLE ROW LEVEL SECURITY;

--
-- Name: spots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.spots ENABLE ROW LEVEL SECURITY;

--
-- Name: studios; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.studios ENABLE ROW LEVEL SECURITY;

--
-- Name: suscripciones; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.suscripciones ENABLE ROW LEVEL SECURITY;

--
-- Name: tipos_clase; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tipos_clase ENABLE ROW LEVEL SECURITY;

--
-- Name: usuarios; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;

--
-- Name: ventas_pos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ventas_pos ENABLE ROW LEVEL SECURITY;

--
-- Name: videos_on_demand; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.videos_on_demand ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION ajustar_creditos(p_socio_id text, p_studio_id text, p_delta_saldo integer, p_delta_ganado integer, p_delta_canjeado integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.ajustar_creditos(p_socio_id text, p_studio_id text, p_delta_saldo integer, p_delta_ganado integer, p_delta_canjeado integer) TO anon;
GRANT ALL ON FUNCTION public.ajustar_creditos(p_socio_id text, p_studio_id text, p_delta_saldo integer, p_delta_ganado integer, p_delta_canjeado integer) TO authenticated;
GRANT ALL ON FUNCTION public.ajustar_creditos(p_socio_id text, p_studio_id text, p_delta_saldo integer, p_delta_ganado integer, p_delta_canjeado integer) TO service_role;


--
-- Name: FUNCTION cancelar_reserva_plaza(p_studio_id text, p_reserva_id text, p_socio_id text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.cancelar_reserva_plaza(p_studio_id text, p_reserva_id text, p_socio_id text) TO anon;
GRANT ALL ON FUNCTION public.cancelar_reserva_plaza(p_studio_id text, p_reserva_id text, p_socio_id text) TO authenticated;
GRANT ALL ON FUNCTION public.cancelar_reserva_plaza(p_studio_id text, p_reserva_id text, p_socio_id text) TO service_role;


--
-- Name: TABLE reservas; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.reservas TO anon;
GRANT ALL ON TABLE public.reservas TO authenticated;
GRANT ALL ON TABLE public.reservas TO service_role;


--
-- Name: FUNCTION crear_reserva_atomica(p_id text, p_studio_id text, p_sesion_id text, p_socio_id text, p_spot_id text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.crear_reserva_atomica(p_id text, p_studio_id text, p_sesion_id text, p_socio_id text, p_spot_id text) TO anon;
GRANT ALL ON FUNCTION public.crear_reserva_atomica(p_id text, p_studio_id text, p_sesion_id text, p_socio_id text, p_spot_id text) TO authenticated;
GRANT ALL ON FUNCTION public.crear_reserva_atomica(p_id text, p_studio_id text, p_sesion_id text, p_socio_id text, p_spot_id text) TO service_role;


--
-- Name: FUNCTION current_rol(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.current_rol() TO anon;
GRANT ALL ON FUNCTION public.current_rol() TO authenticated;
GRANT ALL ON FUNCTION public.current_rol() TO service_role;


--
-- Name: FUNCTION current_studio_id(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.current_studio_id() TO anon;
GRANT ALL ON FUNCTION public.current_studio_id() TO authenticated;
GRANT ALL ON FUNCTION public.current_studio_id() TO service_role;


--
-- Name: FUNCTION reservar_plaza(p_studio_id text, p_sesion_id text, p_socio_id text, p_reserva_id text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.reservar_plaza(p_studio_id text, p_sesion_id text, p_socio_id text, p_reserva_id text) TO anon;
GRANT ALL ON FUNCTION public.reservar_plaza(p_studio_id text, p_sesion_id text, p_socio_id text, p_reserva_id text) TO authenticated;
GRANT ALL ON FUNCTION public.reservar_plaza(p_studio_id text, p_sesion_id text, p_socio_id text, p_reserva_id text) TO service_role;


--
-- Name: TABLE achievement_definitions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.achievement_definitions TO anon;
GRANT ALL ON TABLE public.achievement_definitions TO authenticated;
GRANT ALL ON TABLE public.achievement_definitions TO service_role;


--
-- Name: TABLE achievement_history; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.achievement_history TO anon;
GRANT ALL ON TABLE public.achievement_history TO authenticated;
GRANT ALL ON TABLE public.achievement_history TO service_role;


--
-- Name: TABLE achievement_progress; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.achievement_progress TO anon;
GRANT ALL ON TABLE public.achievement_progress TO authenticated;
GRANT ALL ON TABLE public.achievement_progress TO service_role;


--
-- Name: TABLE actividad_reciente; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.actividad_reciente TO anon;
GRANT ALL ON TABLE public.actividad_reciente TO authenticated;
GRANT ALL ON TABLE public.actividad_reciente TO service_role;


--
-- Name: TABLE automation_logs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.automation_logs TO anon;
GRANT ALL ON TABLE public.automation_logs TO authenticated;
GRANT ALL ON TABLE public.automation_logs TO service_role;


--
-- Name: TABLE automation_rules; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.automation_rules TO anon;
GRANT ALL ON TABLE public.automation_rules TO authenticated;
GRANT ALL ON TABLE public.automation_rules TO service_role;


--
-- Name: TABLE automatizaciones; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.automatizaciones TO anon;
GRANT ALL ON TABLE public.automatizaciones TO authenticated;
GRANT ALL ON TABLE public.automatizaciones TO service_role;


--
-- Name: TABLE backups; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.backups TO anon;
GRANT ALL ON TABLE public.backups TO authenticated;
GRANT ALL ON TABLE public.backups TO service_role;


--
-- Name: TABLE campanas; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.campanas TO anon;
GRANT ALL ON TABLE public.campanas TO authenticated;
GRANT ALL ON TABLE public.campanas TO service_role;


--
-- Name: TABLE challenge_definitions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.challenge_definitions TO anon;
GRANT ALL ON TABLE public.challenge_definitions TO authenticated;
GRANT ALL ON TABLE public.challenge_definitions TO service_role;


--
-- Name: TABLE challenge_history; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.challenge_history TO anon;
GRANT ALL ON TABLE public.challenge_history TO authenticated;
GRANT ALL ON TABLE public.challenge_history TO service_role;


--
-- Name: TABLE challenge_progress; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.challenge_progress TO anon;
GRANT ALL ON TABLE public.challenge_progress TO authenticated;
GRANT ALL ON TABLE public.challenge_progress TO service_role;


--
-- Name: TABLE citas; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.citas TO anon;
GRANT ALL ON TABLE public.citas TO authenticated;
GRANT ALL ON TABLE public.citas TO service_role;


--
-- Name: TABLE codigos_descuento; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.codigos_descuento TO anon;
GRANT ALL ON TABLE public.codigos_descuento TO authenticated;
GRANT ALL ON TABLE public.codigos_descuento TO service_role;


--
-- Name: TABLE credit_transactions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.credit_transactions TO anon;
GRANT ALL ON TABLE public.credit_transactions TO authenticated;
GRANT ALL ON TABLE public.credit_transactions TO service_role;


--
-- Name: TABLE dashboard_charts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.dashboard_charts TO anon;
GRANT ALL ON TABLE public.dashboard_charts TO authenticated;
GRANT ALL ON TABLE public.dashboard_charts TO service_role;


--
-- Name: TABLE facturas; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.facturas TO anon;
GRANT ALL ON TABLE public.facturas TO authenticated;
GRANT ALL ON TABLE public.facturas TO service_role;


--
-- Name: TABLE instructores; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.instructores TO anon;
GRANT ALL ON TABLE public.instructores TO authenticated;
GRANT ALL ON TABLE public.instructores TO service_role;


--
-- Name: TABLE integracion_credenciales; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.integracion_credenciales TO anon;
GRANT ALL ON TABLE public.integracion_credenciales TO authenticated;
GRANT ALL ON TABLE public.integracion_credenciales TO service_role;


--
-- Name: TABLE integraciones; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.integraciones TO anon;
GRANT ALL ON TABLE public.integraciones TO authenticated;
GRANT ALL ON TABLE public.integraciones TO service_role;


--
-- Name: TABLE level_definitions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.level_definitions TO anon;
GRANT ALL ON TABLE public.level_definitions TO authenticated;
GRANT ALL ON TABLE public.level_definitions TO service_role;


--
-- Name: TABLE member_credits; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.member_credits TO anon;
GRANT ALL ON TABLE public.member_credits TO authenticated;
GRANT ALL ON TABLE public.member_credits TO service_role;


--
-- Name: TABLE mensajes_equipo; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.mensajes_equipo TO anon;
GRANT ALL ON TABLE public.mensajes_equipo TO authenticated;
GRANT ALL ON TABLE public.mensajes_equipo TO service_role;


--
-- Name: TABLE notas_internas; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.notas_internas TO anon;
GRANT ALL ON TABLE public.notas_internas TO authenticated;
GRANT ALL ON TABLE public.notas_internas TO service_role;


--
-- Name: TABLE notas_progreso; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.notas_progreso TO anon;
GRANT ALL ON TABLE public.notas_progreso TO authenticated;
GRANT ALL ON TABLE public.notas_progreso TO service_role;


--
-- Name: TABLE notificaciones; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.notificaciones TO anon;
GRANT ALL ON TABLE public.notificaciones TO authenticated;
GRANT ALL ON TABLE public.notificaciones TO service_role;


--
-- Name: TABLE planes_tarifa; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.planes_tarifa TO anon;
GRANT ALL ON TABLE public.planes_tarifa TO authenticated;
GRANT ALL ON TABLE public.planes_tarifa TO service_role;


--
-- Name: TABLE posts_comunidad; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.posts_comunidad TO anon;
GRANT ALL ON TABLE public.posts_comunidad TO authenticated;
GRANT ALL ON TABLE public.posts_comunidad TO service_role;


--
-- Name: TABLE preferencias_socio; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.preferencias_socio TO anon;
GRANT ALL ON TABLE public.preferencias_socio TO authenticated;
GRANT ALL ON TABLE public.preferencias_socio TO service_role;


--
-- Name: TABLE productos_pos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.productos_pos TO anon;
GRANT ALL ON TABLE public.productos_pos TO authenticated;
GRANT ALL ON TABLE public.productos_pos TO service_role;


--
-- Name: TABLE recibos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.recibos TO anon;
GRANT ALL ON TABLE public.recibos TO authenticated;
GRANT ALL ON TABLE public.recibos TO service_role;


--
-- Name: TABLE reward_actions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.reward_actions TO anon;
GRANT ALL ON TABLE public.reward_actions TO authenticated;
GRANT ALL ON TABLE public.reward_actions TO service_role;


--
-- Name: TABLE reward_catalog; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.reward_catalog TO anon;
GRANT ALL ON TABLE public.reward_catalog TO authenticated;
GRANT ALL ON TABLE public.reward_catalog TO service_role;


--
-- Name: TABLE reward_history; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.reward_history TO anon;
GRANT ALL ON TABLE public.reward_history TO authenticated;
GRANT ALL ON TABLE public.reward_history TO service_role;


--
-- Name: TABLE reward_redemptions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.reward_redemptions TO anon;
GRANT ALL ON TABLE public.reward_redemptions TO authenticated;
GRANT ALL ON TABLE public.reward_redemptions TO service_role;


--
-- Name: TABLE reward_rules; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.reward_rules TO anon;
GRANT ALL ON TABLE public.reward_rules TO authenticated;
GRANT ALL ON TABLE public.reward_rules TO service_role;


--
-- Name: TABLE salas; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.salas TO anon;
GRANT ALL ON TABLE public.salas TO authenticated;
GRANT ALL ON TABLE public.salas TO service_role;


--
-- Name: TABLE sesiones; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.sesiones TO anon;
GRANT ALL ON TABLE public.sesiones TO authenticated;
GRANT ALL ON TABLE public.sesiones TO service_role;


--
-- Name: TABLE socios; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.socios TO anon;
GRANT ALL ON TABLE public.socios TO authenticated;
GRANT ALL ON TABLE public.socios TO service_role;


--
-- Name: TABLE soporte_solicitudes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.soporte_solicitudes TO anon;
GRANT ALL ON TABLE public.soporte_solicitudes TO authenticated;
GRANT ALL ON TABLE public.soporte_solicitudes TO service_role;


--
-- Name: TABLE spots; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.spots TO anon;
GRANT ALL ON TABLE public.spots TO authenticated;
GRANT ALL ON TABLE public.spots TO service_role;


--
-- Name: TABLE studios; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.studios TO anon;
GRANT ALL ON TABLE public.studios TO authenticated;
GRANT ALL ON TABLE public.studios TO service_role;


--
-- Name: TABLE suscripciones; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.suscripciones TO anon;
GRANT ALL ON TABLE public.suscripciones TO authenticated;
GRANT ALL ON TABLE public.suscripciones TO service_role;


--
-- Name: TABLE tipos_clase; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tipos_clase TO anon;
GRANT ALL ON TABLE public.tipos_clase TO authenticated;
GRANT ALL ON TABLE public.tipos_clase TO service_role;


--
-- Name: TABLE usuarios; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.usuarios TO anon;
GRANT ALL ON TABLE public.usuarios TO authenticated;
GRANT ALL ON TABLE public.usuarios TO service_role;


--
-- Name: TABLE ventas_pos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.ventas_pos TO anon;
GRANT ALL ON TABLE public.ventas_pos TO authenticated;
GRANT ALL ON TABLE public.ventas_pos TO service_role;


--
-- Name: TABLE videos_on_demand; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.videos_on_demand TO anon;
GRANT ALL ON TABLE public.videos_on_demand TO authenticated;
GRANT ALL ON TABLE public.videos_on_demand TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--


