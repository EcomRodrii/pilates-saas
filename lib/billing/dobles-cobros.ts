import type { SupabaseClient } from '@supabase/supabase-js';

// PAY-5: avisa de las detecciones de `dobles_cobros_detectados` que aún no se han
// notificado y las marca. La DETECCIÓN vive en SQL (`vigilar_dobles_cobros()`);
// aquí solo se avisa. El `avisar` se inyecta (Sentry en la ruta) para poder
// probar el marcado sin él.

export interface AvisoDobleCobro {
  studioId: string;
  reciboId: string | null;
  paymentIntentIds: string[];
  detectadoEn: string;
}

export interface ResumenAvisoDoblesCobros {
  pendientes: number;
  avisados: number;
  errores: number;
}

const TOPE = 50;

export async function avisarDoblesCobrosSinNotificar(
  admin: SupabaseClient,
  avisar: (a: AvisoDobleCobro) => void,
): Promise<ResumenAvisoDoblesCobros> {
  const { data, error } = await admin
    .from('dobles_cobros_detectados')
    .select('id, studio_id, recibo_id, payment_intent_ids, detectado_en')
    .is('notificado_en', null)
    .eq('estado', 'DETECTADA')
    .order('detectado_en', { ascending: true })
    .limit(TOPE);
  // Leer mal NO es «no hay nada»: lanza para que la ruta responda 500.
  if (error) throw new Error(`dobles_cobros_detectados: ${error.message}`);

  const filas = data ?? [];
  let avisados = 0;
  let errores = 0;
  for (const f of filas) {
    avisar({
      studioId: f.studio_id as string,
      reciboId: (f.recibo_id as string | null) ?? null,
      paymentIntentIds: (f.payment_intent_ids as string[]) ?? [],
      detectadoEn: f.detectado_en as string,
    });
    // Compare-and-set sobre `notificado_en is null`: dos pasadas solapadas no
    // marcan (ni cuentan) dos veces.
    const { error: errMarca } = await admin
      .from('dobles_cobros_detectados')
      .update({ notificado_en: new Date().toISOString() })
      .eq('id', f.id as string)
      .is('notificado_en', null);
    if (errMarca) errores++; else avisados++;
  }
  return { pendientes: filas.length, avisados, errores };
}
