// ─────────────────────────────────────────────────────────────────────────────
// Fase 3: recoge las filas `penalizaciones` en estado DETECTADA (insertadas
// por cancelar_reserva_plaza y por el trigger de no-show, dentro de la misma
// transacción que cancela la reserva) y decide: crear el recibo y cobrar ya
// (modo automático), o dejarlo esperando aprobación manual (modo por
// defecto). Sin fan-out por estudio — igual que reservas-pendientes.ts/
// lista-espera-ofertas.ts: query global, nada caro que decidir por estudio.
//
// Cadencia cada 10 min: no es una guardia de seguridad (nadie puede "hacer
// trampa" esperando), así que no necesita el minuto a minuto de Fase 2a —
// pero tampoco tan relajada como Fase 2b, porque aquí hay dinero de por
// medio y cuanto antes se sepa si hace falta aprobación manual, mejor.
// ─────────────────────────────────────────────────────────────────────────────
import * as Sentry from '@sentry/nextjs';
import { inngest } from './client';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { cobrarReciboOffSession } from '@/lib/billing/stripe-cobros';
import {
  BARRIDO_RECIBO_RESUELTO, DESDE_DETECTADA, ESTADOS_OMITIDA, ESTADOS_RECIBO_BARRIDO_ANULADAS, crearReciboYCobrar,
  devolucionEnMarcha, omitirPorPlazaFijaSinCuota, penalizacionDelRecibo, soltarReciboDePenalizacionAnulada, type EstadoPenalizacion,
} from '@/lib/billing/penalizacion-aprobar-reglas';
import { borrarReciboDePenalizacionSinCobro, seguirPenalizacionAlRecibo } from '@/lib/billing/penalizacion-recibo-server';
import {
  DEFINICIONES, ID_PENALIZACIONES_COBRADAS_SIN_DINERO, ID_PENALIZACIONES_RECIBO_SIN_PROGRAMAR, avisoParaSentry,
} from '@/lib/salud/comprobaciones.ts';
import { textoLegalVigenteDeFila } from '@/lib/legal-textos';
import { aplicarConsentimientoEnCron, consentimientoCubrePenalizacion } from '@/lib/billing/penalizacion-consentimiento';
import type { SupabaseClient } from '@supabase/supabase-js';

