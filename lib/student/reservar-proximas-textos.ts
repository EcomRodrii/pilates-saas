// Lo que se le dice a la alumna en «Reservar las próximas clases» (con bono). Sin imports con `@/`: lo leen la pantalla y los
// tests del runner de Node.
//
// ⚠️ Solo se afirma lo que el sistema hace de verdad: cada clase es una reserva NORMAL (se cancela como cualquier otra, con la
// ventana de SU estudio), el bono lo descuenta la base de datos al reservar, no se renueva sola, y si se acaba el bono se
// PARA. Nada de «te quedarán…» que dependa de un reloj.

import type { ResultadoOcurrencia } from '../reservas/proximas-reglas.ts';

export const sesion = (n: number) => (n === 1 ? '1 sesión' : `${n} sesiones`);
export const clase = (n: number) => (n === 1 ? '1 clase' : `${n} clases`);

/** El texto corto de cada clase del lote, con el motivo concreto si lo hay. */
export function etiquetaOcurrencia(o: { resultado: ResultadoOcurrencia; codigo?: string }): string {
  switch (o.resultado) {
    case 'SE_RESERVARA': return 'Se reservará';
    case 'RESERVADA': return 'Reservada';
    case 'YA_RESERVADA': return 'Ya la tenías reservada';
    case 'COMPLETA': return 'Clase completa';
    case 'CONFLICTO': return 'Ya tienes otra clase a esa hora';
    case 'CERRADA': return 'No hay clase ese día';
    case 'EN_ESPERA': return 'En lista de espera';
    case 'NO_INTENTADA': return 'Sin intentar';
    case 'FUERA_DE_VENTANA': return o.codigo === 'fuera-ventana-maxima' ? 'Aún no se puede reservar' : 'Ya no da tiempo a reservarla';
    case 'SUPERA_TOPE':
      return o.codigo === 'max-simultaneas' ? 'Tienes el máximo de reservas a la vez'
        : o.codigo === 'max-por-dia' ? 'Ya tienes clase ese día'
        : 'Pasarías de tu máximo semanal';
    case 'SIN_DERECHO':
      return o.codigo === 'impago' ? 'Tienes un pago pendiente'
        : o.codigo === 'necesita-autorizacion' ? 'Necesita el acceso del estudio'
        : o.codigo === 'apertura-suave' || o.codigo === 'faltan-preguntas' ? 'Aún no puedes reservarla'
        : 'Sin sesiones en tu bono';
    case 'ERROR': return 'No se ha podido';
  }
}

export interface ResumenPrevio {
  reservadas: number; descontadas: number;
  bono: { plan: string; saldoDespues: number } | null;
}

/** ANTES de confirmar: cuántas clases, cuántas sesiones se descontarán y cuántas le quedarán. */
export function resumenPrevio(r: ResumenPrevio): string {
  if (r.reservadas === 0) return 'Ahora mismo no se puede reservar ninguna de estas clases.';
  const descuento = r.descontadas > 0 && r.bono
    ? ` y se descontarán ${sesion(r.descontadas)} de tu «${r.bono.plan}»: te quedarán ${r.bono.saldoDespues}`
    : '';
  return `Se reservarán ${clase(r.reservadas)}${descuento}.`;
}

export const NO_SE_RENUEVA = 'No se renueva sola: cuando se acaben, se acabó.';

/** La ventana REAL de su estudio, sin prometer devolución sin condiciones. */
export const cancelacion = (horas: number) =>
  `Cada clase se cancela como cualquier otra: gratis hasta ${horas} h antes (se te devuelve la sesión).`;

export interface ResumenFinal {
  reservadas: number; pedidas: number; descontadas: number; saldoDespues: number | null;
  paro: { motivo: ResultadoOcurrencia } | null;
}

/** DESPUÉS: lo que ha pasado de verdad, con las cifras del servidor. */
export function resumenFinal(r: ResumenFinal): string {
  const partes = [`Reservadas ${r.reservadas} de ${r.pedidas}`];
  if (r.descontadas > 0) {
    partes.push(`se ${r.descontadas === 1 ? 'ha descontado' : 'han descontado'} ${sesion(r.descontadas)} de tu bono${r.saldoDespues !== null ? `; te quedan ${r.saldoDespues}` : ''}`);
  }
  if (r.paro?.motivo === 'SIN_DERECHO') partes.push('tu bono se ha quedado sin sesiones: no se reservaron las últimas');
  else if (r.paro?.motivo === 'FUERA_DE_VENTANA') partes.push('las últimas aún no se pueden reservar');
  else if (r.paro?.motivo === 'SUPERA_TOPE') partes.push('has llegado a tu máximo de reservas: no se reservaron las últimas');
  else if (r.paro) partes.push('se ha parado antes de acabar');
  return `${partes.join(' · ')}.`;
}
