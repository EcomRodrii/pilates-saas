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
  BARRIDO_RECIBO_RESUELTO, DESDE_DETECTADA, crearReciboYCobrar, type EstadoPenalizacion,
} from '@/lib/billing/penalizacion-aprobar-reglas';
import { seguirPenalizacionAlRecibo } from '@/lib/billing/penalizacion-recibo-server';
import {
  DEFINICIONES, ID_PENALIZACIONES_RECIBO_SIN_PROGRAMAR, avisoParaSentry,
} from '@/lib/salud/comprobaciones.ts';
import {
  terminosServicioPorDefecto, politicaPrivacidadPorDefecto, textoLegalCompleto,
} from '@/lib/legal-textos';
import type { SupabaseClient } from '@supabase/supabase-js';

async function procesarUna(admin: SupabaseClient, pen: { id: string; studio_id: string; socio_id: string; reserva_id: string; tipo: string; importe: number }) {
  // Compare-and-set: toda salida de DETECTADA exige que la fila siga DETECTADA
  // (dos pasadas solapadas, o el trigger que la revierte entre medias).
  const marcar = (estado: EstadoPenalizacion) =>
    admin.from('penalizaciones').update({ estado, procesada_en: new Date().toISOString() })
      .eq('id', pen.id).in('estado', [...DESDE_DETECTADA]);

  const { data: studio } = await admin
    .from('studios')
    .select(`
      id, nombre, razon_social, nif, direccion, ciudad, codigo_postal, email,
      cancelacion_ventana_horas, penalizacion_importe_eur, penalizacion_cobro_automatico,
      stripe_account_id, suspendido_en, politica_privacidad, terminos_servicio
    `)
    .eq('id', pen.studio_id).maybeSingle();
  if (!studio || studio.suspendido_en) return; // estudio suspendido: no se persigue cobro en su nombre

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
  // compara contra el texto vigente hoy. Si no coincide (cambió, o nunca
  // aceptó ninguno), no hay consentimiento vigente para este cargo.
  const datosLegales = {
    nombre: studio.nombre, razonSocial: studio.razon_social, nif: studio.nif,
    direccion: studio.direccion, ciudad: studio.ciudad, codigoPostal: studio.codigo_postal,
    email: studio.email, cancelacionVentanaHoras: studio.cancelacion_ventana_horas,
    penalizacionImporteEur: studio.penalizacion_importe_eur,
  };
  const textoVigente = textoLegalCompleto({
    politicaPrivacidad: studio.politica_privacidad ?? politicaPrivacidadPorDefecto(datosLegales),
    terminosServicio: studio.terminos_servicio ?? terminosServicioPorDefecto(datosLegales),
  });
  if (socio.aceptacion_version !== textoVigente) {
    await marcar('OMITIDA_SIN_CONSENTIMIENTO');
    const { emitirPenalizacionBloqueada } = await import('@/lib/notifications/emit');
    await emitirPenalizacionBloqueada(admin, { studioId: pen.studio_id, socioId: pen.socio_id, motivo: 'consentimiento', importe: pen.importe, penalizacionId: pen.id });
    return;
  }

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
  const { data: reserva } = await admin.from('reservas').select('sesion_id').eq('id', pen.reserva_id).maybeSingle();
  const { data: sesion } = reserva?.sesion_id
    ? await admin.from('sesiones').select('tipo_clase_id').eq('id', reserva.sesion_id).maybeSingle()
    : { data: null };
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
  // Límite conocido, documentado allí: una penalización revertida desde
  // PENDIENTE_APROBACION deja su recibo PENDIENTE en Cobros (sin armar: el
  // dunning no lo cobra), y el trigger no revierte nada desde RECIBO_CREADO.
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
 * Vigilancia sin cron nuevo (Inngest va cerca del límite del plan): de paso por
 * esta pasada, cuántas penalizaciones RECIBO_CREADO llevan más de 1 h con el
 * recibo PENDIENTE sin programar. Es la MISMA comprobación que sirve
 * /api/health/flujos; a Sentry solo va el número.
 */
async function vigilarRecibosSinProgramar(admin: SupabaseClient) {
  try {
    const def = DEFINICIONES.find(d => d.id === ID_PENALIZACIONES_RECIBO_SIN_PROGRAMAR);
    if (!def) return;
    const aviso = avisoParaSentry(def, await def.contar(admin, new Date()));
    if (aviso) {
      Sentry.captureMessage(aviso.mensaje, { level: aviso.nivel, tags: { area: 'cobros', tipo: 'salud' }, extra: aviso.extra });
    }
  } catch (e) {
    console.error('[penalizaciones] vigilancia de recibos sin programar', e instanceof Error ? e.message : e);
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
        .select('id, studio_id, socio_id, reserva_id, tipo, importe')
        .eq('estado', 'DETECTADA')
        .limit(200);
      for (const pen of pendientes ?? []) {
        await procesarUna(admin, pen as never);
      }
      // Después de procesar, y también cuando no había nada DETECTADA: lo que
      // barre y lo que vigila no depende de que haya trabajo nuevo.
      await seguirRecibosResueltos(admin);
      await vigilarRecibosSinProgramar(admin);
      return { procesadas: pendientes?.length ?? 0 };
    });
  },
);
