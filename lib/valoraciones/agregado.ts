// ─────────────────────────────────────────────────────────────────────────────
// La nota que se PUBLICA de una instructora: la que ve ella en su app y la del
// catálogo de la alumna (decisión del fundador, 14-sep-2026).
//
// Ella sabe quién asistió a cada clase (pasa lista), y solo valora quien
// asistió. Una media «en vivo» deja deducir votos concretos: si sube justo
// después de una clase de tres alumnas, o si se compara con un corte más fino.
// Por eso:
//   · solo cuentan meses CERRADOS (hora de Madrid), nunca el mes en curso;
//   · los meses se acumulan en BLOQUES y un bloque solo se publica cuando reúne
//     al menos `minimoAlumnas` alumnas DISTINTAS (no votos: doce votos de la
//     misma alumna siguen siendo una persona);
//   · entre dos publicaciones seguidas, lo que cambia es siempre un bloque
//     entero de al menos ese mínimo de alumnas.
// Un voto tardío entra con la fecha en que se escribe, así que nunca altera un
// bloque ya publicado. Nunca devuelve quién votó.
//
// Puro: se prueba con `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

import { MINIMO_VALORACIONES } from '../portal-tema/valoracion.ts';

export interface VotoValoracion {
  /** Quién votó. Solo para contar alumnas distintas; nunca sale de aquí. */
  alumna: string;
  puntuacion: number;
  /** Instante en que se escribió (ISO). */
  creadoEn: string;
}

export interface AgregadoValoracion {
  /** Media de 1 a 5, sin redondear (quien la pinta decide el formato). */
  media: number;
  /** Cuántas valoraciones la sostienen. */
  total: number;
  /** Último día (YYYY-MM-DD) de los datos publicados. */
  hasta: string;
}

const fmtMes = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit' });

/** «2026-08» para un instante, en hora del estudio. */
export function mesEnMadrid(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const partes = fmtMes.formatToParts(d);
  const anio = partes.find((p) => p.type === 'year')?.value ?? '0000';
  const mes = partes.find((p) => p.type === 'month')?.value ?? '01';
  return `${anio}-${mes}`;
}

/**
 * Una valoración ya escrita solo se puede cambiar dentro de su mismo mes. Si su
 * mes ya cerró, puede estar dentro de un bloque publicado, y cambiarla movería
 * la nota con el mismo total: se vería el cambio de UNA alumna.
 */
export function puedeCambiarValoracion(creadoEn: string, ahora: Date): boolean {
  const t = Date.parse(creadoEn);
  if (Number.isNaN(t)) return false;
  return mesEnMadrid(new Date(t)) >= mesEnMadrid(ahora);
}

function ultimoDiaDe(mes: string): string {
  const [anio, m] = mes.split('-').map(Number);
  const dia = new Date(Date.UTC(anio, m, 0)).getUTCDate();
  return `${mes}-${String(dia).padStart(2, '0')}`;
}

export function agregadoPublicable(
  votos: readonly VotoValoracion[],
  ahora: Date,
  minimoAlumnas: number = MINIMO_VALORACIONES,
): AgregadoValoracion | null {
  const mesActual = mesEnMadrid(ahora);
  const porMes = new Map<string, VotoValoracion[]>();
  for (const v of votos) {
    if (!v.alumna || !Number.isFinite(v.puntuacion) || v.puntuacion < 1 || v.puntuacion > 5) continue;
    const t = Date.parse(v.creadoEn);
    if (Number.isNaN(t)) continue;
    const mes = mesEnMadrid(new Date(t));
    if (mes >= mesActual) continue;
    const lista = porMes.get(mes) ?? [];
    lista.push(v);
    porMes.set(mes, lista);
  }

  let puntos = 0;
  let total = 0;
  let hasta: string | null = null;
  let bloque = { alumnas: new Set<string>(), puntos: 0, total: 0 };
  for (const mes of [...porMes.keys()].sort()) {
    for (const v of porMes.get(mes)!) {
      bloque.alumnas.add(v.alumna);
      bloque.puntos += v.puntuacion;
      bloque.total += 1;
    }
    if (bloque.alumnas.size >= minimoAlumnas) {
      puntos += bloque.puntos;
      total += bloque.total;
      hasta = mes;
      bloque = { alumnas: new Set<string>(), puntos: 0, total: 0 };
    }
  }

  return total > 0 && hasta ? { media: puntos / total, total, hasta: ultimoDiaDe(hasta) } : null;
}
