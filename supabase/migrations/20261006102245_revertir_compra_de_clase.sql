-- ─────────────────────────────────────────────────────────────────────────────
-- PR-14 · Devolver el dinero de una clase COMPENSADA la saca de la cola y del bono
-- (P06, Fase A del bloque de dinero de la app de la alumna, 6-oct-2026).
--
-- Un pago de clase COMPENSADA (pagó y se quedó en la espera, pendiente de aprobar,
-- o la plaza la pagó otro bono suyo) deja dos cosas a su favor: la suscripción que
-- entregó el pago (`sus-web-…`) y, en espera, su sitio en la cola con PRIORIDAD.
-- Si el estudio le devuelve el dinero ENTERO (o pierde la disputa), las dos tienen
-- que irse con él: si no, la alumna conserva el bono que ya no ha pagado y, si se
-- libera plaza, la promoción se lo gasta.
--
-- `revertir_compra_de_clase(p_studio_id, p_pago_clase_id)`, en UNA transacción:
--   1. bloquea la fila del pago; si no está COMPENSADA, no hace nada (idempotente:
--      la segunda llamada la encuentra REEMBOLSADA);
--   2. si su reserva `res-web-…` sigue en LISTA_ESPERA o PENDIENTE_APROBACION, la
--      cancela (posición y oferta a null), le devuelve la recuperación si la usó y
--      renumera la cola. Si tenía una OFERTA viva, el hueco pasa a la siguiente
--      (como `cancelar_reserva_plaza`), y se devuelve a quién para que el servidor
--      avise y descuente;
--   3. si la suscripción entregada está INTACTA (saldo = lo que dejó la entrega según
--      la foto del recibo del plan, ningún CONSUMO_BONO en el ledger y ninguna reserva
--      viva pagada con ella), la deja a 0 y CANCELADA —lo mismo que «Revertir» del
--      panel hace con un ALTA_WEB— con el movimiento etiquetado REVERSION_VENTA, y
--      cierra la revisión PENDIENTE de esa devolución como REVERTIDA (automática). Si
--      ya se usó (BONO_USADO), es una cuota (NO_ES_BONO) o la propietaria ya decidió
--      dejárselo / una devolución anterior falló (DECIDIDO_A_MANO), NO se toca: queda
--      la revisión PENDIENTE_REVISION de siempre (lib/billing/registrar-devolucion.ts),
--      con los números delante;
--   4. el pago pasa a REEMBOLSADA.
--
-- La llama SOLO el servidor (webhook `charge.refunded` total / `charge.dispute.closed`
-- perdida, y el conciliador de reembolsos): service_role. Función nueva: el
-- pg_default_acl le da EXECUTE directo a anon/authenticated, así que los tres pasos.
--
-- ⚠️ «No se actualizó ninguna fila» se mira con la variable del RETURNING, nunca con
-- `not found`: el PERFORM del contexto del ledger también fija FOUND.
-- ⚠️ Columnas siempre con alias de tabla (gotcha 42702 de RETURNS TABLE).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.revertir_compra_de_clase(p_studio_id text, p_pago_clase_id text)
 returns table(
   cambiado boolean,
   estado_pago text,
   reserva_cancelada boolean,
   bono_revertido boolean,
   motivo_sin_revertir text,
   sesion_clase_id text,
   suscripcion_entregada_id text,
   promovida_id text,
   oferta_id text,
   oferta_hasta timestamp with time zone
 )
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_pago public.pagos_clase%rowtype;
  v_res_estado text;
  v_res_sesion text;
  v_tenia_oferta boolean;
  v_cancelada_id text;
  v_reserva_cancelada boolean := false;
  v_plazo int;
  v_promo text;
  v_oferta text;
  v_oferta_hasta timestamptz;
  v_saldo int;
  v_sus_estado text;
  v_sesiones_plan int;
  v_sesiones_entregadas int;
  v_recibo_id text;
  v_saldo_nuevo int;
  v_revertido boolean := false;
  v_motivo text;
  v_final text;
