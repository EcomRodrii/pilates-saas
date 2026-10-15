// ¿Empieza gratis un estudio que se da de alta AHORA? (Founding Studio gratis,
// decisión del fundador del 15-oct-2026; reglas en lib/billing/plan-gratis.ts.)
//
// El alta va antes de que exista el estudio, así que el interruptor
// `FOUNDING_GRATIS` solo la cambia encendido para todos (`on`): con
// `estudios:<id>` (el fundador lo prueba en unos pocos), un estudio nuevo sigue
// empezando con la prueba de siempre, y el alta y su correo tienen que decir eso.
//
// Se lee en el servidor: la variable no llega al navegador. /crear-estudio se lo
// pasa a la pantalla y el correo de alta abandonada lo pregunta al montarse.
//
// Puro, sin `@/`: se prueba con `node --test`.

import { encendidaPara } from '../interruptor-por-estudio.ts';

export function foundingGratisEnAltas(valor: string | undefined = process.env.FOUNDING_GRATIS): boolean {
  return encendidaPara(valor, '');
}
