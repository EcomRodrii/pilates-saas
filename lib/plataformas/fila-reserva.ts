// Qué se puede hacer con una fila de la lista de la clase, según de dónde venga
// la reserva.
//
// Una reserva de ClassPass/USC/Wellhub no tiene socia (`socioId` null): no hay
// ficha a la que enlazar, ni semáforo de salud, ni sentido en «Repetir» o
// «Hacer fija» (las dos apuntan a una socia de Tentare a otra clase). Lo que SÍ
// se hace igual que con cualquiera: pasar lista, marcar que no vino y quitarla.
//
// Puro y sin `@/` para poder probarlo con `node --test`.
import { esPlataforma, NOMBRE_PLATAFORMA, SIGLA_PLATAFORMA, type OrigenReserva, type Plataforma } from './catalogo.ts';

export interface FilaReserva {
  /** Lo que se escribe en la fila. */
  nombre: string;
  /** Ruta de la ficha, o null si no hay socia. */
  enlaceFicha: string | null;
  plataforma: Plataforma | null;
  /** Texto corto de la etiqueta de plataforma («ClassPass», «USC»). */
  siglaPlataforma: string | null;
  puedeRepetir: boolean;
  puedeHacerFija: boolean;
  conSemaforo: boolean;
}

export function filaReserva(
  r: { socioId: string | null; origen?: OrigenReserva | null; nombreExterno?: string | null },
  nombreClienta: (socioId: string) => string,
): FilaReserva {
  const plataforma = esPlataforma(r.origen) ? r.origen : null;
  if (plataforma || !r.socioId) {
    return {
      nombre: r.nombreExterno?.trim() || (plataforma ? `Clienta de ${NOMBRE_PLATAFORMA[plataforma]}` : 'Clienta'),
      enlaceFicha: null,
      plataforma,
      siglaPlataforma: plataforma ? SIGLA_PLATAFORMA[plataforma] : null,
      puedeRepetir: false,
      puedeHacerFija: false,
      conSemaforo: false,
    };
  }
  return {
    nombre: nombreClienta(r.socioId),
    enlaceFicha: `/clientas/${r.socioId}`,
    plataforma: null,
    siglaPlataforma: null,
    puedeRepetir: true,
    puedeHacerFija: true,
    conSemaforo: true,
  };
}

/** Lo que se añade al aviso de «Quitar»: la plaza también hay que liberarla allí. */
export function avisoQuitarExterna(plataforma: Plataforma | null): string | null {
  return plataforma
    ? `Viene de ${NOMBRE_PLATAFORMA[plataforma]}: cancélala también allí, o seguirá contando como reservada.`
    : null;
}
