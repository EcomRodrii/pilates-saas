// ─────────────────────────────────────────────────────────────────────────────
// El recorrido rápido del alta nueva (PR-5, maqueta aprobada del 21-oct-2026,
// «08 · El panel después»): TRES paradas la primera vez que entra en el panel,
// con «Saltar» en cada una. No es la visita guiada de 43 pasos (esa queda como
// «Visita guiada completa», opcional, decisión D3) ni la arranca.
//
// Las paradas señalan cosas que YA están en pantalla: la lista «Pon en marcha
// tu estudio», el Calendario del menú (`data-tour="menu-principal"`, el mismo
// ancla que la visita) y el WhatsApp de la esquina. Lo que no esté a la vista
// (otro ancho, otra pantalla) se salta: un bocadillo apuntando a nada es peor
// que uno menos.
//
// Sin Tenti: es soporte y orientación, no «Tentare lo hace por ti».
// Puro, sin `@/`: los textos y dónde va el bocadillo se prueban con `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

export interface ParadaRecorrido {
  id: 'lista' | 'calendario' | 'ayuda';
  titulo: string;
  texto: string;
  /** Selectores CSS, en orden: el primero que esté a la vista. */
  objetivos: readonly string[];
}

export const PARADAS_RECORRIDO: readonly ParadaRecorrido[] = [
  {
    id: 'lista',
    titulo: '¿Qué es esta lista?',
    texto: 'Lo que falta para abrir tu estudio, en orden. Se marca sola cuando lo haces: no tienes que tachar nada.',
    objetivos: ['[data-recorrido="lista"]'],
  },
  {
    id: 'calendario',
    titulo: '¿Dónde está mi horario?',
    texto: 'En Calendario. Ahí creas y mueves tus clases, y ves quién viene a cada una.',
    objetivos: ['[data-tour="menu-principal"] a[href="/calendario"]'],
  },
  {
    id: 'ayuda',
    // La maqueta decía «?»: en el panel nuevo, lo que explica cada pantalla es
    // la «i» junto a su título (AyudaDePantalla). Se dice lo que hay.
    titulo: '¿Y si me atasco?',
    texto: 'La «i» junto al título te explica la pantalla en la que estás. WhatsApp te pone con una persona del equipo.',
    objetivos: ['[data-whatsapp-soporte]'],
  },
];

/** El evento con el que «Ver el recorrido rápido otra vez» lo vuelve a abrir. */
export const EVENTO_RECORRIDO = 'tentare:recorrido-rapido';

/** La clave de este navegador: si el servidor no lo apunta, aquí no vuelve a salir igualmente. */
export const claveRecorridoVisto = (studioId: string) => `tentare-recorrido-visto:${studioId}`;

export interface Caja { top: number; left: number; width: number; height: number }
export type Lado = 'derecha' | 'abajo' | 'arriba' | 'izquierda';

const MARGEN = 12;
const BORDE = 8;

/**
 * Dónde va el bocadillo para señalar `objetivo` sin taparlo: a su derecha si
 * cabe, si no debajo, si no encima y, en último caso, a su izquierda. Siempre
 * dentro de la ventana.
 */
export function colocarBocadillo(objetivo: Caja, ventana: { ancho: number; alto: number }, tam: { ancho: number; alto: number }):
  { top: number; left: number; lado: Lado } {
  const dentro = (v: number, min: number, max: number) => Math.max(min, Math.min(v, Math.max(min, max)));
  const derecha = objetivo.left + objetivo.width;
  const abajo = objetivo.top + objetivo.height;
  const topAlineado = dentro(objetivo.top + objetivo.height / 2 - tam.alto / 2, BORDE, ventana.alto - tam.alto - BORDE);
  const leftAlineado = dentro(objetivo.left + objetivo.width / 2 - tam.ancho / 2, BORDE, ventana.ancho - tam.ancho - BORDE);
  if (derecha + MARGEN + tam.ancho <= ventana.ancho - BORDE) return { top: topAlineado, left: derecha + MARGEN, lado: 'derecha' };
  if (abajo + MARGEN + tam.alto <= ventana.alto - BORDE) return { top: abajo + MARGEN, left: leftAlineado, lado: 'abajo' };
  if (objetivo.top - MARGEN - tam.alto >= BORDE) return { top: objetivo.top - MARGEN - tam.alto, left: leftAlineado, lado: 'arriba' };
  return { top: topAlineado, left: dentro(objetivo.left - MARGEN - tam.ancho, BORDE, ventana.ancho - tam.ancho - BORDE), lado: 'izquierda' };
}
