// ─────────────────────────────────────────────────────────────────────────────
// «Cuando algo cambia, Tentare…»: lo que hace el producto con los valores que
// el estudio tiene GUARDADOS, dicho en frases.
//
// Tres decisiones que afectan a cada alumna —recuperar la sesión, la plaza que
// se libera, el aviso cuando cambia la instructora— vivían como interruptores
// sueltos, uno de ellos fuera de Configuración. Los 12 estudios de producción
// siguen con los valores de fábrica sin haberlos elegido: esto no los cambia,
// los explica.
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

/** El control de Configuración que cambia cada frase. */
export type AjustePolitica =
  | 'ventana-cancelacion'
  | 'devolver-tardia'
  | 'clase-devuelve-bono'
  | 'lista-espera'
  | 'avisar-alumnas';

export interface FrasePolitica {
  id: 'cancela-a-tiempo' | 'cancela-tarde' | 'estudio-cancela' | 'plaza-liberada' | 'cambia-la-clase';
  texto: string;
  respaldo: (keyof PoliticaEstudio)[];
  ajuste: AjustePolitica;
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
      texto: `Si una alumna cancela con más de ${ventana} h de antelación, recupera la sesión de su bono.`,
      respaldo: ['cancelacionVentanaHoras'],
      ajuste: 'ventana-cancelacion',
    });
    frases.push({
      id: 'cancela-tarde',
      texto: p.cancelacionDevolverBonoTardia
        ? `Si cancela con menos de ${ventana} h, también la recupera.`
        : `Si cancela con menos de ${ventana} h, no la recupera.`,
      respaldo: ['cancelacionVentanaHoras', 'cancelacionDevolverBonoTardia'],
      ajuste: 'devolver-tardia',
    });
  } else {
    // Sin ventana no hay cancelación tardía: «devolver en tardías» no decide nada.
    frases.push({
      id: 'cancela-a-tiempo',
      texto: 'Si una alumna cancela, recupera la sesión de su bono cancele cuando cancele: no hay plazo de cancelación.',
      respaldo: ['cancelacionVentanaHoras'],
      ajuste: 'ventana-cancelacion',
    });
  }

  frases.push({
    id: 'estudio-cancela',
    texto: p.cancelacionClaseDevuelveBono
      ? 'Si se cancela una clase entera —la cancelas tú, no llega al mínimo de asistentes o cierras el centro—, devuelve la sesión a quien tenía plaza.'
      : 'Si se cancela una clase entera —la cancelas tú, no llega al mínimo de asistentes o cierras el centro—, no devuelve la sesión a quien tenía plaza.',
    respaldo: ['cancelacionClaseDevuelveBono'],
    ajuste: 'clase-devuelve-bono',
  });

  if (!p.permiteListaEspera) {
    frases.push({
      id: 'plaza-liberada',
      texto: 'Si una clase está llena, no deja apuntarse a la lista de espera.',
      respaldo: ['permiteListaEspera'],
      ajuste: 'lista-espera',
    });
  } else {
    const plazo = p.listaEsperaPlazoAceptacionMinutos > 0 ? p.listaEsperaPlazoAceptacionMinutos : 0;
    frases.push({
      id: 'plaza-liberada',
      texto: plazo > 0
        ? `Si alguien cancela y se libera una plaza, se la ofrece a la primera de la lista de espera, que tiene ${duracion(plazo)} para aceptarla; si no, pasa a la siguiente.`
        : 'Si alguien cancela y se libera una plaza, se la da al momento a la primera de la lista de espera.',
      respaldo: ['permiteListaEspera', 'listaEsperaPlazoAceptacionMinutos'],
      ajuste: 'lista-espera',
    });
  }

  if (p.avisarAlumnas !== null) {
    frases.push({
      id: 'cambia-la-clase',
      texto: p.avisarAlumnas
        ? 'Si una clase cambia de instructora, se mueve o se cancela desde Sustituciones, avisa a sus alumnas por email y en su app.'
        : 'Si una clase cambia de instructora, se mueve o se cancela desde Sustituciones, no avisa a sus alumnas.',
      respaldo: ['avisarAlumnas'],
      ajuste: 'avisar-alumnas',
    });
  }

  return frases;
}
