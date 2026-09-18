// ─────────────────────────────────────────────────────────────────────────────
// PAY-5: Detectar cobros duplicados (PAY-4 → libro de auditoría)
//
// Un recibo con 2+ intentos de cobro exitosos indica un doble cargo:
// - Mismo payment_intent_id: reintento legítimo (idempotencia de Stripe)
// - Diferentes payment_intent_id: PROBLEMA → hay que devolverlo
//
// Grouping: por (recibo_id, studio_id) para reconstrucción de auditoría.
// ─────────────────────────────────────────────────────────────────────────────
import type { SupabaseClient } from '@supabase/supabase-js';

export interface IntentoCobro {
  payment_intent_id: string;
  importe_centimos: number;
  origen: string;
  desenlace: string;
  creado_en: string;
}

export interface DobleCobroDetectado {
  recibo_id: string;
  studio_id: string;
  intentos_exitosos: IntentoCobro[];
  importe_duplicado_centimos: number;
  mensaje: string;
}

/**
 * Detecta si un recibo tiene múltiples cobros EXITOSOS con DIFERENTES payment_intent_id.
 * Devuelve `null` si no hay doble cobro detectado.
 *
 * Lógica:
 * - Lee todos los intentos de ese recibo filtrados por desenlace='cobrado'
 * - Agrupa por payment_intent_id
 * - Si hay 2+ payment_intent_id distintos → DOBLE COBRO
 * - Si hay 1 payment_intent_id → reintento legítimo, no es problema
 */
export async function detectarDobleCobroPorRecibo(
  admin: SupabaseClient,
  params: { reciboId: string; studioId: string },
): Promise<DobleCobroDetectado | null> {
  const { reciboId, studioId } = params;

  const { data: intentos, error } = await admin
    .from('cobros_intentos')
    .select('payment_intent_id, importe_centimos, origen, desenlace, creado_en')
    .eq('recibo_id', reciboId)
    .eq('studio_id', studioId)
    .eq('desenlace', 'cobrado')
    .order('creado_en', { ascending: true });

  if (error || !intentos || intentos.length === 0) {
    return null;
  }

  // Agrupar por payment_intent_id
  const porPaymentIntent = new Map<string, IntentoCobro>();
  for (const intento of intentos) {
    if (!porPaymentIntent.has(intento.payment_intent_id)) {
      porPaymentIntent.set(intento.payment_intent_id, intento);
    }
  }

  // Si hay 2+ payment_intent_id distintos → DOBLE COBRO
  if (porPaymentIntent.size >= 2) {
    const intentosExitosos = Array.from(porPaymentIntent.values());
    const importeTotal = intentosExitosos.reduce((sum, i) => sum + i.importe_centimos, 0);
    const importePrimero = intentosExitosos[0]?.importe_centimos ?? 0;
    const importeDuplicado = importeTotal - importePrimero;

    return {
      recibo_id: reciboId,
      studio_id: studioId,
      intentos_exitosos: intentosExitosos,
      importe_duplicado_centimos: importeDuplicado,
      mensaje: `Doble cobro detectado: ${intentosExitosos.length} cargos exitosos (${importeDuplicado / 100} EUR hay que devolver)`,
    };
  }

  return null;
}

/**
 * Detecta TODOS los recibos del estudio con doble cobro (útil para barrido/auditoría).
 * Agrupa por (recibo_id, studio_id) para el mapeo de la tarjeta de alertas.
 */
