// Lo que se le dice a la alumna sobre su clase fija. Sin imports ni `@/`: lo
// leen la app de la alumna (la ficha de la clase fija, «Mis clases → Fijas» y la
// tarjeta de Inicio) y la vista previa de Configuración («Así lo ve tu
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
  // ── Pedirla (la ficha de la clase fija, `/clases-fijas/[sesionId]`) ──
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

  // ── Cuánto tiempo la quiere (la ficha de la clase fija): una duración cerrada, y la fecha exacta que resulta ──
  cuantoTiempo: '¿Cuánto tiempo la quieres?',
  hastaEl: (fecha: string) => `Hasta el ${fecha}`,
  /** La etiqueta corta del botón (cabe en la misma fila que las demás) y lo que se dice debajo al elegirla. */
  sinFecha: 'Sin fin',
  sinFechaDetalle: 'Sin fecha de fin',

  // ── «Repetir cada semana»: el enlace de la ficha de una clase normal. Solo LLEVA a la ficha de la clase fija. ──
  repetirTitulo: 'Repetir cada semana',
  repetirPuede: (diaSemana: number, hora: string) => {
    const dias = losDias(diaSemana);
    return `${dias.charAt(0).toUpperCase()}${dias.slice(1)} a las ${hora}, sin volver a reservar`;
  },
  repetirPedida: 'Ya la has pedido: tu estudio te contestará',
  repetirTiene: 'Ya es tu clase fija ✓',
  repetirSoloConCuota: 'Es para quien tiene una cuota activa que incluya esta clase',

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
  // ── Dejarla (ella, con confirmación) ──
  dejarBoton: 'Dejar mi clase fija',
  dejarTitulo: '¿Dejar tu clase fija?',
  dejarConfirmar: 'Sí, dejarla',
  dejarMantener: 'Mantenerla',
  dejarCancela: (horas: number) =>
    `Se cancelan las clases que tienes reservadas con ella, sin penalización y sin clase para recuperar, salvo las que quedan a menos de ${horas} h: esas las mantienes.`,
  dejarVarios: 'Es una clase fija de varios días: los dejas todos.',
  dejarVuelve: 'Si cambias de idea, podrás volver a pedirla desde su ficha (según el sitio que haya).',
  /** Lo que ha pasado de verdad, con las cifras del servidor. */
  dejada: (r: { plazas: number; canceladas: number; mantenidas: number; sinDejar: number }) => {
    const partes = [r.plazas > 1 ? 'Has dejado tus clases fijas' : 'Has dejado tu clase fija'];
    if (r.canceladas > 0) partes.push(r.canceladas === 1 ? 'se ha cancelado 1 clase reservada' : `se han cancelado ${r.canceladas} clases reservadas`);
    if (r.mantenidas > 0) partes.push(r.mantenidas === 1 ? 'mantienes 1 clase, que ya está dentro del plazo de cancelación' : `mantienes ${r.mantenidas} clases, que ya están dentro del plazo de cancelación`);
    if (r.sinDejar > 0) partes.push('alguna no se ha podido dejar: habla con tu estudio');
    return `${partes.join(' · ')}.`;
  },
  /** Sin botón de dejarla (el estudio lo lleva en recepción), se sigue hablando con él. */
  cambiarlaDeDiaHora: '¿Quieres cambiarla de día u hora?',

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
  cambiosCuerpo: 'Cancela solo ese día con «No puedo asistir», aquí o en «Próximas». Tu clase fija sigue igual.',
  cambiosListaEspera: 'Tu sitio no se queda vacío: pasa a quien esté en la lista de espera.',
} as const;
