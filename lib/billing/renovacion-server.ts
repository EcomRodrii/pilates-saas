import type { SupabaseClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';

// Aplica la RENOVACIÓN de una suscripción cuando se cobra su recibo, en el
// SERVIDOR. Espejo de aplicarRenovacionSuscripcion del cliente
// (studio-context): esa versión solo corre cuando alguien pulsa "marcar
// cobrado" en el panel — los cobros del barrido de dunning y de los webhooks de
// Stripe marcaban el recibo COBRADO pero dejaban el bono a 0 sesiones y el
// mensual caducado: dinero cobrado sin renovar nada.
//
// Idempotente: el refill de bono solo aplica con sesiones_restantes = 0, y la
// extensión mensual solo si alarga la fecha_fin actual — un webhook duplicado
// no extiende dos veces.
//
// ── Y deja constancia de lo que entregó ──────────────────────────────────────
//
// Además de aplicar, escribe en el recibo QUÉ cambió. Sin eso, cuando se
// devuelve el dinero no hay forma de saber qué habría que deshacer:
// `suscripciones` no tiene `updated_at`, ni triggers, ni histórico de sesiones —
// el saldo es un contador destructivo.
//
// ⚠️ Se guarda el DESPUÉS tanto como el antes. El después es lo que permite
// detectar si alguien tocó la suscripción entre la entrega y la devolución (una
// congelación, otra renovación, un ajuste a mano): si lo de hoy no coincide con
// lo que dejó la entrega, la reversión ya no es exacta y no debe proponerse.

/** La suscripción en un instante, solo en lo que la renovación toca. */
export interface FotoSuscripcion {
  sesionesRestantes: number | null;
  fechaFin: string | null;
  estado: string | null;
}

export interface ResultadoRenovacion {
  /** `false` = se evaluó y no cambió nada. Aquí nunca hay "no lo sé": eso es
   *  ausencia de llamada, y se representa con NULL en la columna del recibo. */
  aplicada: boolean;
  tipo: 'BONO' | 'MENSUAL' | 'NINGUNA';
  antes: FotoSuscripcion | null;
  despues: FotoSuscripcion | null;
}

const SIN_ENTREGA: ResultadoRenovacion = { aplicada: false, tipo: 'NINGUNA', antes: null, despues: null };

export async function aplicarRenovacionServidor(
  admin: SupabaseClient,
  params: { studioId: string; reciboId: string },
): Promise<ResultadoRenovacion> {
  const { studioId, reciboId } = params;

  // El snapshot se guarda en su propio try: si falla, NO puede tirar una
  // renovación ya aplicada (el dinero está cobrado y el servicio entregado). Lo
  // que hace es dejar `entrega_aplicada` en NULL, que es honesto —"no lo sé"— y
  // hará que después no se ofrezca revertir.
  const guardar = async (r: ResultadoRenovacion): Promise<ResultadoRenovacion> => {
    try {
      await admin.from('recibos').update({
        entrega_tipo: r.tipo,
        entrega_aplicada: r.aplicada,
        entrega_aplicada_en: new Date().toISOString(),
        entrega_sesiones_antes: r.antes?.sesionesRestantes ?? null,
        entrega_sesiones_despues: r.despues?.sesionesRestantes ?? null,
        entrega_fecha_fin_antes: r.antes?.fechaFin ?? null,
        entrega_fecha_fin_despues: r.despues?.fechaFin ?? null,
        entrega_estado_antes: r.antes?.estado ?? null,
      }).eq('id', reciboId).eq('studio_id', studioId);
    } catch (e) {
      Sentry.captureException(e instanceof Error ? e : new Error('Fallo al guardar el snapshot de entrega'), {
        level: 'warning', tags: { area: 'cobros', tipo: 'renovacion' }, extra: { reciboId, studioId },
      });
    }
    return r;
  };

  try {
    const { data: rec } = await admin
      .from('recibos')
      .select('suscripcion_id, entrega_tipo, entrega_aplicada, es_renovacion')
      .eq('id', reciboId)
      .eq('studio_id', studioId)
      .maybeSingle();
    // B1/B1b (revisión de D-6): si este recibo YA tiene snapshot de entrega,
    // su renovación ya se decidió — aplicada o no-op — y no hay nada que
    // re-aplicar NI que reescribir. Sin este guard, la reparación muda del
    // webhook (que corre en cada cobro con tarjeta) entraba en el no-op
    // MENSUAL y su `guardar(aplicada: false, antes: <ya renovado>)` PISABA el
    // snapshot bueno — cualquier devolución futura se clasificaba
    // OMITIDA_SIN_ENTREGA y la reversión no se ofrecía nunca. Y una reentrega
    // tardía del webhook (Stripe reintenta días) re-extendía `fecha_fin` de
    // regalo: la idempotencia MENSUAL estaba anclada al RELOJ (`nuevaFin` se
    // calcula con `new Date()`); esto la ancla al RECIBO, espejo del candado
    // por recibo que BONO ya tiene dentro de `renovar_bono_idempotente`.
    // Un recibo solo se cobra una vez (guardia de estados), así que snapshot
    // presente ⇒ la decisión de ESTE recibo ya está tomada.
    if (rec?.entrega_tipo != null) {
      const tipoPrevio: ResultadoRenovacion['tipo'] =
        rec.entrega_tipo === 'BONO' || rec.entrega_tipo === 'MENSUAL' ? rec.entrega_tipo : 'NINGUNA';
      return { aplicada: rec.entrega_aplicada === true, tipo: tipoPrevio, antes: null, despues: null };
    }
    // Sin suscripción no hay nada que entregar (p. ej. una penalización). Se
    // marca NINGUNA en vez de dejarlo en blanco: distingue "no aplicaba" de
    // "no se llegó a mirar".
    if (!rec?.suscripcion_id) return guardar(SIN_ENTREGA);

    // ⚠️ Tener `suscripcion_id` NO significa ser una renovación.
    //
    // Recepción asigna un «Bono 10» desde la ficha y `assignPlan` crea la
    // suscripción YA con sus 10 sesiones más este recibo PENDIENTE. Cobrarlo
    // online entraba aquí, `renovar_bono_idempotente` SUMA, y la socia acababa
    // con 20 sesiones habiendo pagado una vez (con PUNTUAL, dos clases por el
    // precio de una). La idempotencia de la RPC es por RECIBO, así que no lo
    // frenaba: para ese recibo era la primera entrega.
    //
    // La distinción no puede salir del saldo —una renovación anticipada con
    // sesiones aún vivas es legítima, y ese guard es justo el que I-6 quitó por
    // cobrar sin entregar— ni del texto del concepto, que es copy. Va marcada
    // en el recibo por quien lo crea. Ver `recibos.es_renovacion`.
    if (rec.es_renovacion !== true) return guardar(SIN_ENTREGA);

    const { data: sus } = await admin
      .from('suscripciones')
      .select('id, plan_id, sesiones_restantes, fecha_fin, estado')
      .eq('id', rec.suscripcion_id)
      .eq('studio_id', studioId)
      .maybeSingle();
    if (!sus) return guardar(SIN_ENTREGA);

    const { data: plan } = await admin
      .from('planes_tarifa')
      .select('tipo, sesiones')
      .eq('id', sus.plan_id)
      .eq('studio_id', studioId)
      .maybeSingle();
    if (!plan) return guardar(SIN_ENTREGA);

    const antes: FotoSuscripcion = {
      sesionesRestantes: (sus.sesiones_restantes ?? null) as number | null,
      fechaFin: (sus.fecha_fin ?? null) as string | null,
      estado: (sus.estado ?? null) as string | null,
    };

    if (plan.tipo === 'BONO' || plan.tipo === 'PUNTUAL') {
      // I-6. Antes esto era `if (sus.sesiones_restantes !== 0) return
      // { aplicada: false }`: un guard que hacía dos trabajos y solo uno bien.
      // Servía de idempotencia (un reintento sobre un bono ya recargado no lo
      // recarga otra vez) pero confundía "ya lo recargué" con "todavía no lo
      // había agotado", así que cobrar una renovación con saldo > 0 se llevaba
      // el dinero y no entregaba nada — registrado en `entrega_aplicada: false`,
      // que no mira ninguna alerta.
      //
      // La idempotencia correcta es por RECIBO, y vive en la RPC junto con la
      // recarga: leerla aquí y escribir después serían tres pasos, y dos
      // reintentos del webhook a la vez recargarían dos veces (una carrera que
      // el guard viejo no tenía). Ver migr 20260818003000.
      //
      // La RPC SUMA en vez de reemplazar: desde 0 el resultado es idéntico al de
      // antes, y con saldo > 0 la socia ya no pierde lo que le quedaba.
      const { data: saldoNuevo, error: errRenov } = await admin.rpc('renovar_bono_idempotente', {
        p_recibo_id: reciboId, p_studio_id: studioId, p_sesiones: plan.sesiones,
      });
      if (errRenov) {
        Sentry.captureException(new Error(`[renovarBonoIdempotente] ${errRenov.message}`), {
          tags: { area: 'renovacion' }, extra: { reciboId, studioId },
        });
        return guardar({ aplicada: false, tipo: 'BONO', antes, despues: antes });
      }
      // null = este recibo ya había entregado (reintento). No es un fallo, y no
      // se reescribe el snapshot para no pisar el de la entrega buena.
      if (saldoNuevo == null) return { aplicada: false, tipo: 'BONO', antes, despues: antes };
      return guardar({
        aplicada: true, tipo: 'BONO', antes,
        // Esta rama NO toca `fecha_fin`: se arrastra tal cual para que la
        // comprobación de interferencia no dé un falso positivo después.
        despues: { sesionesRestantes: saldoNuevo as number, fechaFin: antes.fechaFin, estado: 'ACTIVA' },
      });
    }

    if (plan.tipo === 'MENSUAL') {
      const nuevaFin = new Date();
      nuevaFin.setMonth(nuevaFin.getMonth() + 1);
      const fechaFin = nuevaFin.toISOString().slice(0, 10);
      if (sus.fecha_fin && sus.fecha_fin >= fechaFin) {
        return guardar({ aplicada: false, tipo: 'MENSUAL', antes, despues: antes });
      }
      await admin
        .from('suscripciones')
        .update({ fecha_fin: fechaFin, estado: 'ACTIVA' })
        .eq('id', sus.id)
        .eq('studio_id', studioId);
      return guardar({
        aplicada: true, tipo: 'MENSUAL', antes,
        despues: { sesionesRestantes: antes.sesionesRestantes, fechaFin, estado: 'ACTIVA' },
      });
    }

    return guardar({ aplicada: false, tipo: 'NINGUNA', antes, despues: antes });
  } catch (e) {
    // La renovación es post-cobro: un fallo aquí no debe deshacer ni bloquear
    // el cobro ya hecho, pero tampoco puede ser invisible (bono cobrado y no
    // recargado = clase sin poder reservar).
    Sentry.captureException(e instanceof Error ? e : new Error('Fallo al aplicar renovación'), {
      level: 'error', tags: { area: 'cobros', tipo: 'renovacion' }, extra: { reciboId, studioId },
    });
    // Se sale SIN snapshot a propósito: el recibo se queda con
    // `entrega_aplicada` NULL ("no lo sé"), que es lo que evitará que se ofrezca
    // revertir algo que no se sabe si llegó a pasar.
    return { aplicada: false, tipo: 'NINGUNA', antes: null, despues: null };
  }
}