async function procesarUna(admin: SupabaseClient, pen: { id: string; studio_id: string; socio_id: string; reserva_id: string; tipo: string; importe: number; detectada_en: string }) {
  // Compare-and-set: toda salida de DETECTADA exige que la fila siga DETECTADA
  // (dos pasadas solapadas, o el trigger que la revierte entre medias).
  const marcar = (estado: EstadoPenalizacion) =>
    admin.from('penalizaciones').update({ estado, procesada_en: new Date().toISOString() })
      .eq('id', pen.id).in('estado', [...DESDE_DETECTADA]);

  const { data: studio, error: errStudio } = await admin
    .from('studios')
    .select(`
      id, nombre, razon_social, nif, direccion, ciudad, codigo_postal, email,
      cancelacion_ventana_horas, penalizacion_importe_eur, penalizacion_cobro_automatico,
      stripe_account_id, suspendido_en, politica_privacidad, terminos_servicio, plaza_fija_sin_cuota
    `)
    .eq('id', pen.studio_id).maybeSingle();
  // Un fallo de lectura aquí (una columna que falta, la BD caída) deja `studio`
  // en null y el cron salía MUDO: parece que no hay nada que cobrar. No cobra,
  // que es lo correcto, pero hay que poder verlo — se encontró probando en local
  // con la base sin migrar, donde el cron no ejecutaba nada sin decirlo.
  if (errStudio) {
    Sentry.captureMessage('[penalizaciones] no se ha podido leer el estudio', {
      level: 'error', extra: { penalizacionId: pen.id, studioId: pen.studio_id, error: errStudio.message },
    });
    return;
  }
  if (!studio || studio.suspendido_en) return; // estudio suspendido: no se persigue cobro en su nombre

  // La clase: para la política de plaza fija sin cuota, la ventana del contrato
  // (cancelación tardía) y el concepto del recibo. Va antes de la guardia de
  // Stripe para decidir la política en la primera pasada, no cuando se conecte.
  // Un error de lectura no escribe nada: la próxima pasada lo repite. Una reserva
  // o clase que no existe sí se decide (sin datos, no se cobra).
  const { data: reserva, error: errReserva } = await admin.from('reservas').select('sesion_id').eq('id', pen.reserva_id).maybeSingle();
  if (errReserva) return;
  const { data: sesion, error: errSesion } = reserva?.sesion_id
    ? await admin.from('sesiones').select('inicio, tipo_clase_id').eq('id', reserva.sesion_id).maybeSingle()
    : { data: null, error: null };
  if (errSesion) return;

  // Plaza fija sin cuota: el estudio eligió no cobrar (LIBERAR o
  // MANTENER_SIN_PENALIZAR). Antes que el consentimiento, para no avisar de un
  // «cargo bloqueado» que nunca se iba a cobrar.
  if (sesion && pen.reserva_id.startsWith('res-pf-')
    && (studio.plaza_fija_sin_cuota === 'LIBERAR' || studio.plaza_fija_sin_cuota === 'MANTENER_SIN_PENALIZAR')) {
    const fecha = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date(sesion.inicio as string));
    const { data: cubre, error: errCuota } = await admin.rpc('cuota_cubre_plaza_fija', {
      p_studio_id: pen.studio_id, p_socio_id: pen.socio_id, p_tipo_clase_id: sesion.tipo_clase_id, p_fecha: fecha, p_exigir_vigente: false,
    });
    if (errCuota) return; // sin saber si tiene cuota no se decide nada: la próxima pasada lo repite
    if (omitirPorPlazaFijaSinCuota({ politica: studio.plaza_fija_sin_cuota, reservaId: pen.reserva_id, cubre: cubre === true })) {
      // `recibo_id: null` en la misma escritura, como la de consentimiento: una
      // DETECTADA puede apuntar ya a un recibo de una pasada anterior.
      const { data: tocadas, error: errMarca } = await admin.from('penalizaciones')
        .update({ estado: 'OMITIDA_SIN_CUOTA', procesada_en: new Date().toISOString(), recibo_id: null })
        .eq('id', pen.id).in('estado', [...DESDE_DETECTADA]).select('id');
      if (errMarca) { console.error('[penalizaciones] no se pudo marcar sin cuota', pen.id, errMarca.message); return; }
      if ((tocadas?.length ?? 0) > 0) {
        await borrarReciboDePenalizacionSinCobro(admin, { studioId: pen.studio_id, reciboId: `rec-penaliz-${pen.id}` });
      }
      return;
    }
  }

  // Guard de Stripe Connect: sin cuenta conectada no hay a quién cobrar. NO se
  // marca omitida — cuando el estudio conecte Stripe, el próximo barrido la
  // recoge; evita un recibo PENDIENTE fantasma que nunca podría cobrarse.
  if (!studio.stripe_account_id) return;

  const { data: socio } = await admin
    .from('socios')
    .select('id, nombre, email, stripe_customer_id, stripe_payment_method_id, aceptacion_version')
    .eq('id', pen.socio_id).maybeSingle();
  if (!socio) { await marcar('FALLIDA'); return; }

  // Guard de consentimiento (§7 del plan): AceptacionContrato.versionTexto es
  // el TEXTO COMPLETO que la socia aceptó, no un número de versión — se
  // compara contra el texto vigente hoy. Y además, que ese texto recoja ESTE
  // cargo: la detección usa el importe y la ventana del tipo de clase, y el
  // contrato solo los del estudio (`lib/billing/penalizacion-consentimiento.ts`).
  // Sin eso, no se crea recibo ni se cobra.
  const veredicto = consentimientoCubrePenalizacion({
    studio: {
      terminosServicio: studio.terminos_servicio,
      penalizacionImporteEur: studio.penalizacion_importe_eur,
      cancelacionVentanaHoras: studio.cancelacion_ventana_horas,
    },
    penalizacion: { tipo: pen.tipo, importe: pen.importe, detectadaEn: pen.detectada_en },
    sesion: sesion ? { inicio: sesion.inicio as string | null } : null,
    textoAceptado: socio.aceptacion_version,
    textoActual: textoLegalVigenteDeFila(studio),
  });
  const sigue = await aplicarConsentimientoEnCron(veredicto, {
    marcarOmitida: async () => {
      // `recibo_id: null` en la misma escritura: una DETECTADA puede apuntar ya a
      // un recibo de una pasada anterior, y la FK no deja borrarlo mientras apunte.
      const { data, error } = await admin.from('penalizaciones')
        .update({ estado: 'OMITIDA_SIN_CONSENTIMIENTO', procesada_en: new Date().toISOString(), recibo_id: null })
        .eq('id', pen.id).in('estado', [...DESDE_DETECTADA]).select('id');
      if (error) console.error('[penalizaciones] no se pudo marcar sin consentimiento', pen.id, error.message);
      return { error: !!error, tocadas: data?.length ?? 0 };
    },
    borrarRecibo: () => borrarReciboDePenalizacionSinCobro(admin, { studioId: pen.studio_id, reciboId: `rec-penaliz-${pen.id}` }),
    notificarBloqueo: async () => {
      const { emitirPenalizacionBloqueada } = await import('@/lib/notifications/emit');
      await emitirPenalizacionBloqueada(admin, { studioId: pen.studio_id, socioId: pen.socio_id, motivo: 'consentimiento', importe: pen.importe, penalizacionId: pen.id });
    },
    alertar: (motivoAlerta) => {
      Sentry.captureMessage(`[penalizaciones] ${motivoAlerta}`, {
        level: 'error', tags: { area: 'cobros', tipo: 'penalizacion-sin-consentimiento' },
        extra: { penalizacionId: pen.id, reciboId: `rec-penaliz-${pen.id}`, studioId: pen.studio_id },
      });
    },
  });
  if (!sigue) return;

  // Guard de tarjeta (decisión de producto: silencioso, sin bloquear nada).
  if (!socio.stripe_customer_id || !socio.stripe_payment_method_id) {
    await marcar('OMITIDA_SIN_TARJETA');
    return;
  }

  // Guard de compensación: si esta reserva ya generó una recuperación (p.ej.
  // bajaConRecuperacion), no se cobra Y se quita la sesión a la vez sobre el
  // mismo hecho.
  const { data: recuperacion } = await admin
    .from('recuperaciones')
    .select('id').eq('origen_reserva_id', pen.reserva_id).neq('estado', 'ANULADA').maybeSingle();
  if (recuperacion) { await marcar('OMITIDA_COMPENSADA'); return; }

  // Nombre de la clase para el concepto del recibo.
  const { data: tipo } = sesion?.tipo_clase_id
    ? await admin.from('tipos_clase').select('nombre').eq('id', sesion.tipo_clase_id).maybeSingle()
    : { data: null };
  const nombreClase = tipo?.nombre ?? 'la clase';
  const motivo = pen.tipo === 'NO_SHOW' ? 'no presentada' : 'cancelación tardía';

  const automatico = studio.penalizacion_cobro_automatico === true;

  // ⚠️ Id DETERMINISTA, derivado de la penalización — no `uid()`.
  //
  // Una penalización tiene exactamente un recibo, así que su id puede salir del
  // suyo. Con `uid()` aleatorio el reintento era un doble cobro real: la
  // penalización solo sale de DETECTADA con el UPDATE de abajo, y si ese UPDATE
  // fallaba (o el proceso moría entre insert y update, o Inngest reintentaba el
  // `step.run` que envuelve el bucle entero), la fila seguía DETECTADA y el
  // barrido de 10 minutos después creaba OTRO recibo con OTRO id — y por tanto
  // otra `idempotencyKey` en `cobrarReciboOffSession`
  // (`offsession-cobro-<reciboId>-i<intento>`), que Stripe no puede deduplicar.
  // Cargo repetido a la socia.
  //
  // Con el id derivado, el reintento reinserta la MISMA fila (23505, que se
  // trata como "ya existía") y converge en la misma clave de idempotencia.
  // Mismo patrón que `renovaciones.ts`, que ya usaba `rec-renov-<susId>-<mes>`.
  const reciboId = `rec-penaliz-${pen.id}`;
  const hoy = new Date().toISOString().slice(0, 10);

  // El ORDEN y las decisiones viven en `crearReciboYCobrar`
  // (lib/billing/penalizacion-aprobar-reglas.ts), probado sin Supabase ni
  // Stripe: insertar sin armar → CAS desde DETECTADA → si no tocó nada, limpiar
  // el recibo propio; si tocó y es automático, armar el dunning (y si no se
  // puede confirmar, devolver a DETECTADA sin cobrar) → cobrar → releer el
  // recibo → cerrar con CAS. Aquí solo va el acceso a datos.
  //
  // Documentado allí: el trigger revierte una PENDIENTE_APROBACION sin tocar su
  // recibo (lo suelta y lo borra `soltarRecibosDePenalizacionesAnuladas`, más
  // abajo), y no revierte nada desde RECIBO_CREADO.
  //
  // Si el cobro acaba en otro camino (el dunning, el webhook, Cobros), la
  // penalización se pone al día con `seguirPenalizacionAlRecibo`: lo llama el
  // dunning y lo barre `seguirRecibosResueltos`, más abajo.
  await crearReciboYCobrar({
    insertarRecibo: async () => {
      const { error } = await admin.from('recibos').insert({
        id: reciboId, studio_id: pen.studio_id, socio_id: pen.socio_id, suscripcion_id: null,
        concepto: `Penalización — ${motivo}: ${nombreClase}`, importe: pen.importe, estado: 'PENDIENTE',
        fecha_vencimiento: hoy, fecha_cobro: null, fecha_devolucion: null, intentos_reintento: 0,
        // ⚠️ SIEMPRE null al nacer, también en automático. El dunning cobra
        // cualquier recibo PENDIENTE con `proximo_reintento` vencido sin mirar
        // la penalización, y nacer armado cobraba una penalización que el
        // trigger revertía entre el SELECT de este cron y su UPDATE. En
        // automático se arma en cuanto la penalización pasa a RECIBO_CREADO
        // (`armarRecibo`); en manual no se arma nunca: el estudio revisa cada
        // cargo y el dunning lo cobraría solo.
        //
        // Por qué se arma en automático: sin `proximo_reintento` el barrido lo
        // filtra (`.not('proximo_reintento','is',null)`) y el adoptador de
        // huérfanos exige `suscripcion_id` y `es_renovacion` (renovaciones.ts),
        // así que un cobro fallido se quedaba PENDIENTE para siempre, sin
        // reintento ni aviso de impago. Lo que cambia es CUÁNDO se arma.
        proximo_reintento: null,
      });
      // 23505 = ya existía de un intento anterior: se sigue, que es lo que hace
      // converger el reintento (y ese recibo no se borra nunca).
      if (error && error.code !== '23505') console.error('[penalizaciones] insert recibo', error.message);
      return error;
    },
    enlazarRecibo: async (e) => {
      // El resultado SÍ se comprueba: es lo único que saca a la penalización de
      // DETECTADA, y tragárselo era lo que dejaba la puerta abierta al reintento.
      const { data, error } = await admin.from('penalizaciones')
        .update({ recibo_id: reciboId, estado: e.estado })
        .eq('id', pen.id).in('estado', [...e.desde]).select('id');
      if (error) console.error('[penalizaciones] no se pudo marcar la penalización', pen.id, error.message);
      return { error: !!error, tocadas: data?.length ?? 0 };
    },
    leerPunteroRecibo: async () => {
      const { data, error } = await admin.from('penalizaciones').select('recibo_id').eq('id', pen.id).maybeSingle();
      return error ? { ok: false } : { ok: true, reciboId: (data?.recibo_id as string | null | undefined) ?? null };
    },
    borrarRecibo: async () => {
      const { error } = await admin.from('recibos').delete()
        .eq('id', reciboId).eq('studio_id', pen.studio_id)
        .eq('estado', 'PENDIENTE').is('proximo_reintento', null);
      if (error) console.error('[penalizaciones] no se pudo borrar el recibo sin penalización', reciboId, error.message);
    },
    desarmarRecibo: async () => {
      // Con `.select('id')`: quien llama necesita saber si tocó el recibo, y si
      // no, lo relee antes de devolver nada a DETECTADA.
      const { data, error } = await admin.from('recibos').update({ proximo_reintento: null })
        .eq('id', reciboId).eq('studio_id', pen.studio_id).eq('estado', 'PENDIENTE')
        .select('id');
      if (error) console.error('[penalizaciones] no se pudo desprogramar el recibo', reciboId, error.message);
      return { error: !!error, tocadas: data?.length ?? 0 };
    },
    armarRecibo: async () => {
      const { data, error } = await admin.from('recibos').update({ proximo_reintento: new Date().toISOString() })
        .eq('id', reciboId).eq('studio_id', pen.studio_id)
        .eq('estado', 'PENDIENTE').is('proximo_reintento', null)
        .select('id');
      if (error) console.error('[penalizaciones] no se pudo programar el reintento del recibo', reciboId, error.message);
      return { error: !!error, tocadas: data?.length ?? 0 };
    },
    leerArmadoRecibo: async () => {
      const { data, error } = await admin.from('recibos').select('estado, proximo_reintento')
        .eq('id', reciboId).eq('studio_id', pen.studio_id).maybeSingle();
      if (error) return { ok: false };
      return { ok: true, estado: (data?.estado as string | undefined) ?? null, armado: !!data?.proximo_reintento };
    },
    devolverPenalizacion: async (e) => {
      const { data, error } = await admin.from('penalizaciones')
        .update({ estado: e.estado })
        .eq('id', pen.id).in('estado', [...e.desde]).select('id');
      if (error) console.error('[penalizaciones] no se pudo devolver la penalización a DETECTADA', pen.id, error.message);
      return { error: !!error, tocadas: data?.length ?? 0 };
    },
    cobrar: () => cobrarReciboOffSession({ reciboId, socioId: pen.socio_id, studioId: pen.studio_id }),
    leerRecibo: async () => {
      const { data, error } = await admin.from('recibos').select('estado')
        .eq('id', reciboId).eq('studio_id', pen.studio_id).maybeSingle();
      return error ? { ok: false } : { ok: true, estado: (data?.estado as string | undefined) ?? null };
    },
    cerrarPenalizacion: async (e) => {
      const { data, error } = await admin.from('penalizaciones')
        .update({ estado: e.estado, procesada_en: new Date().toISOString() })
        .eq('id', pen.id).in('estado', [...e.desde]).select('id');
      if (error) console.error('[penalizaciones] no se pudo cerrar la penalización', pen.id, error.message);
      return { error: !!error, tocadas: data?.length ?? 0 };
    },
    leerEstadoPenalizacion: async () => {
      const { data, error } = await admin.from('penalizaciones').select('estado').eq('id', pen.id).maybeSingle();
      return error ? null : ((data?.estado as string | undefined) ?? null);
    },
    notificarPago: async () => {
      // Deduplicado por `pago-penalizacion:<id>` en el motor de avisos.
      const { emitirPagoPenalizacion } = await import('@/lib/notifications/emit');
      await emitirPagoPenalizacion(admin, { studioId: pen.studio_id, socioId: pen.socio_id, importe: pen.importe, penalizacionId: pen.id });
    },
    alertar: (motivoAlerta) => {
      // Solo ids: ni nombre, ni email, ni importe de la socia.
      Sentry.captureMessage(`[penalizaciones] ${motivoAlerta}`, {
        level: 'error', tags: { area: 'cobros', tipo: 'penalizacion-sin-programar' },
        extra: { penalizacionId: pen.id, reciboId, studioId: pen.studio_id },
      });
    },
  }, { reciboId, automatico });
}

