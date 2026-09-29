// La ficha de una clase en /reservar, y el resumen de esa misma clase en «Tus
// datos» y en el pago (F4 del rediseño «/reservar = estilo de la app de la
// alumna», 29-sep-2026).
//
// Vive en un fichero puro, con su test, por dos motivos:
//
//   · Lo pintan DOS pantallas: la ficha (components/reserva/reserva-calendario.tsx,
//     que además compila esbuild para el widget nativo) y «Tus datos» y el pago
//     (components/reserva/pantalla-reserva.tsx). Qué filas se enseñan y con qué
//     palabras se decide aquí una sola vez. Antes cada una contaba la clase a su
//     manera —«HORARIO / FECHA / SALA / PLAZAS» en versales en la ficha, chips
//     en mono y una tarjeta de sala en «Tus datos»— y ninguna se parecía a la
//     app, que usa «Cuándo / Dónde / Capacidad / Cancelación».
//   · El nombre y los chips van ENCIMA DE LA FOTO de la clase. Como en la portada
//     de la F3 (./portada.ts), el contraste sobre una foto no lo mide ningún test
//     de navegador, así que se garantiza aquí contra el peor píxel posible —un
//     blanco puro— y lo comprueba ./ficha-clase.test.ts.

import { diaEnEstudio } from '../calendario-hora-estudio.ts';
import { etiquetaDiaClave } from '../reserva-calendario-logic.ts';
import { horaEstudio } from '../utils.ts';

/** El negro del velo: el mismo de la portada (./portada.ts) y de la app. */
const NEGRO_VELO = '8,8,8';

/**
 * Alto de la foto de la ficha. `amplia` en la página y en el widget (la foto va
 * a todo el ancho de la columna, como la cabecera de la ficha en la app, que
 * mide 290), y `hoja` en la hoja con fondo oscurecido, que ya es más baja.
 */
export const ALTO_FOTO_FICHA = { amplia: 264, hoja: 200 } as const;

/**
 * El velo de la foto ENTERA, de arriba abajo: `[posición %, opacidad]`.
 *
 * Solo una sombra arriba, donde va el botón de volver, y casi nada en medio: la
 * foto tiene que verse. El texto de abajo NO depende de este velo sino del
 * fundido de `FUNDIDO_TEXTO_FICHA`, que va pegado al propio texto. Es el reparto
 * de la app de la alumna (FichaClaseHero): oscura arriba y abajo, limpia en medio.
 */
export const PARADAS_VELO_FICHA: readonly (readonly [posicion: number, alfa: number])[] = [
  [0, 0.34],
  [30, 0.06],
  [100, 0.06],
];

/** El velo como `background` de CSS. */
export function veloFichaCss(): string {
  return `linear-gradient(180deg, ${PARADAS_VELO_FICHA.map(([p, a]) => `rgba(${NEGRO_VELO},${a}) ${p}%`).join(', ')})`;
}

/**
 * El fundido que va DETRÁS del texto de la foto: el nivel, el nombre y los chips.
 *
 * No es una parada fija del velo, y a propósito. Con un nombre de clase de tres
 * líneas, o con los chips partidos en dos filas, el texto sube; una parada puesta
 * a ojo al 55 % se quedaría por debajo y la primera línea caería sobre la foto
 * limpia. Aquí el fundido es el FONDO del bloque de texto: `entrada` px de
 * transparente a `alfa` por encima de la primera línea (el bloque lleva ese
 * mismo relleno arriba) y `alfaPie` al pie. El texto empieza donde termina la
 * entrada, así que nunca cae sobre menos de `alfa`, mida lo que mida.
 */
export const FUNDIDO_TEXTO_FICHA = { entrada: 44, alfa: 0.62, alfaPie: 0.74 } as const;

/** El fundido como `background` del bloque de texto. */
export function fundidoTextoFichaCss(): string {
  const { entrada, alfa, alfaPie } = FUNDIDO_TEXTO_FICHA;
  return `linear-gradient(180deg, rgba(${NEGRO_VELO},0) 0px, rgba(${NEGRO_VELO},${alfa}) ${entrada}px, rgba(${NEGRO_VELO},${alfaPie}) 100%)`;
}

/**
 * El botón redondo de volver (o de cerrar) sobre la foto: crema casi opaco con
 * la tinta de día encima, el mismo de la app. Casi opaco a propósito: así se lee
 * igual sobre una foto negra que sobre una blanca, sin depender del velo.
 */
export const BOTON_SOBRE_FOTO = 'rgba(250,249,245,.92)';

/** «Hoy · 10:00», «Mañana · 18:30», «Mié, 12 ago · 10:00». En la hora del estudio. */
export function cuandoCorto(inicio: string, hoy: string): string {
  return `${etiquetaDiaClave(diaEnEstudio(inicio), hoy)} · ${horaEstudio(inicio)}`;
}

