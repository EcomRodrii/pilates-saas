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
import { debeDevolverBono } from '../booking-logic.ts';
import { diaEnEstudio } from '../calendario-hora-estudio.ts';
import { etiquetaDiaClave } from '../reserva-calendario-logic.ts';
import { horaEstudio } from '../utils.ts';

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
  /** Tiene una plaza ofrecida que aún puede aceptar (`ofertaVigente`). */
  conOferta = false,
): EstadoReservaSocia {
  const pasada = momento === 'pasada';
  // Una plaza esperándola pide que haga algo: «Lista de espera · 2ª» ya no es
  // verdad —la plaza es suya si la acepta— y se leería como «aún no».
  if (estado === 'LISTA_ESPERA' && conOferta && !pasada) return { texto: 'Plaza para ti', tono: 'pendiente' };
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

/**
 * ¿Tiene una plaza ofrecida que aún puede aceptar? (Fase 2b: `ofertaExpiraEn`
 * en una reserva que sigue en LISTA_ESPERA.) Pasada la hora ya no: el cron
 * tarda hasta 5 minutos en retirarla, y en ese rato ofrecer un botón que el
 * servidor va a rechazar es peor que no ofrecerlo.
 */
export function ofertaVigente(estado: EstadoReserva, ofertaExpiraEn: string | null | undefined, ahoraMs: number): boolean {
  return estado === 'LISTA_ESPERA' && !!ofertaExpiraEn && new Date(ofertaExpiraEn).getTime() > ahoraMs;
}

/**
 * Hasta cuándo puede aceptarla, en la hora del estudio: «hasta las 11:40»,
 * «hasta mañana a las 09:00», «hasta el mié, 12 ago a las 09:00».
 * `hoy`: 'YYYY-MM-DD' del estudio (`hoyEnEstudio()`).
 */
export function limiteOferta(expira: string, hoy: string): string {
  const dia = etiquetaDiaClave(diaEnEstudio(expira), hoy);
  const hora = horaEstudio(expira);
  if (dia === 'Hoy') return `hasta las ${hora}`;
  if (dia === 'Mañana') return `hasta mañana a las ${hora}`;
  return `hasta el ${dia.charAt(0).toLowerCase()}${dia.slice(1)} a las ${hora}`;
}

/**
 * ¿Cancelar ahora le cuesta la sesión del bono? La misma regla que aplica el
 * servidor al cancelar (`debeDevolverBono`, lib/booking-logic.ts): solo una
 * reserva CONFIRMADA, dentro de la ventana, y si el estudio no devuelve el
 * bono en las tardías. La lista de espera nunca gastó sesión.
 */
export function pierdeBonoAlCancelar(
  estado: EstadoReserva, inicio: string, ahora: Date, ventanaHoras: number, devuelveEnTardia: boolean,
): boolean {
  return estado === 'CONFIRMADA' && !debeDevolverBono(inicio, ahora, ventanaHoras, devuelveEnTardia);
}

/**
 * Lo que pregunta la confirmación de cancelar, en la página y en el widget
 * nativo con las mismas palabras. Sin ventana configurada (0 h) no se promete
 * nada: antes salía «Es gratis hasta 0h antes».
 */
export function textoConfirmarCancelar(o: { espera: boolean; pierdeBono: boolean; ventana: number }): string {
  if (o.espera) return '¿Quieres salir de la lista de espera de esta clase?';
  if (o.pierdeBono) return `¿Quieres cancelar esta reserva? Con menos de ${o.ventana}h de antelación no se te devolverá la sesión del bono.`;
  if (o.ventana > 0) return `¿Quieres cancelar esta reserva? Es gratis hasta ${o.ventana}h antes.`;
  return '¿Quieres cancelar esta reserva?';
}
