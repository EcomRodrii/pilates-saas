// Clases que se quedan por encima de su aforo tras importar reservas.
//
// El importador no bloquea por aforo a propósito (descartar en silencio la reserva
// de alguien es peor que un aviso), pero el aviso se perdía: contaba CLASES, incluía
// clases que ya venían pasadas de aforo antes del archivo, no distinguía futuras
// (que hay que resolver YA: «Mat Suave lun 12 oct: 16 de 12») de históricas (que
// son solo historia) y la Migración Mágica ni lo enseñaba. Puro y con índice por id.

export interface SesionAforo { aforo: number; inicioMs: number; nombre: string }

export interface ResumenSobreAforo {
  /** Clases FUTURAS por encima de su aforo (lo que hay que arreglar). */
  futuras: number;
  /** Clases ya pasadas por encima del aforo (historial: informativo). */
  pasadas: number;
  /** Las peores futuras, en frase: «Mat Suave · lun 12 oct 08:00: 16 reservas para 12 plazas». */
  detalle: string[];
}

export function resumirSobreAforo(
  ocupadas: ReadonlyMap<string, number>,
  sesiones: ReadonlyMap<string, SesionAforo>,
  tocadas: ReadonlySet<string>,
  ahoraMs: number,
  formatoFecha: (ms: number) => string,
  maxDetalle = 5,
): ResumenSobreAforo {
  let futuras = 0;
  let pasadas = 0;
  const peores: { exceso: number; frase: string }[] = [];
  for (const id of tocadas) {
    const s = sesiones.get(id);
    const n = ocupadas.get(id) ?? 0;
    if (!s || s.aforo <= 0 || n <= s.aforo) continue;
    if (s.inicioMs > ahoraMs) {
      futuras++;
      peores.push({ exceso: n - s.aforo, frase: `${s.nombre} · ${formatoFecha(s.inicioMs)}: ${n} reservas para ${s.aforo} plazas` });
    } else {
      pasadas++;
    }
  }
  peores.sort((a, b) => b.exceso - a.exceso);
  return { futuras, pasadas, detalle: peores.slice(0, maxDetalle).map(p => p.frase) };
}

/**
 * Clases del archivo que no caben en su aforo y a cuánto habría que subirlo
 * (las reservas que ocuparían plaza). Solo las que toca el archivo: una que ya
 * venía pasada de aforo antes de importar no es cosa suya.
 */
export function aforoNecesario(
  ocupadas: ReadonlyMap<string, number>,
  sesiones: ReadonlyMap<string, SesionAforo>,
  tocadas: ReadonlySet<string>,
): { sesionId: string; nuevoAforo: number }[] {
  const out: { sesionId: string; nuevoAforo: number }[] = [];
  for (const id of tocadas) {
    const s = sesiones.get(id);
    const n = ocupadas.get(id) ?? 0;
    if (!s || s.aforo <= 0 || n <= s.aforo) continue;
    out.push({ sesionId: id, nuevoAforo: n });
  }
  return out;
}