begin
  -- Defensa en profundidad: la cierran los grants (solo service_role), pero si un cambio de
  -- firma la dejara abierta, un `p_studio_id` libre la haría cruzar estudios.
  if not public.es_llamada_servicio() then
    raise exception 'NO_AUTORIZADO';
  end if;

  -- 1. El pago, bloqueado. Solo COMPENSADA se revierte.
  select pc.* into v_pago from public.pagos_clase as pc
   where pc.id = p_pago_clase_id and pc.studio_id = p_studio_id
   for update;
  if v_pago.id is null then
    return;
  end if;
  if v_pago.estado <> 'COMPENSADA' then
    return query select false, v_pago.estado, false, false, null::text, v_pago.sesion_id, v_pago.suscripcion_id,
                        null::text, null::text, null::timestamptz;
    return;
  end if;

  -- 2. Su sitio en la cola (o su petición pendiente), solo la reserva nacida de ESTE pago.
  --    Mismo orden de candados que `cancelar_reserva_plaza`: la reserva, luego la sesión.
  if v_pago.reserva_id like 'res-web-%' and v_pago.motivo in ('EN_ESPERA', 'PENDIENTE_APROBACION') then
    -- La cola que se toca es la de la RESERVA (no la que diga el pago).
    select r.estado, (r.oferta_expira_en is not null), r.sesion_id into v_res_estado, v_tenia_oferta, v_res_sesion
      from public.reservas as r
     where r.id = v_pago.reserva_id and r.studio_id = p_studio_id
     for update;
    if v_res_estado in ('LISTA_ESPERA', 'PENDIENTE_APROBACION') then
      perform 1 from public.sesiones as s where s.id = v_res_sesion and s.studio_id = p_studio_id for update;

      update public.reservas as r
         set estado = 'CANCELADA', posicion_espera = null, oferta_expira_en = null
       where r.id = v_pago.reserva_id and r.studio_id = p_studio_id
         and r.estado in ('LISTA_ESPERA', 'PENDIENTE_APROBACION')
      returning r.id into v_cancelada_id;
      v_reserva_cancelada := v_cancelada_id is not null;

      if v_reserva_cancelada then
        update public.recuperaciones as rc
           set estado = 'DISPONIBLE', usada_en_reserva_id = null
         where rc.usada_en_reserva_id = v_pago.reserva_id and rc.estado = 'USADA';

        -- Tenía la oferta del hueco: pasa a la siguiente, como al cancelar.
        if v_res_estado = 'LISTA_ESPERA' and v_tenia_oferta then
          select coalesce(tc.lista_espera_plazo_aceptacion_minutos, st.lista_espera_plazo_aceptacion_minutos)
            into v_plazo
            from public.studios as st
            left join public.sesiones as ss on ss.id = v_res_sesion and ss.studio_id = p_studio_id
            left join public.tipos_clase as tc on tc.id = ss.tipo_clase_id and tc.studio_id = p_studio_id
           where st.id = p_studio_id;
          select pse.promovida_socio_id, pse.oferta_socio_id, pse.oferta_expira_en
            into v_promo, v_oferta, v_oferta_hasta
            from public.promocionar_siguiente_espera(p_studio_id, v_res_sesion, v_plazo) as pse;
        end if;

        perform public.renumerar_lista_espera(v_res_sesion);
      end if;
    end if;
  end if;

  -- 3. La suscripción que entregó el pago: se retira solo si está intacta.
  if v_pago.suscripcion_id is null then
    v_motivo := 'SIN_SUSCRIPCION';
  else
    -- `left join`: un plan borrado no puede esconder la suscripción («no existe»).
    select s.sesiones_restantes, s.estado, p.sesiones into v_saldo, v_sus_estado, v_sesiones_plan
      from public.suscripciones as s
      left join public.planes_tarifa as p on p.id = s.plan_id
     where s.id = v_pago.suscripcion_id and s.studio_id = p_studio_id
     for update of s;
    -- «Intacta» se mide contra lo que DEJÓ la entrega (la foto del recibo del plan), no
    -- contra el plan de hoy, que el estudio puede haber editado después.
    select rc.id, rc.entrega_sesiones_despues into v_recibo_id, v_sesiones_entregadas
      from public.recibos as rc
     where rc.studio_id = p_studio_id and rc.suscripcion_id = v_pago.suscripcion_id
       and rc.id like 'rec-web-%' and rc.id not like 'rec-web-mat-%'
     order by rc.id limit 1;
    v_sesiones_entregadas := coalesce(v_sesiones_entregadas, v_sesiones_plan);

    if v_sus_estado is null then
      v_motivo := 'SIN_SUSCRIPCION';
    elsif v_sus_estado = 'CANCELADA' then
      v_motivo := 'YA_CANCELADA';
    elsif v_saldo is null then
      -- Una cuota (sin sesiones que contar): no hay «intacta» que medir. A mano.
      v_motivo := 'NO_ES_BONO';
    elsif exists (select 1 from public.devoluciones as dv
                   where dv.studio_id = p_studio_id and dv.suscripcion_id = v_pago.suscripcion_id
                     and dv.estado in ('DESCARTADA', 'ANULADA_REEMBOLSO_FALLIDO')) then
      -- La propietaria ya decidió dejárselo («Descartar»), o una devolución anterior
      -- falló: lo que haya, se decide a mano, nunca lo pisa una reversión automática.
      v_motivo := 'DECIDIDO_A_MANO';
    elsif v_sesiones_entregadas is null or v_saldo <> v_sesiones_entregadas
       or exists (select 1 from public.movimientos_derecho as m
                   where m.derecho_tipo = 'SUSCRIPCION' and m.derecho_id = v_pago.suscripcion_id
                     and m.tipo = 'CONSUMO_BONO')
       or exists (select 1 from public.reservas as rv
                   where rv.studio_id = p_studio_id and rv.bono_suscripcion_id = v_pago.suscripcion_id
                     and rv.estado <> 'CANCELADA') then
      v_motivo := 'BONO_USADO';
    else
      perform set_config('tentare.ledger', jsonb_build_object(
        'tipo', 'REVERSION_VENTA', 'motivo', 'reembolso_pago_clase', 'pago_clase_id', v_pago.id,
        'recibo_id', v_recibo_id)::text, true);
      update public.suscripciones as s
         set sesiones_restantes = 0, estado = 'CANCELADA'
       where s.id = v_pago.suscripcion_id and s.studio_id = p_studio_id
         and s.sesiones_restantes = v_saldo
      returning s.sesiones_restantes into v_saldo_nuevo;
      perform set_config('tentare.ledger', '', true);

      if v_saldo_nuevo is null then
        v_motivo := 'BONO_USADO';
      else
        v_revertido := true;
        -- La revisión que dejó la devolución ya no tiene nada que decidir: se cierra
        -- como la cerraría «Revertir» del panel, diciendo que fue automática.
        update public.devoluciones as d
           set estado = 'REVERTIDA', resuelta_en = now(),
               aplicado = jsonb_build_object(
                 'automatica', true, 'origen', 'pago_clase', 'pago_clase_id', v_pago.id,
                 'objetivo', jsonb_build_object('sesionesRestantes', 0, 'estado', 'CANCELADA'),
                 'consumidasDesde', 0)
         where d.studio_id = p_studio_id and d.suscripcion_id = v_pago.suscripcion_id
           and d.estado = 'PENDIENTE_REVISION';
      end if;
    end if;
  end if;

  -- 4. El pago, devuelto.
  update public.pagos_clase as pc
     set estado = 'REEMBOLSADA', resuelta_en = now(), actualizado_en = now()
   where pc.id = v_pago.id and pc.estado = 'COMPENSADA'
  returning pc.estado into v_final;

  return query select v_final is not null, coalesce(v_final, v_pago.estado), v_reserva_cancelada, v_revertido,
                      case when v_revertido then null else v_motivo end,
                      coalesce(v_res_sesion, v_pago.sesion_id), v_pago.suscripcion_id, v_promo, v_oferta, v_oferta_hasta;