/** El rótulo de quien da la clase, debajo de su nombre. */
export function rolInstructora(rol: string | null | undefined): 'Directora' | 'Instructora' {
  return rol === 'PROPIETARIO' ? 'Directora' : 'Instructora';
}

export type ClaveFilaFicha = 'Cuándo' | 'Dónde' | 'Capacidad' | 'Plazas' | 'Cancelación';

export interface FilaFicha {
  clave: ClaveFilaFicha;
  valor: string;
}

export interface DatosFilasFicha {
  inicio: string;
  fin: string;
  /** 'YYYY-MM-DD' de hoy EN EL ESTUDIO (`hoyEnEstudio()`): decide «Hoy» o «Mañana». */
  hoy: string;
  salaNombre?: string | null;
  /** La calle del estudio. Sin ella, «Dónde» es solo la sala. */
  direccion?: string | null;
  /**
   * El aforo. Sin él la fila se llama «Plazas» y dice solo las libres: el pago
   * sin cuenta sabía las libres y no el total, y un «10 personas» inventado
   * sería peor que no decirlo.
   */
  aforoMaximo?: number | null;
  libres?: number | null;
  /**
   * La ventana de cancelación REAL de esta clase (la del tipo de clase si tiene
   * la suya, si no la del estudio). `0` o ausente = sin fila: no se promete una
   * cancelación gratuita que el estudio no ha configurado.
   */
  ventanaCancelacionHoras?: number | null;
}

/**
 * Las filas clave/valor de la clase, en el orden de la app: Cuándo, Dónde,
 * Capacidad (o Plazas) y Cancelación. Solo las que tienen algo cierto que decir.
 */
export function filasFicha(d: DatosFilasFicha): FilaFicha[] {
  const filas: FilaFicha[] = [{
    clave: 'Cuándo',
    valor: `${etiquetaDiaClave(diaEnEstudio(d.inicio), d.hoy)} · ${horaEstudio(d.inicio)} – ${horaEstudio(d.fin)}`,
  }];

  const donde = [d.direccion, d.salaNombre].map(s => s?.trim() ?? '').filter(Boolean).join(' · ');
  if (donde) filas.push({ clave: 'Dónde', valor: donde });

  const libres = d.libres == null ? null : Math.max(0, d.libres);
  const textoLibres = (n: number) => (n === 0 ? 'completa' : `${n} ${n === 1 ? 'libre' : 'libres'}`);
  if (d.aforoMaximo != null && d.aforoMaximo > 0) {
    const personas = `${d.aforoMaximo} ${d.aforoMaximo === 1 ? 'persona' : 'personas'}`;
    filas.push({ clave: 'Capacidad', valor: libres == null ? personas : `${personas} · ${textoLibres(libres)}` });
  } else if (libres != null) {
    const t = textoLibres(libres);
    filas.push({ clave: 'Plazas', valor: t.charAt(0).toUpperCase() + t.slice(1) });
  }

  if (d.ventanaCancelacionHoras != null && d.ventanaCancelacionHoras > 0) {
    filas.push({ clave: 'Cancelación', valor: `Gratis hasta ${d.ventanaCancelacionHoras} h antes` });
  }
  return filas;
}

export type TonoDisponibilidad = 'libre' | 'pocas' | 'completa' | 'espera' | 'reservada';

/**
 * Lo que dice la insignia de la fila de arriba de la ficha, junto a lo que
 * cuesta. Mismos cortes que la app de la alumna (`AvailabilityBadge`): «Última
 * plaza», «Quedan 2», «Completa».
 *
 * ⚠️ «En espera» y no «En lista de espera» para quien ya está apuntada: tras
 * apuntarse, la hoja dice «Estás en lista de espera…» en su aviso, y con la
 * misma frase dos veces en pantalla `getByText(/lista de espera/)` deja de
 * señalar una sola cosa (e2e/booking.spec.ts busca justo eso).
 */
export function disponibilidadFicha(
  libres: number,
  miEstado: 'CONFIRMADA' | 'LISTA_ESPERA' | null,
): { texto: string; tono: TonoDisponibilidad } {
  if (miEstado === 'CONFIRMADA') return { texto: 'Reservada', tono: 'reservada' };
  if (miEstado === 'LISTA_ESPERA') return { texto: 'En espera', tono: 'espera' };
  if (libres <= 0) return { texto: 'Completa', tono: 'completa' };
  if (libres === 1) return { texto: 'Última plaza', tono: 'pocas' };
  if (libres === 2) return { texto: 'Quedan 2', tono: 'pocas' };
  return { texto: `${libres} plazas libres`, tono: 'libre' };
}
