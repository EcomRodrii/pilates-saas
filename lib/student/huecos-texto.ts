// Lo que dice Inicio cuando hoy ya no quedan huecos. Puro (huecos-texto.test.ts).
//
// ⚠️ Antes decía «Mira mañana — suele haber más plazas por la mañana.» sin mirar
// nada: ninguna cifra respaldaba ni lo de mañana ni lo de las mañanas. Ahora solo
// se afirma lo que dicen las clases que ya están cargadas (las mismas, y con el
// mismo aforo orientativo, que cuenta `ProximaClaseVacia` para hoy).

import { addDias } from './formato.ts';

export function cuerpoSinHuecosHoy(clases: ReadonlyArray<{ fecha: string; plazasLibres: number }>, hoy: string): string {
  const manana = addDias(hoy, 1);
  const n = clases.filter((c) => c.fecha === manana && c.plazasLibres > 0).length;
  if (n > 0) return `Mañana hay ${n} ${n === 1 ? 'clase' : 'clases'} con plaza libre.`;
  return 'Mira el horario de los próximos días.';
}
