// Qué dice cada fila del historial de «Mis clases».
//
// ⚠️ Esto era un ternario de dos ramas con un `else` que decía «Cancelada»:
//
//   asistida ? 'Asistida' : no-asistida ? 'No asistió' : 'Cancelada'
//
// y al historial no solo llegan las canceladas. Llega TODO lo que ya no está
// activo O cuya clase ya pasó (`mis-reservas/page.tsx`), y eso incluye dos
// casos que no se cancelaron nunca:
//
//   · una reserva CONFIRMADA de una clase que ya se dio y en la que el estudio
//     no pasó lista. La propia pantalla documenta que en producción las hay
//     «de meses atrás que nadie marcó como asistida ni como ausencia». A esa
//     socia se le decía que había cancelado una clase que reservó y, con toda
//     probabilidad, dio.
//   · una reserva en LISTA DE ESPERA de una clase que ya pasó sin que entrara.
//
// «Cancelada» no es un detalle de texto en esta app: es la palabra que en
// Pagos y en los avisos va pegada a «sesión devuelta» o «no se devuelve». Leerla
// sobre algo que no canceló le hace preguntarse por un dinero que nadie tocó.
//
// Sin imports de `@/`: vive aquí para poder probar las cinco ramas con
// `node --test`, que no resuelve el alias.

import type { EstadoReserva } from './tipos.ts';

export interface EtiquetaHistorial {
  texto: string;
  tono: 'ok' | 'few' | 'neutral' | 'wait';
}

const ETIQUETAS: Record<EstadoReserva, EtiquetaHistorial> = {
  asistida: { texto: 'Asistida', tono: 'ok' },
  'no-asistida': { texto: 'No asistió', tono: 'few' },
  cancelada: { texto: 'Cancelada', tono: 'neutral' },
  // Lo que dice el registro, y nada más: estaba reservada. «Asistida» sería
  // inventarlo —nadie lo marcó— y «Cancelada» es falso.
  confirmada: { texto: 'Reservada', tono: 'neutral' },
  // La clase pasó y no llegó a entrar.
  'en-espera': { texto: 'Lista de espera', tono: 'wait' },
};

/**
 * Un `Record` sobre el tipo y no un `switch` con `default`: si el backend gana
 * un sexto estado, TypeScript obliga a darle etiqueta aquí en vez de dejarlo
 * caer en silencio en la rama de otro — que es exactamente cómo apareció este
 * fallo.
 */
export function etiquetaHistorial(estado: EstadoReserva): EtiquetaHistorial {
  return ETIQUETAS[estado];
}
