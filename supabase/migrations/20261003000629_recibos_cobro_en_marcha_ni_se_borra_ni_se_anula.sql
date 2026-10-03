-- Un recibo con un cobro de tarjeta o domiciliación guardada EN MARCHA no se borra ni se anula
-- (3-oct-2026, la parte que quedó fuera de recibos_cobro_off_session_en_marcha).
--
-- Esa migración puso la marca (`cobro_off_session_clave` + `_desde`) y cerró con ella las
-- puertas que COBRAN a mano. Quedaban dos funciones SECURITY DEFINER que quitan el recibo de en
-- medio sin mirarla, y con el cargo ya pedido a Stripe el dinero entraría igual: sobre un recibo
-- borrado (sin nada a lo que asociarse) o sobre uno ANULADO (el trigger de la marca la suelta al
-- salir de PENDIENTE y nadie sabe ya que había un cargo). Hoy solo se veía después, en Sentry,
-- desde `confirmarCobro`.
--
--   1. `eliminar_recibo`: con la marca puesta devuelve PAGO_ASOCIADO, como con un enlace de pago
--      o un cobro de mostrador abiertos. También en FALLIDO: un FALLIDO con marca es un reintento
--      en vuelo, no el intento viejo que ya no puede completarse.
--   2. `aplicar_politica_recibos_al_cancelar_cuota`: ANULAR se salta el recibo con la marca, como
--      ya se saltaba uno con PaymentIntent, enlace de pago o datáfono. Cae en el segundo UPDATE
--      (queda marcado SIN_REINTENTOS) y el cargo en vuelo se resuelve sobre un recibo vivo.
--
-- Las dos carreras quedan cerradas en ambos órdenes: el compare-and-set de la marca
-- (`reservarCobroOffSession`) exige PENDIENTE/FALLIDO, así que si el recibo ya se anuló o se
-- borró no reserva; y si la marca llega antes, `eliminar_recibo` la ve tras su `for update` y el
-- UPDATE de ANULAR vuelve a evaluar su WHERE sobre la fila ya marcada después de esperar al lock.
--
-- Cuerpos copiados de la función VIVA (`pg_get_functiondef` en producción, 3-oct) y cambiado solo
-- lo de arriba. ⚠️ `create or replace` REEMPLAZA los atributos: si el cuerpo nuevo no repitiera
-- `security definer` y su `search_path`, `aplicar_politica_recibos_al_cancelar_cuota` volvería a
-- correr como quien cancela, que ya no puede escribir `anulado_en` ni `tras_cancelar_cuota`
-- (20261002094636), y cancelar una cuota desde el panel fallaría. La firma no cambia, así que el
-- dueño y los GRANT se conservan; el bloque del final lo comprueba igualmente contra lo que había
-- antes (capturado el 3-oct):
--
--   eliminar_recibo(text,text,text)               DEFINER  search_path=""             anon ✗  authenticated ✓  service_role ✓
--   aplicar_politica_recibos_al_cancelar_cuota()  DEFINER  search_path=public, pg_temp anon ✗  authenticated ✗  service_role ✓

