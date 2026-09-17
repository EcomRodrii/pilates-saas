-- ═══════════════════════════════════════════════════════════════════════════
-- Créditos de «Renovar plan»: los decide la base y siguen al recibo.
--
-- Decisiones del fundador (17-sep-2026):
--   · Una renovación da créditos la cobre quien la cobre (tarjeta guardada,
--     SEPA, Checkout, datáfono, mostrador). Antes solo el «marcar cobrado» del
--     panel, y decidiendo por el texto del concepto.
--   · Recomprar el MISMO plan (TPV, tienda web, asignarlo otra vez desde la
--     ficha) también es renovar, si el anterior de ese plan terminó hace 60
--     días o menos. Un plan distinto es una compra nueva. Lo decide la base,
--     nunca el navegador.
--   · Si el dinero vuelve (devolución total, contracargo perdido, adeudo SEPA
--     devuelto, «marcar devuelto», venta del TPV devuelta entera), los créditos
--     se revierten. Lo que ya se gastó no deja el saldo negativo: queda como
--     «créditos por compensar» y se descuenta de lo próximo que gane.
--     Una devolución PARCIAL no quita nada. Revertir baja también
--     `total_ganado` (y con él el nivel): nunca se ganaron.
--
-- ⚠️ La recompra NO se marca con `recibos.es_renovacion`. Esa marca decide la
-- ENTREGA (recargar el bono existente en vez de crear uno): ponerla en una
-- recompra, que ya trae su suscripción nueva con sus sesiones, las duplicaría
-- (ver `aplicarRenovacionServidor`). Para los créditos se mira la historia de
-- suscripciones de la socia, aparte.
--
-- ── Una sola puerta en cada sentido ─────────────────────────────────────────
-- `sincronizar_creditos_renovacion(studio, recibo)` mira el estado REAL del
-- recibo y deja los créditos como tienen que estar: los otorga (por
-- `otorgar_credito_disparador`, con su UNIQUE de siempre) o los revierte. Se
-- llama desde cada sitio donde un recibo entra o sale de COBRADO, repetirla no
-- hace nada, y un bloqueo por recibo impide que un cobro y una devolución
-- simultáneos se crucen.
--
-- Revertir BORRA la marca de `reward_actions`, igual que ya hace
-- `retirar_creditos_compra` (TPV): así, si el recibo vuelve a COBRADO (un
-- reembolso que falla), la siguiente sincronización puede otorgar otra vez
-- sin tocar la idempotencia de la RPC. La constancia queda en
-- `credit_transactions` (GANANCIA, REVERSION, COMPENSACION con el id del
-- recibo).
--
-- ── Por qué la compensación es un trigger ──────────────────────────────────
-- Mismo motivo que `member_credits_caducidad`: hay varias puertas que suman
-- saldo (`otorgar_credito_disparador`, `otorgar_creditos_compra`,
-- `ajustar_creditos`, `cancelar_canje`) y la deuda tiene que cobrarse en
-- todas, incluida la que alguien escriba mañana. El trigger se llama `…_deuda`
-- para ejecutarse DESPUÉS de `…_caducidad` (los BEFORE van por orden
-- alfabético): primero se descarta el saldo caducado, luego se compensa.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.member_credits
  add column if not exists creditos_por_compensar integer not null default 0;

alter table public.member_credits drop constraint if exists member_credits_por_compensar_no_negativo;
alter table public.member_credits
  add constraint member_credits_por_compensar_no_negativo check (creditos_por_compensar >= 0);

comment on column public.member_credits.creditos_por_compensar is
  'Créditos de una renovación devuelta que ya se habían gastado. Se descuentan de las próximas ganancias (trigger member_credits_deuda); el saldo nunca queda negativo.';

alter table public.credit_transactions drop constraint if exists credit_transactions_tipo_check;
alter table public.credit_transactions
  add constraint credit_transactions_tipo_check
  check (tipo in ('GANANCIA', 'CANJE', 'REVERSION', 'COMPENSACION'));

-- Los dos helpers de abajo buscan la venta del TPV por su recibo en cada cobro
-- y devolución; sin índice es un recorrido entero de `ventas_pos`.
create index if not exists idx_ventas_pos_recibo on public.ventas_pos (recibo_id) where recibo_id is not null;

