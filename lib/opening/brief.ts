// Opening Brief: el resumen de la mañana del estudio que abre. Solo con datos
// reales, y solo si hay algo que contar: un resumen igual cada día se convierte
// en ruido y deja de leerse (mismo criterio que el Umbral del Decision OS).

/** Días de la cuenta atrás en que el brief sale aunque no haya novedades. */
export const DIAS_HITO = new Set([30, 14, 7, 3, 1, 0]);
/** Ventana del brief: el último mes antes de abrir y el día de la apertura. */
export const DIAS_BRIEF = 30;

export interface EntradaBrief {
  diasHastaApertura: number | null;
  fechaAproximada: boolean;
  ventasAyer: number;
  interesadasAyer: number;
  /** La alerta abierta más grave, si hay. */
  alerta: { titulo: string } | null;
  /** El primer «siguiente paso» recomendado, si hay. */
  siguientePaso: { titulo: string } | null;
}

export interface Brief { titulo: string; cuerpo: string }

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export function construirBrief(e: EntradaBrief): Brief | null {
  const d = e.diasHastaApertura;
  // Sin fecha, o con una aproximada, no hay cuenta atrás que contar; y fuera
  // del último mes el brief diario no aporta.
  if (d === null || e.fechaAproximada || d < 0 || d > DIAS_BRIEF) return null;

  const hayNovedades = e.ventasAyer > 0 || e.interesadasAyer > 0;
  if (!hayNovedades && !e.alerta && !DIAS_HITO.has(d)) return null;

  const titulo = d === 0 ? 'Hoy abres tu estudio' : d === 1 ? 'Mañana abres tu estudio' : `Tu estudio abre en ${d} días`;

  const partes: string[] = [];
  if (hayNovedades) {
    const ayer = [
      e.ventasAyer > 0 ? `+${plural(e.ventasAyer, 'cuota vendida', 'cuotas vendidas')}` : null,
      e.interesadasAyer > 0 ? `+${plural(e.interesadasAyer, 'interesada', 'interesadas')}` : null,
    ].filter(Boolean).join(', ');
    partes.push(`Ayer: ${ayer}.`);
  }
  if (e.alerta) partes.push(`Atención: ${e.alerta.titulo.replace(/\.$/, '')}.`);
  if (e.siguientePaso) partes.push(`Siguiente paso: ${e.siguientePaso.titulo.replace(/\.$/, '')}.`);
  if (partes.length === 0) partes.push('Todo lo que tienes pendiente para abrir está en Inicio.');

  return { titulo, cuerpo: partes.join(' ') };
}