/**
 * La penalización sigue a su recibo aunque lo haya resuelto otro camino: el
 * dunning (si su llamada a `seguirPenalizacionAlRecibo` no llegó a escribir), el
 * webhook que reconcilia un cargo con tarjeta cuya respuesta se perdió, o alguien
 * que lo cobró desde Cobros. Sin cron nuevo, de paso por esta pasada. En un
 * sistema sano las dos consultas vuelven vacías.
 */
async function seguirRecibosResueltos(admin: SupabaseClient) {
  for (const { estadoRecibo, estados } of BARRIDO_RECIBO_RESUELTO) {
    try {
      const { data, error } = await admin
        .from('penalizaciones')
        .select('studio_id, recibo_id, recibos!inner(estado)')
        .in('estado', [...estados])
        .eq('recibos.estado', estadoRecibo)
        .limit(200);
      if (error) throw new Error(error.message);
      for (const fila of data ?? []) {
        await seguirPenalizacionAlRecibo(admin, { studioId: fila.studio_id as string, reciboId: fila.recibo_id as string });
      }
    } catch (e) {
      Sentry.captureMessage('[penalizaciones] barrido de recibos resueltos', {
        level: 'error', tags: { area: 'cobros', tipo: 'penalizacion-recibo' },
        extra: { estadoRecibo, error: e instanceof Error ? e.message : String(e) },
      });
    }
  }
}

