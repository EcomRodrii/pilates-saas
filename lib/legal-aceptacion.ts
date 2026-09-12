import type { SupabaseClient } from '@supabase/supabase-js';

// P-2 (auditoría 58ª pasada). `sellarCondicionesVigentes` (legal-sellado.ts)
// siempre firmaba -- también cuando el estudio no ha reescrito NADA (compone
// el texto por defecto igualmente) --, así que un recibo con `terminos_hash`
// relleno no demostraba que alguien hubiera marcado ninguna casilla: el
// checkout embebido (`checkout-embebido.tsx`) solo pinta esa casilla cuando el
// estudio SÍ reescribió su política de privacidad o sus términos, y hasta
// ahora el servidor sellaba igual aunque nadie la hubiera marcado (C-1: el
// botón de Bizum ni siquiera la exigía en el navegador).
//
// Este helper responde exactamente la misma pregunta que ya decide si el
// checkout PINTA la casilla (campos crudos del estudio, nunca `configLegalDe`
// -- esa función siempre compone un documento por defecto), para que el
// servidor pueda EXIGIR la prueba solo cuando de verdad hay algo que aceptar.
// Con la mayoría de estudios sin reescribir ningún texto (decisión de
// producto ya tomada: forzar una casilla contra el texto por defecto de
// todos no aporta nada), esto no cambia el checkout de los que no la tienen.
//
// Fichero aparte de legal-sellado.ts (y sin `import 'server-only'`) a
// propósito: esa guarda hace que cualquier test que importe ese módulo
// reviente fuera del build de Next -- este helper es una consulta pura sobre
// un `SupabaseClient` ya inyectado, mismo patrón que matricula-online.ts.
export async function exigeAceptacionExplicita(
  admin: SupabaseClient,
  studioId: string,
): Promise<boolean> {
  const { data } = await admin
    .from('studios')
    .select('politica_privacidad, terminos_servicio')
    .eq('id', studioId)
    .maybeSingle();
  if (!data) return false;
  const s = data as { politica_privacidad: string | null; terminos_servicio: string | null };
  return !!(s.politica_privacidad || s.terminos_servicio);
}