create or replace function public.eliminar_recibo(p_studio_id text, p_recibo_id text, p_motivo text)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_r record;
begin
  -- `coalesce(…, false) is not true`: una sesión sin rol da NULL en `puede_mover_dinero()`
  -- y `if not NULL` NO salta, así que la guarda fallaría abierta. Y sin sede no hay nada
  -- que comprobar.
  if p_studio_id is null or coalesce(public.puede_mover_dinero(), false) is not true then
    raise exception 'NO_AUTORIZADO';
  end if;
  perform public.validar_studio_mismatch(p_studio_id);

  -- Lista cerrada: la misma que `lib/recibos-eliminar.ts` (un test las ata).
  if p_motivo is null
     or p_motivo not in ('DUPLICADO', 'IMPORTE_ERRONEO', 'CREADO_POR_ERROR', 'CLIENTA_DE_BAJA', 'OTRO_MOTIVO') then
    raise exception 'MOTIVO_INVALIDO';
  end if;

  -- `for update`: si un webhook o un cobro lo está pasando a COBRADO, espera y
  -- después se ve el estado real, no el de hace un segundo.
  select r.id, r.estado, r.checkout_session_id, r.stripe_payment_intent_id,
         r.cobro_mostrador_pi, r.cobro_mostrador_checkout_session_id, r.cobro_off_session_clave,
         r.fecha_cobro, r.fecha_devolucion, r.importe_devuelto, r.reembolso_stripe_id,
         r.entrega_aplicada, r.conciliado_en
    into v_r
    from public.recibos r
   where r.id = p_recibo_id and r.studio_id = p_studio_id
     for update;
  if not found then
    raise exception 'RECIBO_NO_ENCONTRADO';
  end if;

  -- El dinero cobrado, devuelto o en camino no se borra: se devuelve.
  if v_r.estado not in ('PENDIENTE', 'FALLIDO', 'ANULADO') then
    raise exception 'ESTADO_NO_ELIMINABLE';
  end if;

  -- El estado no prueba que nunca hubo dinero: un adeudo SEPA devuelto por el banco
  -- vuelve a PENDIENTE o FALLIDO conservando su fecha de cobro, y un ANULADO puede
  -- haber sido cobrado o devuelto antes.
  if v_r.fecha_cobro is not null
     or v_r.fecha_devolucion is not null
     or coalesce(v_r.importe_devuelto, 0) > 0
     or v_r.reembolso_stripe_id is not null
     or coalesce(v_r.entrega_aplicada, false)
     or v_r.conciliado_en is not null
     or exists (select 1 from public.devoluciones d where d.recibo_id = p_recibo_id) then
    raise exception 'TIENE_COBRO_PREVIO';
  end if;

  -- Un enlace de pago o un cobro de mostrador abiertos aún pueden completarse; sin
  -- recibo, ese dinero no tendría a qué asociarse. Un intento FALLIDO (solo el
  -- PaymentIntent) ya no puede completarse. Un cobro con la tarjeta o la domiciliación
  -- guardada en marcha (la marca de `cobrarReciboOffSession`) sí, también sobre un
  -- FALLIDO que se está reintentando.
  if v_r.checkout_session_id is not null
     or v_r.cobro_mostrador_checkout_session_id is not null
     or v_r.cobro_mostrador_pi is not null
     or v_r.cobro_off_session_clave is not null
     or (v_r.stripe_payment_intent_id is not null and v_r.estado <> 'FALLIDO') then
    raise exception 'PAGO_ASOCIADO';
  end if;

  if exists (select 1 from public.facturas f where f.recibo_id = p_recibo_id) then
    raise exception 'TIENE_FACTURA';
  end if;
  if exists (select 1 from public.penalizaciones p where p.recibo_id = p_recibo_id) then
    raise exception 'ES_PENALIZACION';
  end if;

  -- Variable LOCAL a esta transacción: la lee el trigger de auditoría del DELETE.
  perform set_config('tentare.motivo_auditoria', p_motivo, true);

  delete from public.recibos where id = p_recibo_id and studio_id = p_studio_id;

  -- Y se limpia al terminar: que un motivo no pueda «viajar» a otro cambio que se
  -- haga después en la misma transacción.
  perform set_config('tentare.motivo_auditoria', '', true);
end;
$function$;

-- La misma decisión sobre anon de 20260925175253 (la llama el panel con la sesión de la persona).
-- No cambia nada: la firma es la misma y ya no tenían EXECUTE ni PUBLIC ni anon (el `proacl` vivo
-- del 3-oct no los lista). Se escribe para que la decisión conste en la migración que redefine la
-- función (`lib/rgpd-grants-anon-guardias-contrato.test.ts`); se añadió al fichero después de
-- aplicarlo, sin efecto en producción por lo mismo.
revoke all on function public.eliminar_recibo(text, text, text) from public, anon;

