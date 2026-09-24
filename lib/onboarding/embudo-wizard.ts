// ─────────────────────────────────────────────────────────────────────────────
// Embudo del asistente de bienvenida: en qué pantalla se queda cada estudio.
//
// Hasta aquí el asistente (logo → ~10 preguntas → resumen) solo emitía dos
// eventos, y los dos son de SALIDA (`bienvenida_saltada`, `bienvenida_recortada`):
// se sabía cuánta gente se iba, no dónde. Con 5 de 7 estudios sin ninguna clase
// programada, decidir qué recortar sin ese dato es adivinar.
//
// Un evento por pantalla, la PRIMERA vez que se llega a ella (volver atrás no
// cuenta dos veces), con lo mínimo para leer un embudo:
//   bienvenida_iniciada            — se enseña el primer paso (el logo)
//   bienvenida_paso { paso, n, total, retomado? }
//   bienvenida_resumen             — contestó todo lo que quiso y ve el resumen
//   bienvenida_completada { destino, en? } — salió con el estudio montado
// Ninguno lleva lo que contestó: solo dónde está.
//
// Sin `@/` ni SDK: se prueba con `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

export type FaseWizard = 'intro' | 'wizard' | 'resumen';

export interface EventoWizard {
  nombre: 'bienvenida_paso' | 'bienvenida_resumen';
  props?: Record<string, string | number | boolean>;
}

/**
 * ¿Qué evento toca emitir al llegar a este punto del asistente? `null` = ninguno
 * (la intro no es una pantalla de decisión) o ya se emitió.
 *
 * `vistos` lo posee quien llama (un `Set` en un ref) y se rellena aquí: así la
 * regla «una sola vez por pantalla» vive en un sitio y se puede probar.
 */
export function eventoAlLlegar(
  vistos: Set<string>,
  punto: { fase: FaseWizard; pasoId?: string | null; n?: number; total?: number },
): EventoWizard | null {
  if (punto.fase === 'resumen') {
    if (vistos.has('resumen')) return null;
    vistos.add('resumen');
    return { nombre: 'bienvenida_resumen' };
  }
  if (punto.fase !== 'wizard' || !punto.pasoId) return null;
  if (vistos.has(punto.pasoId)) return null;
  // Retomado = el primer paso que se ve NO es el primero: volvió a un asistente
  // a medias (el progreso se guarda). Sin esto, ese estudio parecería haberse
  // saltado las preguntas de antes.
  const retomado = vistos.size === 0 && (punto.n ?? 1) > 1;
  vistos.add(punto.pasoId);
  return {
    nombre: 'bienvenida_paso',
    props: {
      paso: punto.pasoId,
      n: punto.n ?? 0,
      total: punto.total ?? 0,
      ...(retomado ? { retomado: true } : {}),
    },
  };
}
