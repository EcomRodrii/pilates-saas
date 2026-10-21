-- ═══════════════════════════════════════════════════════════════════════════
-- La primera clase del alta nueva, TODO O NADA (PR-4 del plan del 21-oct-2026,
-- maqueta aprobada «06 · Primera clase · activación»).
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Por qué una función y no cinco escrituras. Hoy la primera clase está
-- repartida en tres sitios (tipo y sala en la bienvenida, una tarifa en
-- borrador a 0 € e inactiva en Paquetes y la clase en el Calendario), y el
-- resultado medido en producción es 9 de 11 estudios con tipo de clase, 4 con
-- una clase y 3 con tarifa activa. El paso 6 del alta crea todo con UN botón,
-- y lo que se ve tras «Publicar mi primera clase» tiene que ser verdad entero o
-- no ser: un tipo y una sala sin clase, o una clase sin su precio a la venta,
-- es justo el estudio a medias de hoy. En una función, cualquier fallo (un
-- solape de sala con 23P01, una fecha pasada) deshace también lo anterior.
--
-- Lo que hace, en este orden (el de las claves ajenas, y `series` ANTES que
-- `sesiones`, ver más abajo):
--   1. tipos_clase    el «Nombre de la clase» (la página pública pinta el TIPO).
--   2. salas          la sala, con las plazas como capacidad si es nueva.
--   3. instructores   «Yo»: su ficha por (auth_user_id, studio_id), la misma
--                     llave única que /api/onboarding/configurar; u «Otra
--                     persona», por nombre.
--   4. series         solo con «Repetir cada semana», con
--                     `renovacion_automatica = true`: «La paras desde el
--                     calendario» es verdad porque el barrido diario de series
--                     (lib/series/avisos-cron.ts) la alarga sola cuando le queda
--                     un mes, y en el Calendario «Renovar serie» la apaga
--                     («Renovar sola cuando se vaya a acabar»).
--   5. sesiones       en UN insert. El trigger por sentencia
--                     `trg_registrar_series_nuevas` da de alta la serie y su
--                     periodo 1; como la fila de `series` ya existe (paso 4),
--                     su `on conflict (id) do nothing` la respeta y la serie
--                     se queda con la renovación automática.
--   6. planes_tarifa  la tarifa ACTIVA con su precio (clase suelta, bono o
--                     cuota). Salvo «Esta clase es gratis» (decisión del
--                     fundador, 21-oct): entonces no hay tarifa.
--   7. studios.reserva_exigir_plan = false con «¿Cómo te pagan? En el
--      estudio» (reservan desde la página y pagan al llegar) o con «gratis».
--      Con «Online, con tarjeta» no se toca.
--
-- Reglas que la función comprueba y no deja a quien llama:
--   · El estudio es `p_studio_id` en CADA fila. Si el plan trae el id de un
--     tipo, una sala o una instructora que ya existen, tienen que ser de ese
--     estudio (y no estar archivados ni dados de baja).
--   · Ninguna clase antes de hoy en Madrid (`public.hoy_estudio()`, nunca
--     `current_date`) ni que ya haya empezado.
--   · Idempotente: los ids salen del `intento` (uno por pulsación de
--     «Publicar», lo genera el navegador) y del estudio, con
--     `on conflict (id) do nothing`. Repetir la misma petición (red que
--     reintenta, doble envío) no crea nada dos veces. Y cada fila se vuelve a
--     comprobar de ESE estudio después, por si acaso.
--   · Un candado por estudio (`pg_advisory_xact_lock`): dos publicaciones a la
--     vez no crean dos tipos con el mismo nombre.
--
-- Solo la llama el servidor (`/api/alta/primera-clase`, service-role), que
-- pone el estudio de la sesión y el nombre de «Yo» de la cuenta, nunca del
-- cuerpo. Grants en TRES pasos: en este proyecto `pg_default_acl` concede
-- EXECUTE directo a anon/authenticated y `revoke ... from public` no basta
-- (.claude/tentare-os.md). Se verifica al final con `has_function_privilege`.
--
-- Y el embudo del alta gana un paso, `correo_recibir_reservas`: el correo
-- «Ya puedes recibir reservas» sale UNA vez por estudio, y es la marca que lo
-- dice (además de la clave de idempotencia de Resend, que solo dura 24 h).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. El embudo: un paso más en la lista cerrada ─────────────────────────
-- La misma lista que `PASOS_EMBUDO` de lib/alta/embudo.ts (lo cruza
-- lib/alta/embudo.test.ts contra ESTE fichero).
alter table public.embudo_alta drop constraint if exists embudo_alta_paso_check;
alter table public.embudo_alta add constraint embudo_alta_paso_check
  check (paso in (
    'panel_abierto', 'clase_reservable', 'enlace_compartido',
    'config_completada', 'correo_cuenta_activa', 'plan_ensenado',
    'correo_recibir_reservas'
  ));

