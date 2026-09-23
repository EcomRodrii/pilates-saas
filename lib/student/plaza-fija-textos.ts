// Lo que se le dice a la alumna sobre su clase fija. Sin imports ni `@/`: lo
// leen la app de la alumna (la ficha de la clase, la hoja de «reserva hecha», su
// tarjeta y «Mis clases») y la vista previa de Configuración («Así lo ve tu
// alumna»), y tiene que ser EXACTAMENTE el mismo texto en todos los sitios — si
// la vista previa dijera otra cosa que la app, explicar el ajuste sería peor que
// no explicarlo.
//
// ⚠️ Cara a la alumna se llama «clase fija»: es como la llaman ellas y los
// estudios. En el código y en el panel del estudio sigue siendo «plaza fija»
// (`plazas_fijas`): es el hueco que el motor mantiene reservado.
//
// Solo se afirma lo que el sistema hace de verdad: el motor reserva la clase
// cada semana (`materializar_plazas_fijas`, con meses de antelación), la
// petición no cambia nada hasta que el estudio la aprueba, cancelar UNA semana
// no toca la clase fija, y solo se guarda una clase para recuperar si cancela a
// tiempo y su cuota limita las clases por semana (`otorgarRecuperacionPlazaFijaSiAplica`).

const DIAS_PLURAL = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados'];

/** «los martes», «los sábados». `diaSemana`: 0 = domingo. */
export function losDias(diaSemana: number): string {
  return `los ${DIAS_PLURAL[diaSemana] ?? ''}`.trim();
}

export const TEXTOS_PLAZA_FIJA = {
  // ── Pedirla (ficha de la clase y hoja de «reserva hecha») ──
  titulo: 'Clase fija',
  /** Lo que es, en una frase, con SU día y SU hora. */
  ofrecer: (diaSemana: number, hora: string) =>
    `¿Vienes ${losDias(diaSemana)} a las ${hora}? Con una clase fija tu plaza queda reservada cada semana, sin que tengas que volver a reservarla.`,
  /** Lo que pasa después de pedirla. */
  quePasa: 'Tu estudio tiene que confirmarla: su respuesta te llega aquí. Hasta entonces, sigue reservando como siempre.',
  botonPedir: 'Pedir clase fija',
  pedida: 'Ya la has pedido: tu estudio te contestará aquí. Hasta entonces, sigue reservando esta clase como siempre.',
  botonAnular: 'Anular la petición',
  /** Quien no tiene cuota que la cubra: la regla es la del servidor (`cuotaParaPlazaFija`). */
  soloConCuota: 'La clase fija es para quien tiene una cuota activa que incluya esta clase. Con bono o clases sueltas, se reserva clase a clase.',
  /** Al terminar de reservar una clase que se repite. */
  trasReservarTitulo: '¿Vienes cada semana?',
  trasReservar: (diaSemana: number, hora: string) =>
    `Pide tu clase fija y tu plaza quedará reservada ${losDias(diaSemana)} a las ${hora}. Tu estudio te lo confirma.`,
  trasReservarPedida: 'Petición enviada: tu estudio te contestará en la app.',

  // ── Su tarjeta, cuando ya la tiene ──
  tarjetaUna: 'Tu clase fija',
  tarjetaVarias: 'Tus clases fijas',
  reservadaSola: 'Tu plaza está reservada automáticamente cada semana. No necesitas reservar esta clase.',
  enPausa: 'Está en pausa: mientras dure no se te reserva la clase. Al terminar la pausa vuelve sola.',
  proximas: 'Próximas clases',
  reservada: 'Reservada',
  noPuedo: 'No puedo asistir',
  /** Cuando aún no hay ninguna reservada (recién asignada, o el horario no llega tan lejos). */
  /** «Mis clases → Próximas» solo enseña las primeras; el resto sigue reservado. */
  masReservadas: (n: number) =>
    n === 1
      ? 'Y 1 clase más de tu clase fija, ya reservada: irá apareciendo aquí según se acerque.'
      : `Y ${n} clases más de tu clase fija, ya reservadas: irán apareciendo aquí según se acerquen.`,
  sinProximas: 'Tu próxima clase se reservará sola en cuanto la programe el estudio.',
  /** Baja, reactivarla o cambiarla: no se hace desde la app, se le escribe al estudio. */
  cambiarla: '¿Quieres cambiarla o dejarla?',
  escribir: 'Escribir al estudio',
  // ── «No puedo asistir esta semana» ──
  noPuedoTitulo: '¿No puedes asistir?',
  noPuedoSolo: (diaSemana: number) =>
    `Solo cancelas esta clase. Tu clase fija de ${losDias(diaSemana)} sigue activa y la semana que viene tu plaza vuelve a estar reservada.`,
  noPuedoATiempo: 'Si cancelas a tiempo y tu cuota limita las clases por semana, se te guarda una clase para recuperar.',
  noPuedoTarde: (horas: number) => `Quedan menos de ${horas} h: es una cancelación tardía y no se te guardará una clase para recuperar.`,
  noPuedoConfirmar: 'Sí, no puedo asistir',
  noPuedoMantener: 'Mantener mi plaza',
  // ── El calendario del mes ──
  calendarioTitulo: 'Tus días este mes',
  marcaReservada: 'Reservada',
  marcaAsistida: 'Fuiste',
  marcaNoAsistio: 'No fuiste',
  marcaNoVa: 'No vas',
  marcaPausa: 'En pausa',
  marcaSinReservar: 'Sin reservar',
  /** Un día de su horario con clase y sin reserva: no se promete nada, se dice a quién preguntar. */
  sinReservarAyuda: 'Si un día sale sin reservar, pregúntale a tu estudio: puede que la clase esté llena o que tu cuota no la cubra.',
  cambiosTitulo: '¿Un día no puedes venir?',
  cambiosCuerpo: 'Cancela solo ese día desde «No puedo asistir» o desde «Mis clases». Tu clase fija sigue igual.',
  cambiosListaEspera: 'Tu sitio no se queda vacío: pasa a quien esté en la lista de espera.',
} as const;