-- ── ¿El dinero de este recibo sigue cobrado? ────────────────────────────────
-- COBRADO, y si es el recibo de una venta del TPV, que la venta no esté
-- anulada ni devuelta entera (el TPV no toca el estado del recibo al devolver:
-- un documento fiscal se rectifica, no se reescribe). «Entera» es
-- `ventas_pos.devuelta_en`, la marca que ya ponen `devolver_venta_pos` y el
-- reembolso por Stripe (`registrarDevolucion`) solo con la devolución TOTAL.
create or replace function public.recibo_cobro_vigente(p_recibo_id text, p_studio_id text)
  returns boolean
  language sql
  stable
  security invoker
  set search_path to ''
as $$
  select exists (
    select 1 from public.recibos rc
    where rc.id = p_recibo_id and rc.studio_id = p_studio_id and rc.estado = 'COBRADO'
      and not exists (
        select 1 from public.ventas_pos v
        where v.recibo_id = rc.id and v.studio_id = rc.studio_id
          and (v.estado = 'ANULADA' or v.anulada_en is not null or v.devuelta_en is not null)
      )
  );
$$;

-- ── ¿Es una renovación, a efectos de créditos? ──────────────────────────────
-- Sí si el recibo está marcado como renovación del ciclo (`es_renovacion`), o
-- si compra un plan (no una clase suelta) que la socia ya tenía y cuyo periodo
-- anterior terminó hace 60 días o menos (o sigue abierto). La compra puede
-- colgar del recibo (`suscripcion_id`) o de las líneas de una venta del TPV.
-- La deuda de una cuota ya cancelada (`tras_cancelar_cuota`) nunca es renovar.
-- «Anterior» es estricto (empezó ANTES): dos compras del mismo plan el mismo
-- día no se cuentan la una a la otra.
create or replace function public.recibo_es_renovacion_para_creditos(p_recibo_id text, p_studio_id text)
  returns boolean
  language sql
  stable
  security invoker
  set search_path to ''
as $$
  with rc as (
    select r.id, r.studio_id, r.socio_id, r.suscripcion_id, r.es_renovacion
    from public.recibos r
    where r.id = p_recibo_id and r.studio_id = p_studio_id
      and r.socio_id is not null and r.tras_cancelar_cuota is null
  ), compradas as (
    select s.id, s.plan_id, s.fecha_inicio
    from rc
    join public.suscripciones s on s.studio_id = rc.studio_id and s.socio_id = rc.socio_id
    where s.id = rc.suscripcion_id
       or s.id in (
         select l.suscripcion_id
         from public.ventas_pos v
         join public.ventas_pos_lineas l on l.venta_id = v.id and l.studio_id = v.studio_id
         where v.recibo_id = rc.id and v.studio_id = rc.studio_id and l.suscripcion_id is not null
       )
  )
  select exists (select 1 from rc where coalesce(rc.es_renovacion, false))
      or exists (
        select 1
        from rc
        cross join compradas c
        join public.planes_tarifa p on p.id = c.plan_id and p.studio_id = rc.studio_id
        join public.suscripciones prev
          on prev.studio_id = rc.studio_id and prev.socio_id = rc.socio_id
         and prev.plan_id = c.plan_id and prev.id <> c.id
        where p.tipo <> 'PUNTUAL'
          and prev.fecha_inicio < c.fecha_inicio
          and (prev.fecha_fin is null or prev.fecha_fin >= c.fecha_inicio - 60)
      );
$$;

-- ── otorgar_credito_disparador: RENOVACION_PLAN con la regla de la base ─────
-- Copia literal de 20260914001133 salvo la rama RENOVACION_PLAN. Misma firma.
-- Quien gestiona clientas puede seguir llamándola desde el panel, pero ya no
-- puede dar créditos por un recibo sin cobrar, devuelto, de deuda de una cuota
-- cancelada o que no sea una renovación.
create or replace function public.otorgar_credito_disparador(
  p_studio_id text, p_socio_id text, p_trigger text, p_ref_id text, p_config_id text default null::text
)
 returns table(saldo integer, otorgado boolean, accion_id text, creditos integer, descripcion text)
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_creditos int;
  v_desc text;
  v_regla_id text;
  v_saldo int;
  v_id text;
  v_sufijo text;
  v_lunes date;
  v_objetivo int;
  v_hechas int;
  v_solo_clases_propias boolean := false;