-- ── 2. La primera clase, todo o nada ──────────────────────────────────────
create or replace function public.alta_primera_clase(p_studio_id text, p_plan jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path = ''
as $function$
declare
  v_intento text := p_plan ->> 'intento';
  v_base text;
  v_tipo jsonb := p_plan -> 'tipo';
  v_sala jsonb := p_plan -> 'sala';
  v_inst jsonb := p_plan -> 'instructor';
  v_lista jsonb := p_plan -> 'sesiones';
  v_tarifa jsonb := p_plan -> 'tarifa';
  v_gratis boolean;
  v_cobro text := p_plan ->> 'cobro';
  v_semanal boolean;
  v_aforo integer;
  v_duracion integer;
  v_nombre text;
  v_tipo_id text;
  v_sala_id text;
  v_inst_id text;
  v_inst_activa boolean;
  v_uid uuid;
  v_serie_id text;
  v_plan_id text;
  v_n integer;
  v_malas integer;
  v_desde date;
  v_hasta date;
  v_creadas integer := 0;
  v_ids text[];
  v_precio numeric;
  v_tipo_tarifa text;
  v_sesiones_tarifa integer;
  v_hoy date := public.hoy_estudio();
begin
  -- ── Lo que llega ──────────────────────────────────────────────────────────
  if p_studio_id is null or not exists (select 1 from public.studios s where s.id = p_studio_id) then
    raise exception 'ESTUDIO_NO_EXISTE';
  end if;
  if p_plan is null or jsonb_typeof(p_plan) <> 'object' then
    raise exception 'PLAN_INVALIDO';
  end if;
  if v_intento is null or v_intento !~ '^[A-Za-z0-9-]{8,64}$' then
    raise exception 'INTENTO_INVALIDO';
  end if;
  -- Los ids llevan el estudio dentro: el mismo `intento` en dos estudios no
  -- puede dar el mismo id.
  v_base := substr(md5(p_studio_id || ':' || v_intento), 1, 24);

  -- Un candado por estudio, hasta el final de la transacción.
  perform pg_advisory_xact_lock(hashtext('alta_primera_clase:' || p_studio_id));

  if jsonb_typeof(p_plan -> 'gratis') is distinct from 'boolean' then raise exception 'PLAN_INVALIDO'; end if;
  v_gratis := (p_plan ->> 'gratis')::boolean;
  if v_cobro is null or v_cobro not in ('estudio', 'online') then raise exception 'COBRO_INVALIDO'; end if;
  if jsonb_typeof(p_plan -> 'semanal') is distinct from 'boolean' then raise exception 'PLAN_INVALIDO'; end if;
  v_semanal := (p_plan ->> 'semanal')::boolean;

  if jsonb_typeof(p_plan -> 'aforo') is distinct from 'number' then raise exception 'AFORO_INVALIDO'; end if;
  v_aforo := (p_plan ->> 'aforo')::numeric;
  if v_aforo is null or v_aforo < 1 or v_aforo > 100 or v_aforo <> (p_plan ->> 'aforo')::numeric then
    raise exception 'AFORO_INVALIDO';
  end if;

  -- ── Las clases: 1 suelta, o la semanal (hasta un año) ────────────────────
  if v_lista is null or jsonb_typeof(v_lista) <> 'array' then raise exception 'SIN_CLASES'; end if;
  v_n := jsonb_array_length(v_lista);
  if v_n < 1 or v_n > 53 or (not v_semanal and v_n <> 1) then raise exception 'SIN_CLASES'; end if;

  select count(*) filter (
           where e.x ->> 'inicio' is null or e.x ->> 'fin' is null
              or (e.x ->> 'fin')::timestamptz <= (e.x ->> 'inicio')::timestamptz
              or (e.x ->> 'fin')::timestamptz - (e.x ->> 'inicio')::timestamptz > interval '4 hours'),
         min(((e.x ->> 'inicio')::timestamptz at time zone 'Europe/Madrid')::date),
         max(((e.x ->> 'inicio')::timestamptz at time zone 'Europe/Madrid')::date)
    into v_malas, v_desde, v_hasta
    from jsonb_array_elements(v_lista) as e(x);
  if v_malas > 0 then raise exception 'HORA_INVALIDA'; end if;
  -- El día de hoy en Madrid, nunca el de UTC; y nada que ya haya empezado.
  if v_desde < v_hoy or exists (
    select 1 from jsonb_array_elements(v_lista) as e(x) where (e.x ->> 'inicio')::timestamptz <= now()
  ) then
    raise exception 'FECHA_PASADA';
  end if;
  v_duracion := (
    select round(extract(epoch from (((e.x ->> 'fin')::timestamptz) - ((e.x ->> 'inicio')::timestamptz))) / 60)::integer
      from jsonb_array_elements(v_lista) as e(x) limit 1
  );

  -- ── 1. El tipo de clase ──────────────────────────────────────────────────
  if v_tipo is null or jsonb_typeof(v_tipo) <> 'object' then raise exception 'TIPO_INVALIDO'; end if;
  if v_tipo ? 'id' then
    select t.id into v_tipo_id from public.tipos_clase t
     where t.id = v_tipo ->> 'id' and t.studio_id = p_studio_id and t.archivado_en is null;
    if v_tipo_id is null then raise exception 'TIPO_AJENO'; end if;
  else
    v_nombre := btrim(coalesce(v_tipo ->> 'nombre', ''));
    if char_length(v_nombre) < 1 or char_length(v_nombre) > 60 then raise exception 'NOMBRE_INVALIDO'; end if;
    -- Uno que ya se llame así, sin archivar: se reutiliza (como el asistente
    -- de siempre, que es idempotente por nombre).
    select t.id into v_tipo_id from public.tipos_clase t
     where t.studio_id = p_studio_id and t.archivado_en is null and lower(btrim(t.nombre)) = lower(v_nombre)
     order by t.id limit 1;
    if v_tipo_id is null then
      v_tipo_id := 'tc-alta-' || v_base;
      insert into public.tipos_clase (id, studio_id, nombre, color, duracion_minutos, nivel, aforo_por_defecto)
      values (
        v_tipo_id, p_studio_id, v_nombre,
        coalesce(nullif(v_tipo ->> 'color', ''), '#F7A6C4'),
        v_duracion, 'TODOS', v_aforo
      )
      on conflict (id) do nothing;
    end if;
  end if;
  if not exists (select 1 from public.tipos_clase t where t.id = v_tipo_id and t.studio_id = p_studio_id) then
    raise exception 'TIPO_AJENO';
  end if;

  -- ── 2. La sala ───────────────────────────────────────────────────────────
  if v_sala is null or jsonb_typeof(v_sala) <> 'object' then raise exception 'SALA_INVALIDA'; end if;
  if v_sala ? 'id' then
    select s.id into v_sala_id from public.salas s where s.id = v_sala ->> 'id' and s.studio_id = p_studio_id;
    if v_sala_id is null then raise exception 'SALA_AJENA'; end if;
  else
    v_nombre := btrim(coalesce(v_sala ->> 'nombre', ''));
    if char_length(v_nombre) < 1 or char_length(v_nombre) > 60 then raise exception 'SALA_INVALIDA'; end if;
    select s.id into v_sala_id from public.salas s
     where s.studio_id = p_studio_id and lower(btrim(s.nombre)) = lower(v_nombre)
     order by s.id limit 1;
    if v_sala_id is null then
      v_sala_id := 'sala-alta-' || v_base;
      insert into public.salas (id, studio_id, nombre, capacidad, color)
      values (v_sala_id, p_studio_id, v_nombre, v_aforo, coalesce(nullif(v_sala ->> 'color', ''), '#7FB2E5'))
      on conflict (id) do nothing;
    end if;
  end if;
  if not exists (select 1 from public.salas s where s.id = v_sala_id and s.studio_id = p_studio_id) then
    raise exception 'SALA_AJENA';
  end if;

  -- ── 3. Quien la da ───────────────────────────────────────────────────────
  if v_inst is null or jsonb_typeof(v_inst) <> 'object' then raise exception 'INSTRUCTORA_INVALIDA'; end if;
  if v_inst ? 'id' then
    select i.id, coalesce(i.activo, true) into v_inst_id, v_inst_activa
      from public.instructores i where i.id = v_inst ->> 'id' and i.studio_id = p_studio_id;
    if v_inst_id is null then raise exception 'INSTRUCTORA_AJENA'; end if;
  elsif (v_inst ->> 'propia') = 'true' then
    -- «Yo»: su ficha, por la llave única (auth_user_id, studio_id). El nombre y
    -- el email los pone el servidor desde la cuenta.
    begin
      v_uid := (v_inst ->> 'auth_user_id')::uuid;
    exception when others then
      raise exception 'INSTRUCTORA_INVALIDA';
    end;
    if v_uid is null then raise exception 'INSTRUCTORA_INVALIDA'; end if;
    select i.id, coalesce(i.activo, true) into v_inst_id, v_inst_activa
      from public.instructores i where i.studio_id = p_studio_id and i.auth_user_id = v_uid;
    if v_inst_id is null then
      v_nombre := btrim(coalesce(v_inst ->> 'nombre', ''));
      if char_length(v_nombre) < 1 or char_length(v_nombre) > 80 then raise exception 'INSTRUCTORA_INVALIDA'; end if;
      insert into public.instructores (id, studio_id, auth_user_id, nombre, email, rol, activo)
      values ('ins-alta-' || v_base, p_studio_id, v_uid, v_nombre, nullif(btrim(coalesce(v_inst ->> 'email', '')), ''), 'PROPIETARIO', true)
      on conflict (auth_user_id, studio_id) do nothing;
      select i.id, coalesce(i.activo, true) into v_inst_id, v_inst_activa
        from public.instructores i where i.studio_id = p_studio_id and i.auth_user_id = v_uid;
    end if;
  else
    -- «Otra persona»: una ficha sin cuenta (la invitación se manda cuando
    -- quiera, desde Equipo). Si ya hay una activa con ese nombre, esa.
    v_nombre := btrim(coalesce(v_inst ->> 'nombre', ''));
    if char_length(v_nombre) < 1 or char_length(v_nombre) > 80 then raise exception 'INSTRUCTORA_INVALIDA'; end if;
    select i.id, true into v_inst_id, v_inst_activa from public.instructores i
     where i.studio_id = p_studio_id and coalesce(i.activo, true) and lower(btrim(i.nombre)) = lower(v_nombre)
     order by i.id limit 1;
    if v_inst_id is null then
      v_inst_id := 'ins-alta-' || v_base;
      insert into public.instructores (id, studio_id, nombre, rol, activo)
      values (v_inst_id, p_studio_id, v_nombre, 'INSTRUCTOR', true)
      on conflict (id) do nothing;
      v_inst_activa := true;
    end if;
  end if;
  if v_inst_id is null or not exists (select 1 from public.instructores i where i.id = v_inst_id and i.studio_id = p_studio_id) then
    raise exception 'INSTRUCTORA_AJENA';
  end if;
  if not v_inst_activa then raise exception 'INSTRUCTORA_DE_BAJA'; end if;

  -- ── 4. La serie, ANTES que sus clases ────────────────────────────────────
  -- Mismo cálculo de semanas que `registrar_series_nuevas`.
  if v_semanal then
    v_serie_id := 'serie-alta-' || v_base;
    insert into public.series (id, studio_id, semanas_periodo, renovacion_automatica)
    values (v_serie_id, p_studio_id, least(104, greatest(1, ((v_hasta - v_desde) / 7) + 1)), true)
    on conflict (id) do nothing;
    if not exists (select 1 from public.series s where s.id = v_serie_id and s.studio_id = p_studio_id) then
      raise exception 'SERIE_AJENA';
    end if;
  end if;

  -- ── 5. Las clases, en UN insert ──────────────────────────────────────────
  -- Un solape de sala o de instructora (`sesiones_sala_sin_solape`,
  -- `sesiones_instructor_sin_solape`) sale aquí como 23P01 y deshace todo.
  select array_agg('ses-alta-' || v_base || '-' || e.n order by e.n) into v_ids
    from jsonb_array_elements(v_lista) with ordinality as e(x, n);
  insert into public.sesiones (id, studio_id, tipo_clase_id, sala_id, instructor_id, inicio, fin, aforo_maximo, cancelada, serie_id)
  select 'ses-alta-' || v_base || '-' || e.n, p_studio_id, v_tipo_id, v_sala_id, v_inst_id,
         (e.x ->> 'inicio')::timestamptz, (e.x ->> 'fin')::timestamptz, v_aforo, false, v_serie_id
    from jsonb_array_elements(v_lista) with ordinality as e(x, n)
  on conflict (id) do nothing;
  get diagnostics v_creadas = row_count;
  if (select count(*) from public.sesiones s where s.id = any(v_ids) and s.studio_id = p_studio_id) <> v_n then
    raise exception 'CLASE_AJENA';
  end if;

  -- ── 6. La tarifa, activa (salvo «gratis») ────────────────────────────────
  if v_gratis then
    if v_tarifa is not null and jsonb_typeof(v_tarifa) <> 'null' then raise exception 'TARIFA_INVALIDA'; end if;
  else
    if v_tarifa is null or jsonb_typeof(v_tarifa) <> 'object' then raise exception 'SIN_PRECIO'; end if;
    v_tipo_tarifa := v_tarifa ->> 'tipo';
    if v_tipo_tarifa is null or v_tipo_tarifa not in ('PUNTUAL', 'BONO', 'MENSUAL') then raise exception 'TARIFA_INVALIDA'; end if;
    if jsonb_typeof(v_tarifa -> 'precio') is distinct from 'number' then raise exception 'SIN_PRECIO'; end if;
    v_precio := (v_tarifa ->> 'precio')::numeric;
    -- Precio > 0 sin la casilla de gratis. Un precio raro solo AVISA (en el
    -- navegador); aquí, solo el tope de cordura del CHECK y dos decimales.
    if v_precio <= 0 or v_precio > 100000 or round(v_precio, 2) <> v_precio then raise exception 'SIN_PRECIO'; end if;
    if v_tipo_tarifa = 'PUNTUAL' then
      v_sesiones_tarifa := 1;
    elsif v_tipo_tarifa = 'BONO' then
      if jsonb_typeof(v_tarifa -> 'sesiones') is distinct from 'number' then raise exception 'BONO_INVALIDO'; end if;
      v_sesiones_tarifa := (v_tarifa ->> 'sesiones')::numeric;
      if v_sesiones_tarifa < 1 or v_sesiones_tarifa > 999 or v_sesiones_tarifa <> (v_tarifa ->> 'sesiones')::numeric then
        raise exception 'BONO_INVALIDO';
      end if;
    else
      v_sesiones_tarifa := null;
    end if;
    v_nombre := btrim(coalesce(v_tarifa ->> 'nombre', ''));
    if char_length(v_nombre) < 1 or char_length(v_nombre) > 80 then raise exception 'TARIFA_INVALIDA'; end if;
    v_plan_id := 'plan-alta-' || v_base;
    insert into public.planes_tarifa (id, studio_id, nombre, precio, tipo, sesiones, activo)
    values (v_plan_id, p_studio_id, v_nombre, v_precio, v_tipo_tarifa, v_sesiones_tarifa, true)
    on conflict (id) do nothing;
    if not exists (select 1 from public.planes_tarifa p where p.id = v_plan_id and p.studio_id = p_studio_id) then
      raise exception 'TARIFA_AJENA';
    end if;
  end if;

  -- ── 7. «En el estudio» o gratis: reservan sin comprar nada online ────────
  if v_gratis or v_cobro = 'estudio' then
    update public.studios set reserva_exigir_plan = false
     where id = p_studio_id and reserva_exigir_plan is distinct from false;
  end if;

  return jsonb_build_object(
    'ok', true,
    'tipo_clase_id', v_tipo_id,
    'sala_id', v_sala_id,
    'instructor_id', v_inst_id,
    'serie_id', v_serie_id,
    'plan_id', v_plan_id,
    'sesiones', v_n,
    'creadas', v_creadas,
    -- Nada nuevo: era la misma petición otra vez.
    'repetida', v_creadas = 0
  );
end;
$function$;

comment on function public.alta_primera_clase(text, jsonb) is
  'Paso 6 del alta nueva: tipo, sala, instructora, serie (renovación automática), clases y tarifa activa en una transacción. Idempotente por intento. Solo service_role (/api/alta/primera-clase).';

-- ── 3. Solo el servidor ───────────────────────────────────────────────────
revoke all on function public.alta_primera_clase(text, jsonb) from public;
revoke all on function public.alta_primera_clase(text, jsonb) from anon;
revoke all on function public.alta_primera_clase(text, jsonb) from authenticated;
grant execute on function public.alta_primera_clase(text, jsonb) to service_role;

do $$
begin
  if has_function_privilege('anon', 'public.alta_primera_clase(text, jsonb)', 'EXECUTE') then
    raise exception 'alta_primera_clase: anon no debería poder ejecutarla';
  end if;
  if has_function_privilege('authenticated', 'public.alta_primera_clase(text, jsonb)', 'EXECUTE') then
    raise exception 'alta_primera_clase: authenticated no debería poder ejecutarla';
  end if;
  if not has_function_privilege('service_role', 'public.alta_primera_clase(text, jsonb)', 'EXECUTE') then
    raise exception 'alta_primera_clase: service_role tiene que poder ejecutarla';
  end if;
end;
$$;