/**
 * El recibo de una penalización anulada (OMITIDA_*) se suelta y se borra
 * (`soltarReciboDePenalizacionAnulada`). El trigger de no-show revierte la
 * penalización sin tocar su recibo, que se quedaba PENDIENTE en Cobros al alcance
 * del mostrador. Si ya se cobró, no se borra: se avisa a Sentry y se queda
 * apuntado para devolverlo a mano. En un sistema sano vuelve vacía.
 *
 * Paginado por id (orden estable): lo que se borra sale del conjunto, lo que se
 * queda (cobrado, con un cobro en camino) no tapa lo de detrás.
 */
const PAGINA_ANULADAS = 200;

async function soltarRecibosDePenalizacionesAnuladas(admin: SupabaseClient) {
  let ultimoId = '';
  try {
    for (;;) {
      const { data, error } = await admin
        .from('penalizaciones')
        .select('id, studio_id, estado, recibo_id, recibos!inner(estado, proximo_reintento, stripe_payment_intent_id, checkout_session_id, cobro_mostrador_pi, importe, importe_devuelto, reembolso_solicitado_en, reembolso_fallido_en)')
        .in('estado', [...ESTADOS_OMITIDA])
        .in('recibos.estado', [...ESTADOS_RECIBO_BARRIDO_ANULADAS])
        .gt('id', ultimoId)
        .order('id', { ascending: true })
        .limit(PAGINA_ANULADAS);
      if (error) throw new Error(error.message);
      const filas = (data ?? []) as unknown as FilaPenalizacionAnulada[];
      for (const fila of filas) {
        const reciboId = fila.recibo_id;
        // Solo su propio recibo (`rec-penaliz-<id>`): cualquier otro puntero no es de este barrido.
        if (!reciboId || penalizacionDelRecibo(reciboId) !== fila.id) continue;
        const recibo = Array.isArray(fila.recibos) ? fila.recibos[0] : fila.recibos;
        const cas = async (q: PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>, que: string) => {
          const { data: tocadas, error: err } = await q;
          if (err) console.error(`[penalizaciones] no se pudo ${que}`, fila.id, err.message);
          return { error: !!err, tocadas: tocadas?.length ?? 0 };
        };
        await soltarReciboDePenalizacionAnulada({
          soltarRecibo: () => cas(admin.from('penalizaciones').update({ recibo_id: null })
            .eq('id', fila.id).eq('studio_id', fila.studio_id).eq('recibo_id', reciboId)
            .in('estado', [...ESTADOS_OMITIDA]).select('id'), 'soltar el recibo de la penalización anulada'),
          borrarRecibo: () => borrarReciboDePenalizacionSinCobro(admin, { studioId: fila.studio_id, reciboId }),
          volverAApuntar: () => cas(admin.from('penalizaciones').update({ recibo_id: reciboId })
            .eq('id', fila.id).eq('studio_id', fila.studio_id).is('recibo_id', null).select('id'),
          'volver a apuntar el recibo de la penalización anulada'),
          alertar: (motivo) => {
            // Solo ids: ni nombre, ni email, ni importe de la socia.
            Sentry.captureMessage(`[penalizaciones] ${motivo}`, {
              level: 'error', tags: { area: 'cobros', tipo: 'penalizacion-anulada' },
              extra: { penalizacionId: fila.id, reciboId, studioId: fila.studio_id, estadoPenalizacion: fila.estado },
            });
          },
        }, {
          estado: recibo?.estado ?? null,
          programado: !!recibo?.proximo_reintento,
          conCobroEnCamino: !!(recibo?.stripe_payment_intent_id || recibo?.checkout_session_id || recibo?.cobro_mostrador_pi),
          // Cobrado y ya devolviéndose: no se avisa cada hora hasta que pase a
          // DEVUELTO, salvo que la devolución lleve demasiado sin confirmarse.
          devolucionEnMarcha: !!recibo && devolucionEnMarcha({
            importe: recibo.importe, importeDevuelto: recibo.importe_devuelto,
            reembolsoSolicitadoEn: recibo.reembolso_solicitado_en, reembolsoFallidoEn: recibo.reembolso_fallido_en,
          }, new Date()),
        });
      }
      if (filas.length < PAGINA_ANULADAS) break;
      ultimoId = filas[filas.length - 1].id;
    }
  } catch (e) {
    Sentry.captureMessage('[penalizaciones] barrido de recibos de penalizaciones anuladas', {
      level: 'error', tags: { area: 'cobros', tipo: 'penalizacion-anulada' },
      extra: { error: e instanceof Error ? e.message : String(e) },
    });
  }
}

