const MS_DIA = 86_400_000;

/** Días tras la apertura en que la sección sigue en la home (fase «primeros 30»). */
export const DIAS_TRAS_APERTURA = 30;
/** Sin fecha de apertura, solo se pregunta a estudios recién dados de alta. */
export const DIAS_ALTA_RECIENTE = 30;

export interface EstadoApertura {
  fechaApertura: string | null;
  fase: string | null;
  estudioCreadoEn: string | null;
}

/**
 * La sección de apertura es un aviso que desaparece solo. Un estudio que ya
 * opera (fase OPERANDO, o dado de alta hace tiempo sin fecha de apertura) no
 * debe verla nunca: preguntarle «¿cuándo abres?» sería ruido.
 */
export function debeMostrarApertura(e: EstadoApertura, now: Date): boolean {
  if (e.fase === 'OPERANDO') return false;
  if (e.fechaApertura) {
    const fin = new Date(`${e.fechaApertura}T00:00:00Z`).getTime() + DIAS_TRAS_APERTURA * MS_DIA;
    return now.getTime() < fin;
  }
  if (!e.estudioCreadoEn) return false;
  return now.getTime() - new Date(e.estudioCreadoEn).getTime() < DIAS_ALTA_RECIENTE * MS_DIA;
}

/** Días que faltan para abrir (negativo = ya abrió). null sin fecha. */
export function diasHastaApertura(fechaApertura: string | null, now: Date): number | null {
  if (!fechaApertura) return null;
  const hoy = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((new Date(`${fechaApertura}T00:00:00Z`).getTime() - hoy) / MS_DIA);
}