begin
  perform public.validar_studio_mismatch(p_studio_id);
  perform public.validar_socio_del_studio(p_socio_id, p_studio_id);
  if p_ref_id is null or length(trim(p_ref_id)) = 0 then
    raise exception 'REF_ID_REQUERIDO';
  end if;

  if not public.es_llamada_servicio() and not public.puede_gestionar_clientas() then
    if public.current_rol() is distinct from 'INSTRUCTOR'
       or p_trigger not in ('ASISTENCIA_CLASE', 'SEMANA_COMPLETA', 'OBJETIVO_MENSUAL', 'PRIMERA_RESERVA', 'LOGRO', 'RETO') then
      raise exception 'NO_AUTORIZADO';
    end if;
    v_solo_clases_propias := true;
  end if;

  if p_trigger = 'ASISTENCIA_CLASE' then
    if not exists (
      select 1 from reservas
      where id = p_ref_id and socio_id = p_socio_id and studio_id = p_studio_id and estado = 'ASISTIDA'
    ) then
      raise exception 'CONDICION_NO_CUMPLIDA';
    end if;
    if v_solo_clases_propias and not exists (
      select 1 from reservas r join sesiones s on s.id = r.sesion_id
      where r.id = p_ref_id and r.studio_id = p_studio_id
        and s.instructor_id = public.current_instructor_id()
    ) then
      raise exception 'NO_AUTORIZADO';
    end if;
    select r.creditos, r.nombre, r.id into v_creditos, v_desc, v_regla_id from reward_rules r
      where r.studio_id = p_studio_id and r.trigger = 'ASISTENCIA_CLASE' and r.activa limit 1;

  elsif p_trigger = 'REFERIDO_AMIGO' then
    if not exists (
      select 1 from socios s
      where s.id = p_ref_id and s.studio_id = p_studio_id and s.referido_por = p_socio_id
        and exists (select 1 from reservas r where r.socio_id = s.id and r.studio_id = p_studio_id and r.estado = 'ASISTIDA')
    ) then
      raise exception 'CONDICION_NO_CUMPLIDA';
    end if;
    select r.creditos, r.nombre, r.id into v_creditos, v_desc, v_regla_id from reward_rules r
      where r.studio_id = p_studio_id and r.trigger = 'REFERIDO_AMIGO' and r.activa limit 1;

  elsif p_trigger = 'RENOVACION_PLAN' then
    -- El mismo bloqueo por recibo que `sincronizar_creditos_renovacion` (es
    -- reentrante dentro de ella): llamada directa desde el panel, no puede
    -- cruzarse con la devolución de ese recibo y dejar créditos sobre un DEVUELTO.
    perform pg_advisory_xact_lock(hashtextextended('creditos-renovacion|' || p_studio_id || '|' || p_ref_id, 0));
    -- La misma regla que `sincronizar_creditos_renovacion`, y en la base: el
    -- recibo es de esta socia, su dinero sigue cobrado y es una renovación
    -- (marcada, o la recompra del mismo plan). Antes bastaba con que el
    -- concepto empezara por «Renovación», cobrado o no.
    if not exists (
      select 1 from recibos rc
      where rc.id = p_ref_id and rc.socio_id = p_socio_id and rc.studio_id = p_studio_id
    )
       or not public.recibo_cobro_vigente(p_ref_id, p_studio_id)
       or not public.recibo_es_renovacion_para_creditos(p_ref_id, p_studio_id) then
      raise exception 'CONDICION_NO_CUMPLIDA';
    end if;
    select r.creditos, r.nombre, r.id into v_creditos, v_desc, v_regla_id from reward_rules r
      where r.studio_id = p_studio_id and r.trigger = 'RENOVACION_PLAN' and r.activa limit 1;

  elsif p_trigger = 'PRIMERA_RESERVA' then
    if p_ref_id is distinct from p_socio_id then
      raise exception 'REF_ID_NO_DERIVADO';
    end if;
    if not exists (select 1 from reservas r where r.socio_id = p_socio_id and r.studio_id = p_studio_id) then
      raise exception 'CONDICION_NO_CUMPLIDA';
    end if;
    select r.creditos, r.nombre, r.id into v_creditos, v_desc, v_regla_id from reward_rules r
      where r.studio_id = p_studio_id and r.trigger = 'PRIMERA_RESERVA' and r.activa limit 1;

  elsif p_trigger = 'SEMANA_COMPLETA' then
    if left(p_ref_id, length(p_socio_id) + 1) is distinct from p_socio_id || ':' then
      raise exception 'REF_ID_NO_DERIVADO';
    end if;
    v_sufijo := substr(p_ref_id, length(p_socio_id) + 2);
    begin
      v_lunes := v_sufijo::date;
    exception when others then
      raise exception 'REF_ID_NO_DERIVADO';
    end;
    if extract(isodow from v_lunes) not in (1, 7) or v_lunes > current_date then
      raise exception 'REF_ID_NO_DERIVADO';
    end if;
    if not exists (
      select 1 from reservas r join sesiones s on s.id = r.sesion_id
      where r.socio_id = p_socio_id and r.studio_id = p_studio_id and r.estado = 'ASISTIDA'
        and s.inicio >= v_lunes::timestamptz
        and s.inicio <  (v_lunes + 8)::timestamptz
    ) then
      raise exception 'CONDICION_NO_CUMPLIDA';
    end if;
    -- La semana solo exige UNA asistencia: para la instructora, que sea en su clase.
    if v_solo_clases_propias and not exists (
      select 1 from reservas r join sesiones s on s.id = r.sesion_id
      where r.socio_id = p_socio_id and r.studio_id = p_studio_id and r.estado = 'ASISTIDA'
        and s.instructor_id = public.current_instructor_id()
        and s.inicio >= v_lunes::timestamptz
        and s.inicio <  (v_lunes + 8)::timestamptz
    ) then
      raise exception 'NO_AUTORIZADO';
    end if;
    select r.creditos, r.nombre, r.id into v_creditos, v_desc, v_regla_id from reward_rules r
      where r.studio_id = p_studio_id and r.trigger = 'SEMANA_COMPLETA' and r.activa limit 1;

  elsif p_trigger = 'OBJETIVO_MENSUAL' then
    -- p_ref_id debe ser '<socio_id>:<YYYY-MM>' del MES EN CURSO exacto (ni
    -- pasado ni futuro) — mismo estilo de derivación que SEMANA_COMPLETA.
    if left(p_ref_id, length(p_socio_id) + 1) is distinct from p_socio_id || ':' then
      raise exception 'REF_ID_NO_DERIVADO';
    end if;
    v_sufijo := substr(p_ref_id, length(p_socio_id) + 2);
    if v_sufijo is distinct from to_char(current_date, 'YYYY-MM') then
      raise exception 'REF_ID_NO_DERIVADO';
    end if;

    select s.objetivo_clases_mes into v_objetivo
      from socios s where s.id = p_socio_id and s.studio_id = p_studio_id;
    if v_objetivo is null or v_objetivo < 1 then
      raise exception 'CONDICION_NO_CUMPLIDA';
    end if;

    -- "Hecha" = mismo criterio que cuentaComoHecha (lib/student/ritmo.ts):
    -- ASISTIDA, o CONFIRMADA con la sesión ya pasada. Acotado al mes natural
    -- en curso (misma zona horaria en bruto que ya usa SEMANA_COMPLETA arriba).
    select count(*) into v_hechas
      from reservas r
      join sesiones s on s.id = r.sesion_id and s.studio_id = p_studio_id
      where r.socio_id = p_socio_id and r.studio_id = p_studio_id
        and s.inicio >= date_trunc('month', current_date)::timestamptz
        and s.inicio <  (date_trunc('month', current_date) + interval '1 month')::timestamptz
        and (r.estado = 'ASISTIDA' or (r.estado = 'CONFIRMADA' and s.inicio < now()));

    if v_hechas < v_objetivo then
      raise exception 'CONDICION_NO_CUMPLIDA';
    end if;
    select r.creditos, r.nombre, r.id into v_creditos, v_desc, v_regla_id from reward_rules r
      where r.studio_id = p_studio_id and r.trigger = 'OBJETIVO_MENSUAL' and r.activa limit 1;

  elsif p_trigger = 'LOGRO' then
    if p_config_id is null or p_ref_id is distinct from p_socio_id || ':' || p_config_id then
      raise exception 'REF_ID_NO_DERIVADO';
    end if;
    if not exists (
      select 1 from achievement_progress ap
      where ap.socio_id = p_socio_id and ap.studio_id = p_studio_id
        and ap.achievement_id = p_config_id and ap.completado
    ) then
      raise exception 'CONDICION_NO_CUMPLIDA';
    end if;
    select a.creditos_recompensa, 'Logro desbloqueado: ' || a.nombre into v_creditos, v_desc
      from achievement_definitions a
      where a.id = p_config_id and a.studio_id = p_studio_id and a.activo;

  elsif p_trigger = 'RETO' then
    if p_config_id is null or p_ref_id is distinct from p_socio_id || ':' || p_config_id then
      raise exception 'REF_ID_NO_DERIVADO';
    end if;
    if not exists (
      select 1 from challenge_progress cp
      where cp.socio_id = p_socio_id and cp.studio_id = p_studio_id
        and cp.challenge_id = p_config_id and cp.completado
    ) then
      raise exception 'CONDICION_NO_CUMPLIDA';
    end if;
    select c.creditos_recompensa, 'Reto completado: ' || c.nombre into v_creditos, v_desc
      from challenge_definitions c
      where c.id = p_config_id and c.studio_id = p_studio_id and c.activo;

  else
    raise exception 'TRIGGER_DESCONOCIDO';
  end if;

  if v_creditos is null or v_creditos <= 0 then
    raise exception 'SIN_REGLA_ACTIVA';
  end if;

  v_id := 'rwa-srv-' || substr(md5(p_studio_id || '|' || p_trigger || '|' || p_ref_id || '|' || clock_timestamp()::text || '|' || random()::text), 1, 20);

  begin
    insert into reward_actions (id, studio_id, socio_id, trigger, ref_id, creado_en)
      values (v_id, p_studio_id, p_socio_id, p_trigger, p_ref_id, now());
  exception when unique_violation then
    select mc.saldo into v_saldo from member_credits mc where mc.socio_id = p_socio_id and mc.studio_id = p_studio_id;
    return query select coalesce(v_saldo, 0), false, null::text, 0, null::text;
    return;
  end;

  insert into member_credits (socio_id, studio_id, saldo, total_ganado, total_canjeado, actualizado_en)
    values (p_socio_id, p_studio_id, v_creditos, v_creditos, 0, now())
  on conflict (socio_id) do update set
    saldo = member_credits.saldo + v_creditos,
    total_ganado = member_credits.total_ganado + v_creditos,
    actualizado_en = now()
  returning member_credits.saldo into v_saldo;

  insert into reward_history (id, studio_id, socio_id, rule_id, action_id, creditos, descripcion, creado_en)
    values (
      'rwh-srv-' || substr(md5(v_id || '|h|' || random()::text), 1, 18),
      p_studio_id, p_socio_id, v_regla_id, v_id, v_creditos, v_desc, now()
    );

  insert into credit_transactions (id, studio_id, socio_id, tipo, creditos, descripcion, ref_id, creado_en)
    values (
      'ctx-srv-' || substr(md5(v_id || '|t|' || random()::text), 1, 18),
      p_studio_id, p_socio_id, 'GANANCIA', v_creditos, v_desc, p_ref_id, now()
    );

  return query select v_saldo, true, v_id, v_creditos, v_desc;
