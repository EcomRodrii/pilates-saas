-- ═══════════════════════════════════════════════════════════════════════════
-- Cambiar de cuota a una MÁS CARA cobrando la diferencia proporcional, TODO O
-- NADA (petición real de un estudio, 2026-10-21).
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Por qué una función y no tres escrituras desde el servidor. El cambio son tres
-- cosas: la cuota nueva, el recibo de la diferencia y la baja de la antigua.
-- Hechas por separado, un fallo a medias deja una de estas dos cosas, y las dos
-- son dinero: dos cuotas activas a la vez (se renuevan las dos), o una cuota
-- nueva SIN recibo de lo que debe. En una función cualquier fallo lo deshace
-- todo. Y es idempotente: los ids salen de la cuota que se cambia
-- (`sus-camb-<id>`, `rec-camb-<id>`), así que repetir la petición —doble clic,
-- red que reintenta— no crea nada dos veces y devuelve lo ya hecho.
--
-- Lo que decide el IMPORTE no está aquí: lo calcula el servidor con
-- `diferenciaCambioPlan` (lib/billing/prorrateo.ts) y esta función lo recibe
-- como dato. Por eso solo la puede llamar el servidor (service_role), que pone el
-- estudio de la sesión y recalcula el importe; nunca el navegador.
--
-- Reglas que la función comprueba por su cuenta, BAJO EL CANDADO (el servidor las
-- lee antes; aquí se revalidan):
--   · La cuota actual es de `p_studio_id`, de `p_socio_id`, está ACTIVA, no es de
--     Stripe, conserva la `fecha_fin` que el servidor usó para el importe y no
--     tiene recibos sin cobrar.
--   · El plan nuevo es de ese estudio, está activo, es MENSUAL de un mes y distinto.
--   · Un solo cambio por cuota: tras el cambio la antigua deja de estar ACTIVA.
--
-- La cuota nueva HEREDA `fecha_fin` (la renovación no se mueve: el siguiente
-- cobro, por el plan nuevo entero, llega el mismo día de siempre) y
-- `baja_al_vencer`. Sin sesiones (es una cuota). El recibo nace PENDIENTE, ligado
-- a la cuota NUEVA (si colgara de la antigua, cancelarla le aplicaría la política
-- de «qué hacer con los recibos pendientes al cancelar una cuota»).
--
-- Grants en TRES pasos: en este proyecto `pg_default_acl` concede EXECUTE directo
-- a anon/authenticated y `revoke ... from public` no basta
-- (.claude/tentare-os.md). Se verifica al final con `has_function_privilege` y la
-- migración FALLA si algún rol del cliente puede ejecutarla.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.cambiar_cuota_con_diferencia(
  p_studio_id text,
  p_socio_id text,
  p_sus_actual_id text,
  p_plan_nuevo_id text,
  p_importe numeric,
  p_concepto text,
  p_hoy date,
  p_fecha_fin_esperada date
) returns jsonb
 language plpgsql
 security definer
 set search_path = ''
as $function$
declare
  v_actual public.suscripciones%rowtype;
  v_plan public.planes_tarifa%rowtype;
  v_nueva_id text := 'sus-camb-' || p_sus_actual_id;
  v_recibo_id text := 'rec-camb-' || p_sus_actual_id;
