// Lo que se le dice a la alumna sobre las clases fijas del estudio. Sin imports ni
// `@/`. Solo se afirma lo que el sistema hace de verdad: pedirla no la reserva —el
// estudio la aprueba a mano—, las plazas se reservan solas cada semana mientras su
// cuota siga activa, y no se garantiza un sitio si la clase se llena ese día (el
// motor avisa, no promete).

export const TEXTOS_CLASES_FIJAS = {
  titulo: 'Clases fijas',
  sub: 'Tu sitio guardado cada semana, sin tener que reservar.',
  entradaTitulo: 'Clases fijas',
  entradaCuerpo: 'Tu sitio reservado cada semana, sin volver a reservar. Elige cuánto tiempo la quieres.',
  entradaBoton: 'Ver las clases fijas',
  vacio: 'Tu estudio todavía no tiene clases fijas.',
  /** Lo que es y lo que pasa después, en dos frases. */
  comoFunciona: 'Pides la clase fija y tu estudio la revisa: su respuesta te llega aquí. Cuando te la da, tu plaza queda reservada cada semana mientras tu cuota siga activa.',
  incluye: 'Incluye',
  cuantoTiempo: '¿Cuánto tiempo la quieres?',
  hastaEl: (fecha: string) => `Hasta el ${fecha}`,
  plazasLibres: (n: number) => (n === 1 ? 'Queda 1 plaza' : `Quedan ${n} plazas`),
  hayClasesHasta: (fecha: string) => `Hay clases programadas hasta el ${fecha}`,
  botonPedir: 'Pedir clase fija',
  pedida: (hasta: string) => `Ya la has pedido (hasta el ${hasta}): tu estudio te contestará aquí.`,
  laTiene: 'Ya tienes esta clase fija.',
  parcial: 'Ya tienes una parte de esta clase fija: al pedirla se te da el resto.',
  completa: 'Esta clase fija está completa.',
  sinClases: 'Ahora no hay clases programadas en este horario.',
  sinCuota: 'La clase fija es para quien tiene una cuota activa que incluya estas clases. Con bono, se reserva clase a clase.',
  botonAnular: 'Anular la petición',
  enviada: 'Petición enviada: tu estudio te contestará en la app.',
  anulada: 'Petición anulada.',
} as const;
