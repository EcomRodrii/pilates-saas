// Qué dice cada reserva de «Mis reservas» en /reservar (F5 del rediseño
// «/reservar = estilo de la app de la alumna», 29-sep-2026).
//
// La tarjeta es la de «Mis clases» de la app: arriba el cuándo en el color de la
// marca («Hoy · 10:00», con `cuandoCorto` de ./ficha-clase.ts) y el estado a la
// derecha; debajo la clase y «con Marta Vidal · Sala Reformer». Aquí vive lo que
// esa tarjeta DICE, fuera del JSX y con su test, por dos motivos:
//
//   · Lo pintan dos sitios: la página (app/reservar/[slug]/page.tsx, en la hoja
//     de la cabecera y en `?tab=misreservas`) y la lista del widget nativo
//     (components/cuenta-widget/mis-reservas-lista.tsx). Cada una tenía su propio
//     mapa de estados, y ya no coincidían: «Confirmada» en una, «En espera» en
//     la otra, y la página ni siquiera distinguía una reserva pendiente de
//     aprobar de una confirmada.
//   · ⚠️ La página decía «Cancelada» de TODA reserva pasada que no fuera
//     «Asistida» ni de lista de espera. Pero a «Pasadas» nunca llega una
//     cancelada (`misReservas` las quita): llegan las CONFIRMADA de clases que
//     ya se dieron sin que el estudio pasara lista. A una socia que reservó y,
//     con toda probabilidad, fue, se le decía que había cancelado. Es el mismo
//     fallo que ya se corrigió en la app (lib/student/etiqueta-historial.ts), y
//     se resuelve igual: lo que dice el registro, y nada más.
//
// Relativo y con `.ts`: `node --test` no resuelve el alias `@/`.

import type { EstadoReserva } from '../types.ts';

/** Dónde está la clase respecto a ahora. Solo para PINTAR: quién puede cancelar lo sigue decidiendo quien llama. */
export type MomentoReserva = 'proxima' | 'en-curso' | 'pasada';

/**
 * Pasada en cuanto termina (`fin < ahora`, el mismo corte que ya usa la página
 * para partir Próximas y Pasadas) y en curso desde que empieza.
 */
export function momentoReserva(inicio: string, fin: string, ahoraMs: number): MomentoReserva {
  if (new Date(fin).getTime() < ahoraMs) return 'pasada';
  if (new Date(inicio).getTime() <= ahoraMs) return 'en-curso';
  return 'proxima';
}

/**
 * El color de la insignia, por lo que significa y no por el estado crudo: dos
 * estados distintos pueden pedir el mismo tono (Asistida y Reservada, verde), y
 * el mismo estado dos tonos según el momento (una reserva confirmada de una
 * clase que ya pasó es historial, no una buena noticia).
 */
export type TonoEstadoReserva = 'reservada' | 'espera' | 'pendiente' | 'asistida' | 'curso' | 'neutro';

export interface EstadoReservaSocia {
  texto: string;
  tono: TonoEstadoReserva;
}

/**
 * Lo que dice la insignia de una reserva.
 *
 * «Reservada» y no «Confirmada»: es la palabra de la app («Reservada ✓») y de la
 * ficha de la clase de la F4 (`disponibilidadFicha`), y la misma reserva no
 * puede llamarse de dos maneras según la pantalla desde la que se mire.
 *
 * Un `switch` sin `default` sobre el tipo: si la base gana un séptimo estado,
 * TypeScript obliga a darle texto aquí en vez de dejarlo caer en la rama de
 * otro, que es exactamente como apareció el «Cancelada» de arriba.
 */
export function estadoReservaSocia(
  estado: EstadoReserva,
  momento: MomentoReserva,
  posicionEspera?: number | null,
): EstadoReservaSocia {
  const pasada = momento === 'pasada';
  switch (estado) {
    case 'CONFIRMADA':
      if (momento === 'en-curso') return { texto: 'En curso', tono: 'curso' };
      // Pasada: lo que dice el registro. «Asistida» sería inventarlo —nadie
      // pasó lista— y «Cancelada» es falso.
      return { texto: 'Reservada', tono: pasada ? 'neutro' : 'reservada' };
    case 'LISTA_ESPERA':
      // La clase pasó y no llegó a entrar: la posición ya no significa nada.
      if (pasada) return { texto: 'Lista de espera', tono: 'neutro' };
      return { texto: posicionEspera ? `Lista de espera · ${posicionEspera}ª` : 'Lista de espera', tono: 'espera' };
    case 'PENDIENTE_APROBACION':
      // Fase 2a: el estudio aún no la ha aprobado. Antes salía «Confirmada».
      return pasada ? { texto: 'Sin confirmar', tono: 'neutro' } : { texto: 'Pendiente de confirmar', tono: 'pendiente' };
    case 'ASISTIDA':
      return { texto: 'Asistida', tono: 'asistida' };
    case 'NO_ASISTIO':
      // La misma palabra que la app y el widget nativo.
      return { texto: 'No asistió', tono: 'neutro' };
    case 'CANCELADA':
      return { texto: 'Cancelada', tono: 'neutro' };
  }
}

/**
 * «con Marta Vidal · Sala Reformer». Sin ninguno de los dos, `null`: un «con ·»
 * suelto se lee como algo que no cargó.
 */
export function conQuienYDonde(instructora?: string | null, sala?: string | null): string | null {
  const quien = instructora?.trim() ? `con ${instructora.trim()}` : '';
  const donde = sala?.trim() ?? '';
  return [quien, donde].filter(Boolean).join(' · ') || null;
}