end;
$function$;



-- ── La puerta: deja los créditos de un recibo como tienen que estar ────────
-- Solo para el servidor (webhook, crons, rutas con service-role). Devuelve qué
-- hizo: OTORGADO, REVERTIDO o NADA. `p_puede_otorgar` (por defecto NO, para que
-- una llamada nueva que lo olvide no se salte el plan) = el plan del estudio
-- incluye gamificación (lo evalúa el servidor con BILLING_ENFORCED); revertir
-- no depende de él: un cobro devuelto no se queda los créditos porque el
-- estudio cambiara de plan entre medias.
--
-- ⚠️ Las columnas de salida no se llaman como ninguna columna que se lea
-- dentro (`socio_id`, `creditos`, `saldo`): con RETURNS TABLE serían variables
-- y cualquier referencia sin alias daría 42702 (ya pasó en Fase 2b).
create or replace function public.sincronizar_creditos_renovacion(
  p_studio_id text, p_recibo_id text, p_puede_otorgar boolean default false
)
  returns table(resultado text, socia text, creditos_movidos integer, saldo_final integer)
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $function$
declare
  v_socio text;
  v_accion_id text;
  v_accion_socio text;
  v_creditos int;
  v_saldo int;
  v_quita int;
  v_deuda int;
begin
  if not public.es_llamada_servicio() then
    raise exception 'NO_AUTORIZADO';
  end if;
  if p_studio_id is null or p_recibo_id is null then
    return query select 'NADA'::text, null::text, 0, null::integer;
    return;
  end if;

  -- Un cobro y una devolución del mismo recibo a la vez se ponen en fila.
  perform pg_advisory_xact_lock(hashtextextended('creditos-renovacion|' || p_studio_id || '|' || p_recibo_id, 0));

  select rc.socio_id into v_socio
    from recibos rc where rc.id = p_recibo_id and rc.studio_id = p_studio_id;
  select ra.id, ra.socio_id into v_accion_id, v_accion_socio
    from reward_actions ra
    where ra.studio_id = p_studio_id and ra.trigger = 'RENOVACION_PLAN' and ra.ref_id = p_recibo_id;

  if public.recibo_cobro_vigente(p_recibo_id, p_studio_id) then
    -- Cobrado. Si ya los dio, no se vuelve a mirar si «sigue siendo»
    -- renovación: lo que se ganó al pagar no se quita por un cambio posterior
    -- en la ficha. Solo se quita si el dinero vuelve.
    if v_accion_id is not null or v_socio is null or not coalesce(p_puede_otorgar, false)
       or not public.recibo_es_renovacion_para_creditos(p_recibo_id, p_studio_id) then
      return query select 'NADA'::text, v_socio, 0, null::integer;
      return;
    end if;
    begin
      select o.creditos, o.saldo into v_creditos, v_saldo
        from public.otorgar_credito_disparador(p_studio_id, v_socio, 'RENOVACION_PLAN', p_recibo_id) o;
    exception when raise_exception then
      -- «No toca»: el estudio no tiene la regla activa. No es un error.
      if sqlerrm in ('SIN_REGLA_ACTIVA', 'CONDICION_NO_CUMPLIDA') then
        return query select 'NADA'::text, v_socio, 0, null::integer;
        return;
      end if;
      raise;
    end;
    return query select
      case when coalesce(v_creditos, 0) > 0 then 'OTORGADO' else 'NADA' end,
      v_socio, coalesce(v_creditos, 0), v_saldo;
    return;
  end if;

  -- El dinero ya no está. Si este recibo dio créditos, se revierten.
  if v_accion_id is null then
    return query select 'NADA'::text, v_socio, 0, null::integer;
    return;
  end if;

  select rh.creditos into v_creditos
    from reward_history rh
    where rh.action_id = v_accion_id and rh.studio_id = p_studio_id
    order by rh.creado_en desc limit 1;
  if v_creditos is null then
    select ct.creditos into v_creditos
      from credit_transactions ct
      where ct.studio_id = p_studio_id and ct.ref_id = p_recibo_id and ct.tipo = 'GANANCIA'
      order by ct.creado_en desc limit 1;
  end if;
  v_creditos := greatest(coalesce(v_creditos, 0), 0);

  -- Lo que se revierte no se ganó: fuera de `reward_history` (el feed de lo
  -- ganado) y fuera la marca de idempotencia. La constancia de las dos cosas
  -- queda en `credit_transactions`: la GANANCIA y la REVERSION de este recibo.
  delete from reward_history rh where rh.action_id = v_accion_id and rh.studio_id = p_studio_id;
  delete from reward_actions ra where ra.id = v_accion_id;

  if v_creditos = 0 or v_accion_socio is null then
    return query select 'REVERTIDO'::text, v_accion_socio, 0, null::integer;
    return;
  end if;

  select mc.saldo into v_saldo
    from member_credits mc
    where mc.socio_id = v_accion_socio and mc.studio_id = p_studio_id
    for update;
  if not found then
    return query select 'REVERTIDO'::text, v_accion_socio, 0, null::integer;
    return;
  end if;

  -- Lo que queda en el saldo se retira; lo que ya gastó queda por compensar.
  -- Del saldo GUARDADO, no del vivo: si caducaron, no los gastó, y no hay
  -- nada que deberle al estudio por ellos.
  v_quita := least(greatest(v_saldo, 0), v_creditos);
  v_deuda := v_creditos - v_quita;

  update member_credits mc
     set saldo = mc.saldo - v_quita,
         total_ganado = greatest(0, mc.total_ganado - v_creditos),
         creditos_por_compensar = mc.creditos_por_compensar + v_deuda,
         actualizado_en = now()
   where mc.socio_id = v_accion_socio and mc.studio_id = p_studio_id
  returning mc.saldo into v_saldo;

  insert into credit_transactions (id, studio_id, socio_id, tipo, creditos, descripcion, ref_id, creado_en)
  values (
    'ctx-rev-' || substr(md5(p_recibo_id || '|' || clock_timestamp()::text || '|' || random()::text), 1, 20),
    p_studio_id, v_accion_socio, 'REVERSION', -v_creditos,
    case when v_deuda > 0
      then format('Renovación devuelta: se retiran %s créditos (%s ya gastados, se descontarán de los próximos)', v_creditos, v_deuda)
      else format('Renovación devuelta: se retiran %s créditos', v_creditos)
    end,
    p_recibo_id, now()
  );

  return query select 'REVERTIDO'::text, v_accion_socio, v_creditos, v_saldo;
