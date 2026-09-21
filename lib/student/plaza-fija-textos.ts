// Lo que se le dice a la alumna sobre la plaza fija. Sin imports ni `@/`: lo
// leen la app de la alumna (la ficha de la clase y la hoja de «reserva hecha») y
// la vista previa de Configuración («Así lo ve tu alumna»), y tiene que ser
// EXACTAMENTE el mismo texto en los dos sitios — si la vista previa dijera otra
// cosa que la app, explicar el ajuste sería peor que no explicarlo.
//
// Solo se afirma lo que el sistema hace de verdad: el motor reserva la clase
// cada semana (`materializar_plazas_fijas`), la petición no cambia nada hasta que
// el estudio la aprueba, y la respuesta le llega en la app.

const DIAS_PLURAL = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados'];

/** «los martes», «los sábados». `diaSemana`: 0 = domingo. */
export function losDias(diaSemana: number): string {
  return `los ${DIAS_PLURAL[diaSemana] ?? ''}`.trim();
}

export const TEXTOS_PLAZA_FIJA = {
  titulo: 'Plaza fija',
  /** Lo que es, en una frase, con SU día y SU hora. */
  ofrecer: (diaSemana: number, hora: string) =>
    `¿Vienes ${losDias(diaSemana)} a las ${hora}? Con una plaza fija te reservamos esta clase cada semana, sin que tengas que volver a hacerlo.`,
  /** Lo que pasa después de pedirla. */
  quePasa: 'Tu estudio tiene que confirmarla: su respuesta te llega aquí. Hasta entonces, sigue reservando como siempre.',
  botonPedir: 'Pedir plaza fija',
  pedida: 'Ya la has pedido: tu estudio te contestará aquí. Hasta entonces, sigue reservando esta clase como siempre.',
  botonAnular: 'Anular la petición',
  /** Quien no tiene cuota que la cubra: la regla es la del servidor (`cuotaParaPlazaFija`). */
  soloConCuota: 'La plaza fija es para quien tiene una cuota activa que incluya esta clase. Con bono o clases sueltas, se reserva clase a clase.',
  /** Al terminar de reservar una clase que se repite. */
  trasReservarTitulo: '¿Vienes cada semana?',
  trasReservar: (diaSemana: number, hora: string) =>
    `Pide tu plaza fija y te reservamos esta clase ${losDias(diaSemana)} a las ${hora}. Tu estudio te lo confirma.`,
  trasReservarPedida: 'Petición enviada: tu estudio te contestará en la app.',
} as const;
