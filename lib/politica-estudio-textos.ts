// ─────────────────────────────────────────────────────────────────────────────
// Lo que hace el producto con los valores que el estudio tiene GUARDADOS (o
// con los que está eligiendo en un cajón), dicho en frases.
//
// Tres decisiones que afectan a cada alumna —recuperar la sesión, la plaza que
// se libera, el aviso cuando cambia la instructora— vivían como interruptores
// sueltos, uno de ellos fuera de Configuración. Los 12 estudios de producción
// siguen con los valores de fábrica sin haberlos elegido: esto no los cambia,
// los explica.
//
// Hasta el 15-sep iban en una lista («Cuando algo cambia, Tentare…»); desde las
// filas con cajón (v2), cada frase es la línea de consecuencia del cajón de su
// regla (`tarjeta`), así que tiene que leerse SOLA y caber en una línea (≤ 120).
//
// Regla: ninguna frase sin un valor detrás. Cada una declara en `respaldo` qué
// campos la deciden, y el test comprueba que cambiar cualquier otro campo no la
// mueve. Lo que dice cada frase sale del código, no de lo que «debería» pasar:
//
//  · Recuperar la sesión al cancelar → `cancelar_reserva_plaza` (migr
//    20260829234415): tardía = ventana > 0 y quedan menos de `ventana` horas;
//    `devolver_bono = cancelacion_devolver_bono_tardia OR NOT tardía`. La
//    ventana del tipo de clase, si la tiene, pisa la del estudio.
//  · Clase cancelada entera → `devolverBonosPorCancelacionClase` y sus gemelos
//    del panel leen `cancelacion_clase_devuelve_bono`. ⚠️ Desde #1342 lo leen
//    TAMBIÉN el corte por mínimo de asistentes y el cierre del centro (los dos
//    pasan por `cancelarSesionPorMinimoNoAlcanzado`): no devuelven «siempre».
//  · Plaza liberada → `promocionar_siguiente_espera`: plazo ≤ 0 confirma al
//    momento; plazo > 0 abre una oferta y, si caduca, pasa a la siguiente.
//  · Aviso a las alumnas → `avisarAlumnas` (lib/sustituciones/avisos.ts), que
//    solo llaman Sustituciones y la respuesta de la sustituta: email + aviso en
//    su app (in-app y push), y nada si `studios.avisar_alumnas` está apagado.
// ─────────────────────────────────────────────────────────────────────────────

export interface PoliticaEstudio {
  cancelacionVentanaHoras: number;
  cancelacionDevolverBonoTardia: boolean;
  cancelacionClaseDevuelveBono: boolean;
  permiteListaEspera: boolean;
  listaEsperaPlazoAceptacionMinutos: number;
  /** null = no se ha podido leer: no se afirma nada sobre el aviso. */
  avisarAlumnas: boolean | null;
}

/**
 * La fila de «Cómo reservan mis alumnas» en cuyo cajón se lee la frase (sus ids
 * en lib/configuracion/secciones.ts). Sin importarlo: este fichero es puro.
 */
export type FilaPolitica =
  | 'cancelar-y-recuperar'
  | 'si-se-cancela-una-clase'
  | 'lista-de-espera'
  | 'ajuste-avisar-alumnas';

export interface FrasePolitica {
  id: 'cancela-a-tiempo' | 'cancela-tarde' | 'estudio-cancela' | 'plaza-liberada' | 'cambia-la-clase';
  texto: string;
  respaldo: (keyof PoliticaEstudio)[];
  tarjeta: FilaPolitica;
}

function duracion(minutos: number): string {
  return minutos >= 60 && minutos % 60 === 0 ? `${minutos / 60} h` : `${minutos} min`;
}

export function frasesPoliticaEstudio(p: PoliticaEstudio): FrasePolitica[] {
  const frases: FrasePolitica[] = [];
  const ventana = p.cancelacionVentanaHoras > 0 ? p.cancelacionVentanaHoras : 0;

  if (ventana > 0) {
    frases.push({
      id: 'cancela-a-tiempo',
      texto: `Si cancela con más de ${ventana} h de antelación, recupera la sesión.`,
      respaldo: ['cancelacionVentanaHoras'],
      tarjeta: 'cancelar-y-recuperar',
    });
    frases.push({
      id: 'cancela-tarde',
      texto: p.cancelacionDevolverBonoTardia
        ? `Si cancela con menos de ${ventana} h, también recupera la sesión.`
        : `Si cancela con menos de ${ventana} h, no recupera la sesión.`,
      respaldo: ['cancelacionVentanaHoras', 'cancelacionDevolverBonoTardia'],
      tarjeta: 'cancelar-y-recuperar',
    });
  } else {
    // Sin ventana no hay cancelación tardía: «devolver en tardías» no decide nada.
    frases.push({
      id: 'cancela-a-tiempo',
      texto: 'Recupera la sesión cancele cuando cancele: no hay plazo de cancelación.',
      respaldo: ['cancelacionVentanaHoras'],
      tarjeta: 'cancelar-y-recuperar',
    });
  }

  frases.push({
    id: 'estudio-cancela',
    texto: p.cancelacionClaseDevuelveBono
      ? 'Si se cancela una clase entera —la cancelas tú, por el mínimo o por un cierre—, devuelve la sesión.'
      : 'Si se cancela una clase entera —la cancelas tú, por el mínimo o por un cierre—, no devuelve la sesión.',
    respaldo: ['cancelacionClaseDevuelveBono'],
    tarjeta: 'si-se-cancela-una-clase',
  });

  if (!p.permiteListaEspera) {
    frases.push({
      id: 'plaza-liberada',
      texto: 'Con la clase llena, nadie más puede apuntarse a la lista de espera.',
      respaldo: ['permiteListaEspera'],
      tarjeta: 'lista-de-espera',
    });
  } else {
    const plazo = p.listaEsperaPlazoAceptacionMinutos > 0 ? p.listaEsperaPlazoAceptacionMinutos : 0;
    frases.push({
      id: 'plaza-liberada',
      texto: plazo > 0
        ? `Si se libera una plaza, la primera de la lista tiene ${duracion(plazo)} para aceptarla; si no, pasa a la siguiente.`
        : 'Si se libera una plaza, se la da al momento a la primera de la lista de espera.',
      respaldo: ['permiteListaEspera', 'listaEsperaPlazoAceptacionMinutos'],
      tarjeta: 'lista-de-espera',
    });
  }

  if (p.avisarAlumnas !== null) {
    frases.push({
      id: 'cambia-la-clase',
      texto: p.avisarAlumnas
        ? 'Si una clase cambia de instructora, se mueve o se cancela en Sustituciones, avisa a sus alumnas por email y en su app.'
        : 'Si una clase cambia de instructora, se mueve o se cancela en Sustituciones, no avisa a sus alumnas.',
      respaldo: ['avisarAlumnas'],
      tarjeta: 'ajuste-avisar-alumnas',
    });
  }

  return frases;
}