interface FilaPenalizacionAnulada {
  id: string;
  studio_id: string;
  estado: string;
  recibo_id: string | null;
  recibos: ReciboEmbebido | ReciboEmbebido[] | null;
}

interface ReciboEmbebido {
  estado: string | null;
  proximo_reintento: string | null;
  stripe_payment_intent_id: string | null;
  checkout_session_id: string | null;
  cobro_mostrador_pi: string | null;
  importe: number | null;
  importe_devuelto: number | null;
  reembolso_solicitado_en: string | null;
  reembolso_fallido_en: string | null;
}

/**
 * Vigilancia sin cron nuevo (Inngest va cerca del límite del plan): de paso por
 * esta pasada, las comprobaciones de /api/health/flujos que tocan penalizaciones.
 * Nadie sondea ese endpoint, así que si no se cuentan aquí no avisan a nadie. A
 * Sentry solo va el número.
 *
 * - Recibos sin programar: RECIBO_CREADO con el recibo PENDIENTE sin reintento.
 * - Cobradas sin dinero: COBRADA con el recibo DEVUELTO, que la liquidación de
 *   la instructora sigue sumando. Se cuenta DESPUÉS de `seguirRecibosResueltos`
 *   a propósito: lo que quede ya no lo ha arreglado ni el barrido.
 */
