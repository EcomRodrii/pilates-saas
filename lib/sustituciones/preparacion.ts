// ¿Está el equipo en condiciones de que el motor encuentre a alguien?
//
// `rankear_candidatas` (0038) EXCLUYE a toda instructora que no tenga ninguna
// ventana en `instructora_disponibilidad`. Es correcto — sin horario no se puede
// saber si puede — pero tiene una consecuencia que el panel no contaba: si nadie
// ha rellenado su disponibilidad, el ranking sale vacío SIEMPRE, y el mensaje
// "ninguna candidata disponible para esta franja" hace pensar que se ha mirado a
// todo el equipo y no encaja nadie. Son dos situaciones muy distintas: una no
// tiene arreglo, la otra se arregla mandando unos cuantos enlaces.
//
// Este módulo es puro para poder fijar ese lenguaje con tests.

export interface DiagnosticoEquipo {
  /** Instructoras activas del estudio. */
  total: number;
  /** Las que NO tienen ninguna franja cargada → invisibles para el ranking. */
  sinDisponibilidad: { id: string; nombre: string }[];
}

/**
 * ¿Merece la pena avisar a la propietaria de que su equipo está a medio
 * configurar? Solo si hay alguien sin disponibilidad. Con el equipo entero sin
 * cargar es urgente; con una sola persona suelta, también conviene decirlo (esa
 * persona nunca aparecerá como candidata y nadie entendería por qué).
 */
export function equipoIncompleto(d: DiagnosticoEquipo): boolean {
  return d.sinDisponibilidad.length > 0;
}

/** Enumera nombres en español natural: "Ana", "Ana y Berta", "Ana, Berta y Carla". */
export function listarNombres(nombres: string[], max = 3): string {
  if (nombres.length === 0) return '';
  const visibles = nombres.slice(0, max);
  const restantes = nombres.length - visibles.length;

  // Con recorte, los visibles van por comas y el "y" lo gasta el resto
  // ("Ana, Berta, Carla y 3 más"); sin recorte, el "y" une los dos últimos.
  // Si no, sale un "Ana, Berta y Carla y 3 más" con dos "y" seguidos.
  if (restantes > 0) return `${visibles.join(', ')} y ${restantes} más`;
  if (visibles.length === 1) return visibles[0];
  return `${visibles.slice(0, -1).join(', ')} y ${visibles[visibles.length - 1]}`;
}

/**
 * Aviso de cabecera del panel. Devuelve null si no hay nada que avisar — no
 * queremos una franja de alerta permanente que la propietaria aprenda a ignorar.
 */
export function avisoEquipoIncompleto(d: DiagnosticoEquipo): string | null {
  const n = d.sinDisponibilidad.length;
  if (n === 0) return null;

  const nombres = listarNombres(d.sinDisponibilidad.map((i) => i.nombre));

  // Caso extremo: NADIE tiene disponibilidad. El módulo no puede funcionar en
  // absoluto y hay que decirlo sin rodeos.
  if (n === d.total) {
    return `Todavía no puedo proponerte a nadie: ninguna de tus ${d.total} instructoras tiene su disponibilidad cargada. Mándales el enlace y en un minuto lo marcan desde el móvil.`;
  }

  return n === 1
    ? `${nombres} no tiene su disponibilidad cargada, así que no puedo proponerla como sustituta.`
    : `${n} de tus ${d.total} instructoras no tienen su disponibilidad cargada (${nombres}), así que no puedo proponerlas como sustitutas.`;
}

/**
 * Mensaje del hueco "no hay candidatas" DENTRO de una sustitución concreta.
 * `sinDispExcluyendoOriginal` = las que faltan por configurar, sin contar a la
 * instructora que causa la baja (no puede cubrirse a sí misma, así que meterla
 * en la cuenta despistaría).
 */
export function motivoSinCandidatas(sinDispExcluyendoOriginal: number): string {
  if (sinDispExcluyendoOriginal > 0) {
    return sinDispExcluyendoOriginal === 1
      ? 'Ninguna candidata para esta franja. Además hay 1 instructora sin disponibilidad cargada: no he podido ni considerarla.'
      : `Ninguna candidata para esta franja. Además hay ${sinDispExcluyendoOriginal} instructoras sin disponibilidad cargada: no he podido ni considerarlas.`;
  }
  return 'Ninguna candidata disponible para esta franja. Cancela la clase (avisamos a las alumnas) o resuélvelo por tu cuenta.';
}
