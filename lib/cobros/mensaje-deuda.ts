// ─────────────────────────────────────────────────────────────────────────────
// El WhatsApp de la ficha de «Quién me debe»: el mensaje ya escrito, con lo que
// debe y por qué, para que recepción solo tenga que enviarlo.
//
// No se le ofrece «un enlace para pagar»: la app de la alumna no tiene botón de
// pagar una deuda, y prometerlo en el mensaje sería mentir. Los conceptos van
// enteros (no se parten por « — »: «Mensual ilimitado — octubre» ya se entiende).
//
// Puro: se prueba con `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

import { formatEuro } from '../utils.ts';

export function mensajeDeudaWhatsApp(p: {
  nombre: string;
  estudio: string;
  recibos: readonly { concepto: string; importe: number }[];
}): string {
  const pila = p.nombre.trim().split(/\s+/)[0] || p.nombre.trim();
  const total = p.recibos.reduce((t, r) => t + r.importe, 0);
  const que = p.recibos.length === 1
    ? p.recibos[0].concepto
    : p.recibos.length === 2
      ? `${p.recibos[0].concepto} y ${p.recibos[1].concepto}`
      : `${p.recibos.length} recibos`;
  const saludo = pila ? `Hola ${pila}` : 'Hola';
  return `${saludo}, te escribo de ${p.estudio}: tienes pendiente ${formatEuro(total)} (${que}). ¿Te viene bien pasarte por recepción para pagarlo?`;
}
