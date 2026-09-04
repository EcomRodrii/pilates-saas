// «Tu ritmo»: la semana de la alumna y su racha, calculadas de sus clases.
//
// ⚠️ Sin `@/` a propósito, ni un import: el runner de tests es
// `node --test --experimental-strip-types` y NO resuelve ese alias. Un test que
// importe un módulo con `@/` no falla — **no se ejecuta**, y `npm test` reporta
// menos casos sin marcar ninguno en rojo. Aquí solo hay funciones puras sobre
// cadenas y arrays, así que se pueden probar de verdad.
//
// ⚠️ Y no se inventa nada. Estas cifras salen de reservas que EXISTEN:
// 'asistida' es lo que el estudio marcó, 'confirmada' en día pasado cuenta como
// asistida porque muchos estudios no pasan lista. Lo que no se puede calcular
// —una meta semanal que nadie ha fijado, un reto que nadie ha creado— no se
// rellena con un número bonito: se deja fuera.

/** Lo mínimo que hace falta de una reserva para el cálculo. */
export interface ClaseHecha {
  /** ISO `YYYY-MM-DD` del día de la clase. */
  fecha: string;
  /** Estado de la reserva. */
  estado: string;
}

/** Cuenta como hecha si se asistió, o si estaba confirmada y el día ya pasó. */
export function cuentaComoHecha(c: ClaseHecha, hoy: string): boolean {
  if (c.estado === 'asistida') return true;
  return c.estado === 'confirmada' && c.fecha < hoy;
}

/**
 * Lunes de la semana de `iso`, en ISO.
 *
 * Semana que empieza en LUNES, no en domingo: el diseño rotula los días
 * `L M X J V S D`. Se construye a mediodía para que un cambio de hora no
 * desplace el día.
 */
export function lunesDe(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number);
  const t = new Date(a, (m ?? 1) - 1, d, 12);
  // `getDay()` da 0 para domingo; se lleva a 6 para que lunes sea 0.
  const desplazamiento = (t.getDay() + 6) % 7;
  t.setDate(t.getDate() - desplazamiento);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

export interface DiaSemana {
  /** ISO del día. */
  fecha: string;
  /** Inicial del día como la rotula el diseño. */
  letra: string;
  /** Tiene una clase hecha. */
  hecha: boolean;
  /** Es hoy. */
  esHoy: boolean;
}

const LETRAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

/** Los siete días de la semana en curso, marcando los que tienen clase hecha. */
export function semanaDe(clases: ClaseHecha[], hoy: string): DiaSemana[] {
  const lunes = lunesDe(hoy);
  const hechas = new Set(clases.filter((c) => cuentaComoHecha(c, hoy)).map((c) => c.fecha));
  const [a, m, d] = lunes.split('-').map(Number);
  return LETRAS.map((letra, i) => {
    const t = new Date(a, (m ?? 1) - 1, d + i, 12);
    const fecha = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
    return { fecha, letra, hecha: hechas.has(fecha), esHoy: fecha === hoy };
  });
}

/** Cuántas clases lleva hechas esta semana. */
export function hechasEstaSemana(clases: ClaseHecha[], hoy: string): number {
  return semanaDe(clases, hoy).filter((d) => d.hecha).length;
}

/**
 * Semanas consecutivas con al menos una clase, contando hacia atrás.
 *
 * La semana EN CURSO solo rompe la racha si ya terminó sin clases — mientras
 * corre, que aún no haya ido no significa que la haya perdido. Sin esto, la
 * racha se caería cada lunes por la mañana y volvería a aparecer el martes, que
 * es la peor forma posible de contar algo que pretende motivar.
 */
export function rachaSemanas(clases: ClaseHecha[], hoy: string): number {
  const semanas = new Set(
    clases.filter((c) => cuentaComoHecha(c, hoy)).map((c) => lunesDe(c.fecha)),
  );
  let racha = 0;
  let cursor = lunesDe(hoy);
  // La semana en curso: si tiene clase suma; si no, se salta sin romper.
  if (semanas.has(cursor)) racha += 1;
  cursor = retrocederUnaSemana(cursor);
  while (semanas.has(cursor)) {
    racha += 1;
    cursor = retrocederUnaSemana(cursor);
  }
  return racha;
}

function retrocederUnaSemana(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number);
  const t = new Date(a, (m ?? 1) - 1, d - 7, 12);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}
