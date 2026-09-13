// «Rellenar con sus clases»: una disponibilidad de partida deducida de las
// clases que ya da cada instructora.
//
// Sin disponibilidad cargada, `rankear_candidatas` no puede proponer a nadie, y
// en un estudio recién abierto nadie la ha cargado todavía (evaluación del
// 13-sep: «Ninguna candidata», justo lo que se venía a probar). Las franjas en
// las que una instructora ya da clase son las que suele estar en el estudio: es
// un punto de partida razonable que la propietaria revisa antes de guardar.
//
// ⚠️ No la propone para una clase que coincide con otra suya: eso lo descarta
// el motor aparte (`instructor_tiene_conflicto`), no la rejilla.
//
// Puro y sin zona horaria: quien llama pasa día y minutos YA en hora del
// estudio (`franjaLocalDe`), así se prueba sin depender del huso del runtime.

import { FRANJAS, celdaKey } from './franjas.ts';

/** Una clase ya pasada a hora local del estudio. */
export interface ClaseLocal {
  /** 0=domingo..6=sábado. */
  dow: number;
  inicioMin: number;
  finMin: number;
}

const FIN_DEL_DIA = 24 * 60;

function aMinutos(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Celdas de la rejilla (`celdaKey`) que tocan las clases dadas. */
export function celdasDesdeClases(clases: readonly ClaseLocal[]): Set<string> {
  const out = new Set<string>();
  for (const c of clases) {
    // Una clase que acaba pasada la medianoche (o sin fin válido) llega hasta
    // el final del día: la rejilla no parte días.
    const fin = c.finMin > c.inicioMin ? c.finMin : FIN_DEL_DIA;
    for (const f of FRANJAS) {
      const desde = aMinutos(f.horaInicio);
      // 23:59 es como la rejilla escribe «hasta el cierre».
      const hasta = f.horaFin === '23:59' ? FIN_DEL_DIA : aMinutos(f.horaFin);
      if (c.inicioMin < hasta && fin > desde) out.add(celdaKey(c.dow, f.key));
    }
  }
  return out;
}