end;
$function$;

-- ── La deuda se cobra de lo próximo que entre ───────────────────────────────
-- Entra saldo cuando sube `total_ganado` (se gana) o baja `total_canjeado` (se
-- cancela un canje y vuelven créditos que se habían gastado). De eso se
-- descuenta la deuda, sin bajar el saldo de cero. Si la propia sentencia
-- mueve `creditos_por_compensar` (la reversión, o un arreglo a mano), no se
-- compensa encima.
create or replace function public.member_credits_deuda()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $function$
declare
  v_entra int;
  v_compensa int;
begin
  if tg_op <> 'UPDATE' or coalesce(old.creditos_por_compensar, 0) <= 0 then
    return new;
  end if;
  if new.creditos_por_compensar is distinct from old.creditos_por_compensar then
    return new;
  end if;
  v_entra := greatest(new.total_ganado - old.total_ganado, 0)
           + greatest(old.total_canjeado - new.total_canjeado, 0);
  v_compensa := least(v_entra, old.creditos_por_compensar, greatest(new.saldo, 0));
  if v_compensa <= 0 then
    return new;
  end if;

  new.saldo := new.saldo - v_compensa;
  new.creditos_por_compensar := old.creditos_por_compensar - v_compensa;

  insert into credit_transactions (id, studio_id, socio_id, tipo, creditos, descripcion, ref_id, creado_en)
  values (
    'ctx-comp-' || substr(md5(new.socio_id || '|' || clock_timestamp()::text || '|' || random()::text), 1, 20),
    new.studio_id, new.socio_id, 'COMPENSACION', -v_compensa,
    format('Se descuentan %s créditos de una renovación devuelta', v_compensa),
    null, now()
  );
  return new;