const VIGILADAS = [ID_PENALIZACIONES_RECIBO_SIN_PROGRAMAR, ID_PENALIZACIONES_COBRADAS_SIN_DINERO];

async function vigilarPenalizaciones(admin: SupabaseClient) {
  for (const id of VIGILADAS) {
    try {
      const def = DEFINICIONES.find(d => d.id === id);
      if (!def) continue;
      const aviso = avisoParaSentry(def, await def.contar(admin, new Date()));
      if (aviso) {
        Sentry.captureMessage(aviso.mensaje, { level: aviso.nivel, tags: { area: 'cobros', tipo: 'salud' }, extra: aviso.extra });
      }
    } catch (e) {
      console.error('[penalizaciones] vigilancia', id, e instanceof Error ? e.message : e);
    }
  }
}

export const penalizacionesDispatcher = inngest.createFunction(
  // Cada 30 min (antes 10) — auditoría de consumo 2026-08-11, O-1. Aquí la
  // urgencia es la más baja de todos los crons de dinero: la DETECCIÓN ya
  // ocurrió (en la RPC de cancelación o en el trigger de no-show, no aquí), y
  // esto solo crea el recibo y cobra o lo deja pendiente de aprobación. Que una
  // penalización tarde 1 hora en cobrarse no cambia nada para nadie (antes: 30 min).
  //
  // Sin ventana atada al periodo: filtra por `estado = DETECTADA`, así que
  // espaciarlo no abre huecos, solo alarga la cola.
  // Auditoría #3 (2026-08-25): reducido de cada 30min a cada hora.
  // Ahorro: ~1.440 - 24 = ~1.416/mes
  { id: 'penalizaciones-procesar', triggers: [{ cron: '0 * * * *' }] },
  async ({ step }) => {
    return step.run('procesar', async () => {
      const admin = getSupabaseAdmin();
      if (!admin) return { skipped: 'sin service-role' };
      const { data: pendientes } = await admin
        .from('penalizaciones')
        .select('id, studio_id, socio_id, reserva_id, tipo, importe, detectada_en')
        .eq('estado', 'DETECTADA')
        .limit(200);
      for (const pen of pendientes ?? []) {
        await procesarUna(admin, pen as never);
      }
      // Después de procesar, y también cuando no había nada DETECTADA: lo que
      // barre y lo que vigila no depende de que haya trabajo nuevo.
      await seguirRecibosResueltos(admin);
      await soltarRecibosDePenalizacionesAnuladas(admin);
      await vigilarPenalizaciones(admin);
      return { procesadas: pendientes?.length ?? 0 };
    });
  },
);
