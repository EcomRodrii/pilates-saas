/**
 * PAY-5: Detectar doble cobro
 *
 * Identifica recibos que tienen múltiples payment_intent exitosos en `cobros_intentos`.
 * Un recibo puede tener varios intentos (reintentos tras fallo), pero solo UNO debe
 * estar en estado 'cobrado'. Si hay MÁS de uno, es doble cobro.
 *
 * Lógica:
 * - Un payment_intent reintentado = MISMO ID, es legítimo (idempotencia Stripe)
 * - Múltiples payment_intent DISTINTOS exitosos = DOBLE COBRO detectado
 *
 * Esta función es idempotente: corre sobre cobros_intentos (que es auditoría,
 * nunca se borra) y registra sus hallazgos en dobles_cobros_detectados.
 */

import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { alertarDobleCobroDetectado } from './doble-cobro-alertas.ts';

export interface DobleCobroDetectado {
  reciboId: string;
  studioId: string;
  paymentIntentIds: string[];
  importeCentimos: number;
  intentosExitosos: number;
  primeraFecha: string;
  ultimaFecha: string;
}

/**
 * Busca recibos con múltiples cobros exitosos en los últimos N días.
 * Por defecto, últimos 7 días (PAY-5 fue pensado para recuperación post-incidencia).
 * Agrupa por payment_intent_id DISTINTO dentro de cada recibo.
 */
export async function detectarDoblesCobros(diasAtras: number = 7): Promise<DobleCobroDetectado[]> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    throw new Error('Servicio no configurado (service role)');
  }

  const fechaLimite = new Date();
  fechaLimite.setDate(fechaLimite.getDate() - diasAtras);

  // Query: todos los intentos de cobro exitosos de los últimos N días
  const { data, error } = await admin.from('cobros_intentos').select(
    `
    recibo_id,
    studio_id,
    importe_centimos,
    desenlace,
    creado_en,
    payment_intent_id
    `
  )
    .eq('desenlace', 'cobrado')
    .gte('creado_en', fechaLimite.toISOString())
    .order('recibo_id')
    .order('creado_en', { ascending: true });

  if (error || !data || data.length === 0) {
    return [];
  }

  // Agrupar por recibo_id
  const agrupadoPorRecibo = new Map<
    string,
    Array<{
      studio_id: string;
      importe_centimos: number;
      creado_en: string;
      payment_intent_id: string;
    }>
  >();

  for (const intento of data) {
    const key = intento.recibo_id;
    if (!agrupadoPorRecibo.has(key)) {
      agrupadoPorRecibo.set(key, []);
    }
    agrupadoPorRecibo.get(key)!.push(intento);
  }

  // Filtrar solo recibos con múltiples payment_intent DISTINTOS
  const doblesCobros: DobleCobroDetectado[] = [];
  for (const [reciboId, intentos] of agrupadoPorRecibo.entries()) {
    // Agrupar por payment_intent_id para contar cuántos DISTINTOS hay
    const porPaymentIntent = new Set<string>();
    for (const intento of intentos) {
      porPaymentIntent.add(intento.payment_intent_id);
    }

    // Si hay 2+ payment_intent_id distintos → es doble cobro
    if (porPaymentIntent.size > 1) {
      const unique = intentos[0];
      doblesCobros.push({
        reciboId,
        studioId: unique.studio_id,
        paymentIntentIds: Array.from(porPaymentIntent),
        importeCentimos: unique.importe_centimos,
        intentosExitosos: porPaymentIntent.size,
        primeraFecha: intentos[0].creado_en,
        ultimaFecha: intentos[intentos.length - 1].creado_en,
      });
    }
  }

  return doblesCobros;
}

/**
 * Registra un doble cobro detectado en la tabla de auditoría.
 * Idempotente por (recibo_id, studio_id) — si ya existe, no duplica.
 */
export async function registrarDobleCobroDetectado(
  doble: DobleCobroDetectado
): Promise<{ ok: boolean; error?: string; id?: string }> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return { ok: false, error: 'Servicio no configurado' };
  }

  const { data, error } = await admin.from('dobles_cobros_detectados').insert({
    studio_id: doble.studioId,
    recibo_id: doble.reciboId,
    payment_intent_ids: doble.paymentIntentIds,
    importe_centimos: doble.importeCentimos,
    intentos_exitosos_count: doble.intentosExitosos,
    primera_fecha: doble.primeraFecha,
    ultima_fecha: doble.ultimaFecha,
  }).select('id');

  // Idempotencia: si ya existe una fila para este recibo, no hay error
  // (violación de constraint UNIQUE o similar)
  if (error && error.code === '23505') {
    return { ok: true }; // Duplicado, pero idempotente
  }

  if (error) {
    return { ok: false, error: error.message };
  }

  return {
    ok: true,
    id: data?.[0]?.id,
  };
}

/**
 * Detecta y registra todos los dobles cobros en los últimos N días.
 * Llamada desde cron `lib/inngest/detectar-dobles-cobros.ts` cada hora.
 * Best-effort: si falla un registro individual, continúa con el siguiente.
 */
export async function detectarYRegistrarDoblesCobros(diasAtras: number = 7): Promise<{
  detectados: number;
  registrados: number;
  errores: string[];
}> {
  const dobles = await detectarDoblesCobros(diasAtras);
  const registrados: string[] = [];
  const errores: string[] = [];

  for (const doble of dobles) {
    const resultado = await registrarDobleCobroDetectado(doble);
    if (resultado.ok) {
      if (resultado.id) {
        registrados.push(resultado.id);
      }
      // Alerta best-effort: no rompe el flujo si falla
      await alertarDobleCobroDetectado(
        doble.studioId,
        doble.reciboId,
        doble.importeCentimos,
        doble.intentosExitosos,
      );
    } else {
      errores.push(`Recibo ${doble.reciboId}: ${resultado.error}`);
    }
  }

  return {
    detectados: dobles.length,
    registrados: registrados.length,
    errores,
  };
}

/**
 * Obtiene la lista de dobles cobros pendientes de revisión para un estudio.
 * Usada por el endpoint `/api/billing/doble-cobro-detector`.
 */
export async function obtenerDoblesCobrosEnRevision(
  studioId: string
): Promise<Array<{
  id: string;
  reciboId: string;
  paymentIntentIds: string[];
  importeCentimos: number;
  intentosExitosos: number;
  primeraFecha: string;
  ultimaFecha: string;
  estado: string;
}>> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    throw new Error('Servicio no configurado');
  }

  const { data, error } = await admin.from('dobles_cobros_detectados').select(
    `
    id,
    recibo_id,
    payment_intent_ids,
    importe_centimos,
    intentos_exitosos_count,
    primera_fecha,
    ultima_fecha,
    estado
    `
  )
    .eq('studio_id', studioId)
    .eq('estado', 'PENDIENTE_REVISION')
    .order('creado_en', { ascending: false });

  if (error) {
    throw new Error(`Error al obtener dobles cobros: ${error.message}`);
  }

  return (data ?? []).map(row => ({
    id: row.id,
    reciboId: row.recibo_id,
    paymentIntentIds: row.payment_intent_ids,
    importeCentimos: row.importe_centimos,
    intentosExitosos: row.intentos_exitosos_count,
    primeraFecha: row.primera_fecha,
    ultimaFecha: row.ultima_fecha,
    estado: row.estado,
  }));
}
