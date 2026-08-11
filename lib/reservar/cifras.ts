// La banda de cifras de la página pública («+500 alumnas», «+50 clases
// semanales»…).
//
// ⚠️ **Ninguna cifra de aquí se escribe a mano.** Todas salen de contar datos
// reales del estudio. Este repo ya publicó una vez un «Compatibilidad 87 %» que
// era un `clamp` sobre una heurística fija, y la lección fue cara: un número en
// pantalla es una promesa, y una promesa que nadie puede comprobar hace dudar
// de todo lo demás de la página.
//
// Lo que sí hace este módulo es decidir **cuándo una cifra merece enseñarse** y
// **cómo se redondea**, que es donde un contador honesto se convierte en
// publicidad mala.

export interface Cifra {
  id: string;
  /** Ya redondeado y con el «+» si lo lleva. */
  valor: string;
  etiqueta: string;
}

/**
 * Redondea **hacia abajo** a un escalón legible y añade «+».
 *
 * 512 → «+500». 47 → «+40». Nunca hacia arriba: «+500» con 498 socias es una
 * mentira pequeña que alguien puede comprobar, y en una página que además
 * cobra, la credibilidad no se recupera por 2 socias.
 *
 * Por debajo del primer escalón devuelve el número exacto sin «+»: «12» es
 * verdad y «+10» es una forma rara de decir doce.
 */
export function redondearHaciaAbajo(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0';
  // ⚠️ Por debajo de 50 se dice el número EXACTO, sin «+». Redondear ahí no
  // engorda nada y encima resta: con la primera versión de esto, 12 socias se
  // anunciaban como «+10» —lo cazó su propio test— y 47 clases como «+40».
  // «12» y «47» son verdad, se leen igual de bien, y son MÁS de lo que el
  // redondeo prometía.
  if (n < 50) return String(Math.floor(n));
  const escalon = n >= 1000 ? 500 : n >= 100 ? 100 : 25;
  return `+${Math.floor(n / escalon) * escalon}`;
}

/**
 * ¿Esta cifra vende, o delata?
 *
 * Un estudio nuevo con 12 socias no gana nada enseñando «12 alumnas» en su
 * portada: la cifra existe, es verdad, y aun así juega en su contra. Cada
 * cifra tiene un suelo por debajo del cual **no se pinta** — no se infla, no se
 * maquilla: desaparece.
 *
 * Los suelos son distintos porque los números lo son: 6 instructoras es mucho,
 * 6 socias es un problema.
 */
export const SUELOS: Record<string, number> = {
  socias: 50,
  clasesSemana: 10,
  instructoras: 3,
  sedes: 2,
};

export interface DatosCifras {
  socias?: number | null;
  clasesSemana?: number | null;
  instructoras?: number | null;
  sedes?: number | null;
}

const ETIQUETAS: Record<string, { una: string; varias: string }> = {
  socias: { una: 'Alumna', varias: 'Alumnas' },
  clasesSemana: { una: 'Clase cada semana', varias: 'Clases cada semana' },
  instructoras: { una: 'Instructora', varias: 'Instructoras' },
  sedes: { una: 'Sede', varias: 'Sedes' },
};

/**
 * Las cifras que se pueden enseñar, ya listas para pintar.
 *
 * ⚠️ Las etiquetas **no llevan adjetivos**. El diseño decía «alumnas felices» e
 * «instructoras expertas», y ninguna de las dos cosas la podemos contar: son
 * afirmaciones sobre personas que estaríamos escribiendo en nombre de cada
 * estudio, sin que nadie las haya comprobado. Contamos cuántas hay; lo que sean
 * lo dice quien las conoce.
 */
export function cifrasVisibles(datos: DatosCifras): Cifra[] {
  const fuera: Cifra[] = [];
  for (const id of Object.keys(SUELOS) as (keyof DatosCifras)[]) {
    const n = datos[id];
    if (typeof n !== 'number' || !Number.isFinite(n) || n < SUELOS[id]) continue;
    fuera.push({
      id,
      valor: redondearHaciaAbajo(n),
      etiqueta: n === 1 ? ETIQUETAS[id].una : ETIQUETAS[id].varias,
    });
  }
  return fuera;
}

/**
 * ¿Se pinta la banda?
 *
 * Con una sola cifra no es una banda, es un número suelto en mitad de la
 * página — y encima subraya lo que falta. Con dos ya hay un conjunto.
 */
export function mereceBanda(cifras: readonly Cifra[]): boolean {
  return cifras.length >= 2;
}
