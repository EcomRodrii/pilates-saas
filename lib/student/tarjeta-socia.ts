// La tarjeta de alumna de Perfil (P14, 5-oct-2026): hasta tres cifras que valen la pena, nunca un cero. Pura, imports
// relativos con `.ts` (tarjeta-socia.test.ts).

import { loQueTengo } from './lo-que-tengo.ts';
import { fechaCorta } from './formato.ts';
import type { Bono, Clase, Reserva } from './tipos.ts';

export interface CifraSocia {
  /** La cifra («3») o la palabra («Cuota»). */
  valor: string;
  /** Lo que la explica: «clases contigo», «te quedan · hasta 12 nov». */
  texto: string;
  /** A dónde lleva. Sin destino, no es un enlace (las clases asistidas: el Historial aún no las enseña todas). */
  destino: string | null;
  /** El nombre accesible del enlace («5 te quedan, hasta 12 nov»). */
  etiqueta: string;
}

export type SinCifras =
  | { tipo: 'proxima'; texto: string; destino: string }
  | { tipo: 'primera'; texto: string; accion: string; destino: string }
  | { tipo: 'reservar'; texto: string; destino: string };

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** «12 nov», o «12 nov 2027» si no es de este año. */
function diaMes(iso: string, hoy: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  const base = `${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`;
  return iso.slice(0, 4) === hoy.slice(0, 4) ? base : `${base} ${iso.slice(0, 4)}`;
}

export function cifrasDeLaSocia({
  reservas, clases, bonos, recuperacionesDisponibles, puntos, nombreCreditos, recienLlegada, hoy, ahoraMs, href,
}: {
  /** Todo su historial (proyectado): las asistidas cuentan como «clases contigo». */
  reservas: Pick<Reserva, 'id' | 'claseId' | 'estado'>[];
  clases: Pick<Clase, 'id' | 'fecha' | 'hora' | 'fin'>[];
  bonos: Bono[];
  recuperacionesDisponibles: number;
  /** Su saldo de créditos, solo si el estudio usa gamificación (`null` si no). */
  puntos: number | null;
  nombreCreditos: string;
  /** La MISMA regla que Inicio (`esRecienLlegada`). */
  recienLlegada: boolean;
  hoy: string;
  ahoraMs: number | null;
  href: (ruta: string) => string;
}): { cifras: CifraSocia[]; sinCifras: SinCifras | null } {
  const cifras: CifraSocia[] = [];

  // 1. Las clases a las que ha venido.
  const asistidas = reservas.filter((r) => r.estado === 'asistida').length;
  if (asistidas > 0) {
    const texto = asistidas === 1 ? 'clase contigo' : 'clases contigo';
    cifras.push({ valor: String(asistidas), texto, destino: null, etiqueta: `${asistidas} ${texto}` });
  }

  // 2. Lo que tiene: la cuota delante (la mensual gana, como el servidor); si no, la suma de sus bonos con sesiones.
  // Lo que tiene sale del MISMO selector que Inicio y Mi plan (`loQueTengo`): la cuota que manda y lo que le queda en sus
  // bonos con `saldoBono`. Antes esta tarjeta lo decidía a su manera.
  const t = loQueTengo({ bonos });
  if (t.cuota) {
    const tope = t.cuota.limiteSemanal && t.cuota.limiteSemanal > 0 ? `${t.cuota.limiteSemanal} ${t.cuota.limiteSemanal === 1 ? 'clase' : 'clases'} a la semana` : t.cuota.nombre;
    cifras.push({ valor: 'Cuota', texto: tope, destino: href('/bonos'), etiqueta: `Cuota, ${tope}` });
  } else if (t.sesionesEnBonos > 0 && t.bono) {
    const quedan = t.sesionesEnBonos;
    const verbo = quedan === 1 ? 'te queda' : 'te quedan';
    const detalle = t.bonosConSesiones > 1
      ? `en ${t.bonosConSesiones} bonos`
      : t.bono.expiraEn ? `hasta ${diaMes(t.bono.expiraEn, hoy)}` : '';
    const texto = detalle ? `${verbo} · ${detalle}` : verbo;
    cifras.push({ valor: String(quedan), texto, destino: href('/bonos'), etiqueta: `${quedan} ${verbo}${detalle ? `, ${detalle}` : ''}` });
  }

  if (recuperacionesDisponibles > 0) {
    const texto = recuperacionesDisponibles === 1 ? 'recuperación' : 'recuperaciones';
    cifras.push({
      valor: String(recuperacionesDisponibles), texto,
      // Las recuperaciones viven en Mi plan (decisión del fundador, 6-oct-2026): la cifra lleva SIEMPRE allí.
      destino: href('/bonos'),
      etiqueta: `${recuperacionesDisponibles} ${texto}`,
    });
  }

  // 4. Sus créditos, solo si queda hueco y tiene alguno.
  if (cifras.length < 3 && puntos != null && puntos > 0) {
    cifras.push({ valor: String(puntos), texto: nombreCreditos, destino: href('/logros'), etiqueta: `${puntos} ${nombreCreditos}` });
  }

  if (cifras.length > 0) return { cifras: cifras.slice(0, 3), sinCifras: null };

  // Sin ninguna cifra, UNA frase que dice la verdad.
  const fechaDe = new Map(clases.map((c) => [c.id, c]));
  const proxima = reservas
    .filter((r) => r.estado === 'confirmada')
    .map((r) => ({ r, c: fechaDe.get(r.claseId) }))
    .filter((x): x is { r: typeof x.r; c: NonNullable<typeof x.c> } => Boolean(x.c))
    .filter((x) => ahoraMs === null ? x.c.fecha >= hoy : Date.parse(x.c.fin) > ahoraMs)
    .sort((a, b) => (a.c.fecha + a.c.hora).localeCompare(b.c.fecha + b.c.hora))[0];
  if (proxima) {
    return { cifras, sinCifras: { tipo: 'proxima', texto: `Tu próxima clase: ${fechaCorta(proxima.c.fecha)} · ${proxima.c.hora}`, destino: href(`/mis-reservas/${proxima.r.id}`) } };
  }
  if (recienLlegada) {
    return { cifras, sinCifras: { tipo: 'primera', texto: 'Aún no has venido a ninguna clase.', accion: 'Elegir mi primera clase', destino: href('/reservar') } };
  }
  return { cifras, sinCifras: { tipo: 'reservar', texto: 'Reserva tu próxima clase', destino: href('/reservar') } };
}