end;
$function$;

drop trigger if exists member_credits_deuda on public.member_credits;
create trigger member_credits_deuda
  before update on public.member_credits
  for each row execute function public.member_credits_deuda();

-- ── Permisos ────────────────────────────────────────────────────────────────
-- `pg_default_acl` da EXECUTE directo a anon/authenticated en toda función
-- nueva: revocar PUBLIC no basta (tentare-os, `reservar_numero_factura`).
-- Verificar después con has_function_privilege para los tres roles.
revoke all on function public.recibo_cobro_vigente(text, text) from public, anon, authenticated;
grant execute on function public.recibo_cobro_vigente(text, text) to service_role;
revoke all on function public.recibo_es_renovacion_para_creditos(text, text) from public, anon, authenticated;
grant execute on function public.recibo_es_renovacion_para_creditos(text, text) to service_role;
revoke all on function public.sincronizar_creditos_renovacion(text, text, boolean) from public, anon, authenticated;
grant execute on function public.sincronizar_creditos_renovacion(text, text, boolean) to service_role;
revoke all on function public.member_credits_deuda() from public, anon, authenticated;

-- Misma firma: conserva sus grants. Se reafirman igual que en 20260914001133.
revoke all on function public.otorgar_credito_disparador(text, text, text, text, text) from public, anon;
grant execute on function public.otorgar_credito_disparador(text, text, text, text, text) to authenticated, service_role;
