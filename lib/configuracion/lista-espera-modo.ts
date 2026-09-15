// La lista de espera, en UN control de tres opciones.
//
// Eran dos ajustes sueltos —«Permitir lista de espera» y «Plazo para aceptar una
// plaza liberada (minutos)», con «vacío o 0 = sin plazo»— y había que leer los
// dos para saber qué pasaba. La propietaria elige ahora una de tres:
//
//   · sin lista                        → permite_lista_espera = false
//   · se da a la primera al momento    → permite_lista_espera = true,  plazo = 0
//   · se le ofrece durante N minutos   → permite_lista_espera = true,  plazo = N
//
// Son las MISMAS dos columnas y los mismos valores que escribían los dos
// controles de antes (`promocionar_siguiente_espera`: plazo ≤ 0 confirma al
// momento, plazo > 0 abre una oferta). Nada nuevo se guarda.
//
// ⚠️ «Sin lista» NO toca el plazo guardado, igual que apagar el interruptor de
// antes: un tipo de clase que enciende su propia lista de espera y no tiene
// plazo propio hereda el del estudio, y ponerlo a 0 al apagarla le cambiaría la
// regla a esa clase sin que nadie lo hubiera pedido.
//
// Puro y sin `@/`: se prueba con `node --test`.

export type ModoListaEspera = 'sin-lista' | 'al-momento' | 'con-plazo';

/** Las dos columnas de `studios` que decide este control. */
export interface ValoresListaEspera {
  permiteListaEspera: boolean;
  listaEsperaPlazoAceptacionMinutos: number;
}

/** Lo que hay elegido en pantalla. `minutos` es texto: es lo que se teclea. */
export interface ListaEsperaElegida {
  modo: ModoListaEspera;
  minutos: string;
}

/** Lo que se propone al elegir «durante N minutos» sin ningún plazo previo. */
export const MINUTOS_PROPUESTOS = 15;

export function listaEsperaDesdeValores(v: ValoresListaEspera): ListaEsperaElegida {
  const plazo = v.listaEsperaPlazoAceptacionMinutos > 0 ? v.listaEsperaPlazoAceptacionMinutos : 0;
  const modo: ModoListaEspera = !v.permiteListaEspera ? 'sin-lista' : plazo > 0 ? 'con-plazo' : 'al-momento';
  return { modo, minutos: plazo > 0 ? String(plazo) : '' };
}

/** Cambiar de opción. Al pasar a «durante N minutos» sin cifra, se propone una que se ve antes de guardar. */
export function elegirModoListaEspera(actual: ListaEsperaElegida, modo: ModoListaEspera): ListaEsperaElegida {
  if (modo === 'con-plazo' && actual.minutos.trim() === '') return { modo, minutos: String(MINUTOS_PROPUESTOS) };
  return { ...actual, modo };
}

export type ResultadoListaEspera =
  | { ok: true; valores: ValoresListaEspera }
  | { ok: false; error: string };

/**
 * Lo elegido, traducido a las dos columnas. `guardado` es lo que hay hoy en la
 * base de datos: «sin lista» conserva su plazo.
 */
export function valoresDeListaEspera(elegida: ListaEsperaElegida, guardado: ValoresListaEspera): ResultadoListaEspera {
  switch (elegida.modo) {
    case 'sin-lista':
      return { ok: true, valores: { permiteListaEspera: false, listaEsperaPlazoAceptacionMinutos: guardado.listaEsperaPlazoAceptacionMinutos } };
    case 'al-momento':
      return { ok: true, valores: { permiteListaEspera: true, listaEsperaPlazoAceptacionMinutos: 0 } };
    case 'con-plazo': {
      const texto = elegida.minutos.trim();
      const minutos = /^\d+$/.test(texto) ? Number(texto) : NaN;
      if (!Number.isSafeInteger(minutos) || minutos < 1) {
        return { ok: false, error: 'Pon cuántos minutos tiene para aceptar la plaza: 1 o más.' };
      }
      return { ok: true, valores: { permiteListaEspera: true, listaEsperaPlazoAceptacionMinutos: minutos } };
    }
  }
}