end;
$function$;

comment on function public.revertir_compra_de_clase(text, text) is
  'Reembolso total o disputa perdida de un pago de clase COMPENSADA: cancela su reserva de espera/pendiente, retira la suscripción entregada si está intacta (REVERSION_VENTA) y deja el pago REEMBOLSADA. Idempotente. Solo service_role.';

-- Función NUEVA: pg_default_acl le da EXECUTE directo a anon/authenticated. Los tres pasos.
revoke all on function public.revertir_compra_de_clase(text, text) from public;
revoke all on function public.revertir_compra_de_clase(text, text) from anon;
revoke all on function public.revertir_compra_de_clase(text, text) from authenticated;
grant execute on function public.revertir_compra_de_clase(text, text) to service_role, postgres;

-- ── Verificación ─────────────────────────────────────────────────────────────
do $$
declare
  v_fn constant text := 'public.revertir_compra_de_clase(text,text)';
begin
  if has_function_privilege('anon', v_fn, 'EXECUTE') or has_function_privilege('authenticated', v_fn, 'EXECUTE') then
    raise exception 'revertir_compra_de_clase ejecutable desde el cliente';
  end if;
  if not has_function_privilege('service_role', v_fn, 'EXECUTE') then
    raise exception 'service_role no puede ejecutar revertir_compra_de_clase';
  end if;
  -- El ledger tiene que aceptar el tipo que escribe.
  if not exists (
    select 1 from pg_constraint c
     where c.conrelid = 'public.movimientos_derecho'::regclass and c.conname = 'movimientos_derecho_tipo_check'
       and pg_get_constraintdef(c.oid) like '%REVERSION_VENTA%'
  ) then
    raise exception 'movimientos_derecho no admite REVERSION_VENTA';
  end if;
end $$;