begin
  if p_importe is null or p_importe <= 0 or p_importe > 10000 then
    raise exception 'importe no válido' using errcode = '22023';
  end if;
  p_importe := round(p_importe, 2);

  -- Candado sobre la cuota que se cambia: dos peticiones a la vez se serializan.
  select * into v_actual from public.suscripciones
   where id = p_sus_actual_id and studio_id = p_studio_id
   for update;
  if not found then
    raise exception 'cuota no encontrada' using errcode = 'P0002';
  end if;

  -- Reintento: el cambio ya se hizo (la antigua ya está CANCELADA y la nueva es de
  -- ESTA clienta y de ESTE plan). Se devuelve lo hecho, no se repite. Si la nueva
  -- existe pero la antigua volvió a estar ACTIVA (alguien la reactivó), NO es un
  -- reintento: se rechaza para no dejar dos cuotas activas.
  if exists (select 1 from public.suscripciones where id = v_nueva_id and studio_id = p_studio_id) then
    if v_actual.estado = 'CANCELADA'
       and exists (select 1 from public.suscripciones
                    where id = v_nueva_id and studio_id = p_studio_id
                      and socio_id = p_socio_id and plan_id = p_plan_nuevo_id) then
      return jsonb_build_object('ya_hecho', true, 'suscripcion_id', v_nueva_id, 'recibo_id', v_recibo_id);
    end if;
    raise exception 'este cambio ya se hizo con otro plan o la cuota se reactivó' using errcode = 'P0001';
  end if;

  if v_actual.estado <> 'ACTIVA' or v_actual.socio_id is distinct from p_socio_id then
    raise exception 'la cuota ya no está activa o no es de esta clienta' using errcode = 'P0001';
  end if;
  -- Una cuota gestionada por Stripe se cancelaría aquí sin avisar a Stripe.
  if v_actual.stripe_subscription_id is not null then
    raise exception 'cuota gestionada por Stripe' using errcode = 'P0001';
  end if;
  if v_actual.plan_id = p_plan_nuevo_id then
    raise exception 'ya tiene ese plan' using errcode = 'P0001';
  end if;
  -- Lo que el servidor calculó (el importe) vale solo si la cuota sigue como la leyó.
  if v_actual.fecha_fin is distinct from p_fecha_fin_esperada then
    raise exception 'la fecha de renovación ha cambiado' using errcode = 'P0001';
  end if;
  -- El ciclo en curso tiene que estar pagado: con un recibo sin cobrar, cancelar la
  -- antigua le aplicaría la política de recibos pendientes al cancelar una cuota.
  if exists (select 1 from public.recibos
              where studio_id = p_studio_id and suscripcion_id = p_sus_actual_id
                and estado in ('PENDIENTE', 'EN_CURSO', 'FALLIDO')) then
    raise exception 'la cuota tiene un recibo sin cobrar' using errcode = 'P0001';
  end if;

  select * into v_plan from public.planes_tarifa
   where id = p_plan_nuevo_id and studio_id = p_studio_id;
  if not found or v_plan.tipo <> 'MENSUAL' or v_plan.activo is not true
     or coalesce(v_plan.periodicidad_meses, 1) <> 1 then
    raise exception 'plan nuevo no válido' using errcode = 'P0001';
  end if;

  insert into public.suscripciones
    (id, studio_id, socio_id, plan_id, estado, fecha_inicio, fecha_fin,
     sesiones_restantes, stripe_subscription_id, baja_al_vencer)
  values
    (v_nueva_id, p_studio_id, p_socio_id, p_plan_nuevo_id, 'ACTIVA', p_hoy, v_actual.fecha_fin,
     null, null, coalesce(v_actual.baja_al_vencer, false));

  insert into public.recibos
    (id, studio_id, socio_id, suscripcion_id, concepto, importe, estado,
     fecha_vencimiento, fecha_cobro, fecha_devolucion, intentos_reintento)
  values
    (v_recibo_id, p_studio_id, p_socio_id, v_nueva_id, p_concepto, p_importe, 'PENDIENTE',
     p_hoy, null, null, 0);

  update public.suscripciones set estado = 'CANCELADA'
   where id = p_sus_actual_id and studio_id = p_studio_id;

  return jsonb_build_object('ya_hecho', false, 'suscripcion_id', v_nueva_id, 'recibo_id', v_recibo_id);
end;
$function$;

revoke execute on function public.cambiar_cuota_con_diferencia(text, text, text, text, numeric, text, date, date) from public;
revoke execute on function public.cambiar_cuota_con_diferencia(text, text, text, text, numeric, text, date, date) from anon;
revoke execute on function public.cambiar_cuota_con_diferencia(text, text, text, text, numeric, text, date, date) from authenticated;
grant execute on function public.cambiar_cuota_con_diferencia(text, text, text, text, numeric, text, date, date) to service_role;

-- Verificación: nadie del cliente puede ejecutarla (no se fía del comentario).
do $verifica$
declare
  f oid := 'public.cambiar_cuota_con_diferencia(text, text, text, text, numeric, text, date, date)'::regprocedure;
begin
  if has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE') then
    raise exception 'cambiar_cuota_con_diferencia es ejecutable desde el cliente';
  end if;
  if not has_function_privilege('service_role', f, 'EXECUTE') then
    raise exception 'cambiar_cuota_con_diferencia no es ejecutable por service_role';
  end if;
end
$verifica$;