export async function detectarTodosLosDoblesCobros(
  admin: SupabaseClient,
  studioId: string,
): Promise<DobleCobroDetectado[]> {
  const { data: intentos, error } = await admin
    .from('cobros_intentos')
    .select('recibo_id, payment_intent_id, importe_centimos, origen, desenlace, creado_en')
    .eq('studio_id', studioId)
    .eq('desenlace', 'cobrado')
    .order('recibo_id, creado_en', { ascending: true });

  if (error || !intentos || intentos.length === 0) {
    return [];
  }

  // Agrupar por recibo
  const porRecibo = new Map<string, IntentoCobro[]>();
  for (const intento of intentos) {
    if (!porRecibo.has(intento.recibo_id)) {
      porRecibo.set(intento.recibo_id, []);
    }
    porRecibo.get(intento.recibo_id)!.push(intento);
  }

  const dobles: DobleCobroDetectado[] = [];
  for (const [reciboId, intentosDelRecibo] of porRecibo) {
    // Agrupar por payment_intent_id dentro del recibo
    const porPaymentIntent = new Map<string, IntentoCobro>();
    for (const intento of intentosDelRecibo) {
      if (!porPaymentIntent.has(intento.payment_intent_id)) {
        porPaymentIntent.set(intento.payment_intent_id, intento);
      }
    }

    // Si hay 2+ payment_intent_id → es un doble cobro
    if (porPaymentIntent.size >= 2) {
      const intentosExitosos = Array.from(porPaymentIntent.values());
      const importeTotal = intentosExitosos.reduce((sum, i) => sum + i.importe_centimos, 0);
      const importePrimero = intentosExitosos[0]?.importe_centimos ?? 0;
      const importeDuplicado = importeTotal - importePrimero;

      dobles.push({
        recibo_id: reciboId,
        studio_id: studioId,
        intentos_exitosos: intentosExitosos,
        importe_duplicado_centimos: importeDuplicado,
        mensaje: `Doble cobro: ${intentosExitosos.length} cargos (${importeDuplicado / 100} EUR)`,
      });
    }
  }

  return dobles;
}

/**
 * Detecta y registra TODOS los dobles cobros en los últimos N días.
 * Agregación para cron o barrido manual de auditoría.
 */
export async function detectarYRegistrarDoblesCobros(
  admin: SupabaseClient,
  diasAtras: number = 7,
): Promise<{ detectados: number; registrados: number; errores: string[] }> {
  const desde = new Date();
  desde.setDate(desde.getDate() - diasAtras);

  const { data: estudios, error: errEstudios } = await admin
    .from('studios')
    .select('id')
    .gte('creado_en', desde.toISOString());

  if (errEstudios || !estudios) {
    return { detectados: 0, registrados: 0, errores: [errEstudios?.message ?? 'Sin estudios'] };
  }

  let detectados = 0;
  let registrados = 0;
  const errores: string[] = [];

  for (const studio of estudios) {
    try {
      const dobles = await detectarTodosLosDoblesCobros(admin, studio.id);
      detectados += dobles.length;

      for (const doble of dobles) {
        const paymentIntentIds = doble.intentos_exitosos.map((i) => i.payment_intent_id);
        const primeraFecha = new Date(Math.min(...doble.intentos_exitosos.map((i) => new Date(i.creado_en).getTime())));
        const ultimaFecha = new Date(Math.max(...doble.intentos_exitosos.map((i) => new Date(i.creado_en).getTime())));

        const { error } = await admin
          .from('dobles_cobros_detectados')
          .upsert({
            studio_id: doble.studio_id,
            recibo_id: doble.recibo_id,
            payment_intent_ids: paymentIntentIds,
            importe_centimos: doble.importe_duplicado_centimos,
            intentos_exitosos_count: doble.intentos_exitosos.length,
            primera_fecha: primeraFecha.toISOString(),
            ultima_fecha: ultimaFecha.toISOString(),
            estado: 'PENDIENTE_REVISION',
            metadata: {
              detectado_por: 'PAY-5-detector',
              intentos: doble.intentos_exitosos,
            },
          }, { onConflict: 'recibo_id,studio_id' });

        if (!error) registrados++;
        else errores.push(`${doble.recibo_id}: ${error.message}`);
      }
    } catch (err) {
      errores.push(`Studio ${studio.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { detectados, registrados, errores };
}

/**
 * Obtiene todos los dobles cobros en estado PENDIENTE_REVISION.
 */
export async function obtenerDoblesCobrosEnRevision(
  admin: SupabaseClient,
  studioId: string,
): Promise<Array<{
  id: string;
  recibo_id: string;
  importe_centimos: number;
  intentos_exitosos_count: number;
  primera_fecha: string;
  mensaje?: string;
  estado: string;
}>> {
  const { data, error } = await admin
    .from('dobles_cobros_detectados')
    .select('id, recibo_id, importe_centimos, intentos_exitosos_count, primera_fecha, estado')
    .eq('studio_id', studioId)
    .eq('estado', 'PENDIENTE_REVISION')
    .order('primera_fecha', { ascending: false });

  if (error || !data) {
    console.error('[obtenerDoblesCobrosEnRevision]', error?.message);
    return [];
  }

  return data.map((d) => ({
    ...d,
    mensaje: `Doble cobro: ${d.intentos_exitosos_count} cargos (${d.importe_centimos / 100} EUR)`,
  }));
}