create or replace function public.aplicar_politica_recibos_al_cancelar_cuota()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_politica text;
begin
  select coalesce(st.recibos_al_cancelar_cuota, 'MANTENER_CON_REINTENTOS')
    into v_politica
    from studios st where st.id = new.studio_id;

  -- Anular: solo lo que no tiene ningún pago en marcha ni factura (compare-and-set).
  -- Tampoco un cobro con la tarjeta o la domiciliación guardada en marcha: el cargo
  -- puede entrar en Stripe en cualquier momento y tiene que encontrar su recibo vivo.
  if v_politica = 'ANULAR' then
    update recibos r set
      estado = 'ANULADO', anulado_en = now(), tras_cancelar_cuota = 'ANULADO', proximo_reintento = null
    where r.suscripcion_id = new.id and r.studio_id = new.studio_id
      and r.estado = 'PENDIENTE' and r.tras_cancelar_cuota is null
      and r.stripe_payment_intent_id is null and r.checkout_session_id is null and r.cobro_mostrador_pi is null
      and r.cobro_off_session_clave is null
      and not exists (select 1 from facturas f where f.recibo_id = r.id);
  end if;

  -- El resto de pendientes (o los que no se pudieron anular): marcados, con o sin
  -- reintentos según la política.
  update recibos r set
    tras_cancelar_cuota = case when v_politica = 'MANTENER_CON_REINTENTOS' then 'REINTENTAR' else 'SIN_REINTENTOS' end,
    proximo_reintento   = case when v_politica = 'MANTENER_CON_REINTENTOS' then r.proximo_reintento else null end
  where r.suscripcion_id = new.id and r.studio_id = new.studio_id
    and r.estado = 'PENDIENTE' and r.tras_cancelar_cuota is null;

  return new;
end;
$function$;

-- Ídem (20260915215311): es un trigger, nadie del cliente la llama.
revoke all on function public.aplicar_politica_recibos_al_cancelar_cuota() from public, anon, authenticated;

-- ── Verificación ─────────────────────────────────────────────────────────────
-- Atributos y permisos IGUALES a los de antes (tabla de la cabecera), y la regla nueva en el cuerpo.
do $$
declare
  v_eliminar regprocedure := 'public.eliminar_recibo(text, text, text)'::regprocedure;
  v_politica regprocedure := 'public.aplicar_politica_recibos_al_cancelar_cuota()'::regprocedure;
  v_src text;
begin
  if not exists (select 1 from pg_proc p where p.oid = v_eliminar
                  and p.prosecdef and p.proconfig = array['search_path=""']) then
    raise exception 'eliminar_recibo dejó de ser SECURITY DEFINER con search_path vacío';
  end if;
  if not exists (select 1 from pg_proc p where p.oid = v_politica
                  and p.prosecdef and p.proconfig = array['search_path=public, pg_temp']) then
    raise exception 'aplicar_politica_recibos_al_cancelar_cuota dejó de ser SECURITY DEFINER con search_path public, pg_temp: cancelar una cuota desde el panel fallaría';
  end if;

  if has_function_privilege('anon', v_eliminar, 'EXECUTE')
     or not has_function_privilege('authenticated', v_eliminar, 'EXECUTE')
     or not has_function_privilege('service_role', v_eliminar, 'EXECUTE') then
    raise exception 'los permisos de eliminar_recibo cambiaron (esperado: anon no; authenticated y service_role sí)';
  end if;
  if has_function_privilege('anon', v_politica, 'EXECUTE')
     or has_function_privilege('authenticated', v_politica, 'EXECUTE')
     or not has_function_privilege('service_role', v_politica, 'EXECUTE') then
    raise exception 'los permisos de aplicar_politica_recibos_al_cancelar_cuota cambiaron (esperado: anon y authenticated no; service_role sí)';
  end if;

  select p.prosrc into v_src from pg_proc p where p.oid = v_eliminar;
  if position('r.cobro_off_session_clave,' in v_src) = 0
     or position('or v_r.cobro_off_session_clave is not null' in v_src) = 0 then
    raise exception 'eliminar_recibo no mira la marca de cobro en marcha';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid = v_politica;
  if position('and r.cobro_off_session_clave is null' in v_src) = 0 then
    raise exception 'ANULAR de aplicar_politica_recibos_al_cancelar_cuota no se salta la marca de cobro en marcha';
  end if;
end $$;
