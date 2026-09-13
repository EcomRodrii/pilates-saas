// Un aviso por alumna al editar una serie, no uno por clase.
//
// «Guardar esta y las siguientes» avisaba clase a clase: una alumna con plaza
// en las 4 clases de la serie recibía 4 correos iguales por UN cambio
// (evaluación del 13-sep). Aquí se decide, para cada alumna, en qué clase se le
// avisa —la primera suya que cambia— y si detrás hay más de la misma serie,
// para que el correo lo diga.
//
// Puro y sin imports de servidor: lo usan la ruta y el panel (el tipo).

/** Lo que el panel sabe de cada clase de la serie que cambia. */
export interface CambioClaseSerie {
  sesionId: string;
  /** ISO del NUEVO inicio: ordena las clases. */
  inicio: string;
  clase: string;
  cuando: string;
  sala: string;
  /** Solo si cambió (texto in-app «· con X»). */
  instructora: string;
  /** Quién la da ahora, cambie o no (el correo lo enseña siempre). */
  instructorActual: string;
  instructorAnterior?: string;
  fecha: string;
  hora: string;
  cambioHora?: boolean;
  cambioSala?: boolean;
}

export interface AvisoAlumna {
  /** La primera clase suya que cambia: la que sale en el correo. */
  sesionId: string;
  /** Si tiene más clases de la serie que también cambian. */
  masClases: boolean;
}

/**
 * `sesionesEnOrden`: ids de las clases que cambian, de la más próxima a la más
 * lejana. `alumnasPorSesion`: quién está apuntada a cada una (cualquier clave
 * estable por alumna). Devuelve alumna → dónde avisarla.
 */
export function avisoPorAlumna(
  sesionesEnOrden: readonly string[],
  alumnasPorSesion: ReadonlyMap<string, readonly string[]>,
): Map<string, AvisoAlumna> {
  const out = new Map<string, AvisoAlumna>();
  for (const sesionId of sesionesEnOrden) {
    for (const alumna of new Set(alumnasPorSesion.get(sesionId) ?? [])) {
      const previo = out.get(alumna);
      if (previo) previo.masClases = true;
      else out.set(alumna, { sesionId, masClases: false });
    }
  }
  return out;
}
