-- Drill de 20260915215311_politica_recibos_al_cancelar_cuota.sql, en producción y
-- sin dejar rastro: un único DO que termina en `raise exception 'DRILL_RESULT …'`,
-- así que el error trae las cifras y deshace todo.
--
-- ⚠️ `studios`, `recibos` y `suscripciones` son tablas calientes: el `lock_timeout`
-- hace que un ALTER que no consigue su lock falle en 3 s en vez de dejar en cola
-- las lecturas del panel.
--
-- Antes de aplicar, pega las sentencias de la migración en los `execute $mig$ … $mig$`
-- marcados (`$function$` → `$f$`). Después de aplicarla, quítalos.
--
-- Usa la primera cuota MENSUAL que tenga un recibo propio (si no hay, todo null) y
-- comprueba, al pasarla a CANCELADA:
--   · MANTENER_CON_REINTENTOS → PENDIENTE, marca REINTENTAR, conserva el reintento;
--   · MANTENER_SIN_REINTENTOS → PENDIENTE, marca SIN_REINTENTOS, sin reintento;
--   · ANULAR → ANULADO con `anulado_en`;
--   · ANULAR con un pago en marcha → no se anula: PENDIENTE sin reintentos;
--   · CANCELADA → CANCELADA no vuelve a disparar.

do $drill$
declare
  v_sus text; v_rec text; v_studio text;
  v_con jsonb; v_sin jsonb; v_anular jsonb; v_con_pago jsonb; v_recancelar jsonb;
begin
  perform set_config('lock_timeout', '3000', true);
  perform set_config('statement_timeout', '20000', true);

  -- execute $mig$ <sentencias de la migración> $mig$;

  select su.id, r.id, su.studio_id into v_sus, v_rec, v_studio
  from suscripciones su
  join planes_tarifa pt on pt.id = su.plan_id and pt.tipo = 'MENSUAL'
  join recibos r on r.suscripcion_id = su.id and r.studio_id = su.studio_id
  order by su.fecha_inicio desc
  limit 1;

  if v_sus is not null then
    update suscripciones set estado = 'ACTIVA' where id = v_sus;
    update recibos set estado = 'PENDIENTE', tras_cancelar_cuota = null, anulado_en = null,
      proximo_reintento = now() + interval '1 day', stripe_payment_intent_id = null, checkout_session_id = null, cobro_mostrador_pi = null
     where id = v_rec;
    update studios set recibos_al_cancelar_cuota = 'MANTENER_CON_REINTENTOS' where id = v_studio;
    update suscripciones set estado = 'CANCELADA' where id = v_sus;
    select jsonb_build_object('estado', estado, 'marca', tras_cancelar_cuota, 'reintento', proximo_reintento is not null) into v_con from recibos where id = v_rec;

    update suscripciones set estado = 'ACTIVA' where id = v_sus;
    update recibos set tras_cancelar_cuota = null, proximo_reintento = now() + interval '1 day' where id = v_rec;
    update studios set recibos_al_cancelar_cuota = 'MANTENER_SIN_REINTENTOS' where id = v_studio;
    update suscripciones set estado = 'CANCELADA' where id = v_sus;
    select jsonb_build_object('estado', estado, 'marca', tras_cancelar_cuota, 'reintento', proximo_reintento is not null) into v_sin from recibos where id = v_rec;

    update suscripciones set estado = 'ACTIVA' where id = v_sus;
    update recibos set tras_cancelar_cuota = null, proximo_reintento = now() + interval '1 day' where id = v_rec;
    update studios set recibos_al_cancelar_cuota = 'ANULAR' where id = v_studio;
    update suscripciones set estado = 'CANCELADA' where id = v_sus;
    select jsonb_build_object('estado', estado, 'marca', tras_cancelar_cuota, 'anulado_en', anulado_en is not null) into v_anular from recibos where id = v_rec;

    update suscripciones set estado = 'ACTIVA' where id = v_sus;
    update recibos set estado = 'PENDIENTE', anulado_en = null, tras_cancelar_cuota = null,
      proximo_reintento = now() + interval '1 day', stripe_payment_intent_id = 'pi_drill' where id = v_rec;
    update suscripciones set estado = 'CANCELADA' where id = v_sus;
    select jsonb_build_object('estado', estado, 'marca', tras_cancelar_cuota, 'reintento', proximo_reintento is not null) into v_con_pago from recibos where id = v_rec;

    update recibos set tras_cancelar_cuota = null where id = v_rec;
    update suscripciones set estado = 'CANCELADA' where id = v_sus;
    select jsonb_build_object('marca', tras_cancelar_cuota) into v_recancelar from recibos where id = v_rec;
  end if;

  raise exception 'DRILL_RESULT %', jsonb_build_object(
    'hay_escenario', v_sus is not null, 'con_reintentos', v_con, 'sin_reintentos', v_sin,
    'anular', v_anular, 'anular_con_pago_en_marcha', v_con_pago, 'recancelar_no_dispara', v_recancelar);
end $drill$;
