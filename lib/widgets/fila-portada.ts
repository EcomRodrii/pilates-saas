// La fila de una pieza en la portada «Tus widgets» de «Tu web» v2 (16-oct-2026,
// propuesta aprobada por el fundador el 15-oct, decisión 5 y §6): UN estado en
// una pastilla y, como mucho, UN aviso con su botón. Hoy la fila de «Lo que
// tienes en tu web» (components/widgets/lo-que-tienes.tsx) pinta hasta seis
// notas a la vez; aquí se quedan los mismos seis tipos, priorizados.
//
// Puro (sin React) para probarlo con `node --test`. Las frases del estado salen
// de ./en-tu-web.ts (`chipEnTuWeb`), donde está también lo que NUNCA se dice.
//
// El orden: web sin autorizar → desfase / versión → código de antes → diseño
// propio → botón de antes. La propuesta aprobada (§6) la ponía cuarta; el
// fundador la subió a la primera el 16-oct-2026: es el ÚNICO aviso que significa
// «el widget no carga en tu web», y detrás de otro quedaba escondido hasta
// arreglar algo que no lo rompe. El resto, en el orden aprobado.

import { chipEnTuWeb, textoCambios, textosEnTuWeb, versionPidePegar, type ChipEnTuWeb, type PiezaCopiada } from './en-tu-web.ts';

export type ClaveAviso = 'desfase' | 'version' | 'codigo-antiguo' | 'diseno-propio' | 'web-sin-autorizar' | 'boton-de-antes';
/** Lo que hace el botón del aviso: lo resuelve la pantalla. */
export type AccionAviso = 'copiar' | 'estilo-comun' | 'webs-autorizadas';

export interface AvisoFila {
  clave: ClaveAviso;
  texto: string;
  /** `null`: el aviso es cierto pero aquí no hay adónde llevarla (p. ej. ya no va sin marco). */
  accion: { texto: string; hace: AccionAviso } | null;
}

export interface FilaPortada {
  /** `null` = no se dice nada de su web (cargando, sin permiso, la lectura falló o aún sin `ahora`). */
  chip: ChipEnTuWeb | null;
  aviso: AvisoFila | null;
}

/** Lo que la fila necesita de una pieza copiada (lo que ya calcula el constructor, `FilaTienes`). */
export interface EntradaFila {
  pieza: PiezaCopiada;
  /** Lo nuevo se copia como enlace (un enlace, o el botón de su propia web). */
  esEnlace: boolean;
  /** Su web, si va sin marco y no la tiene autorizada. */
  webSinAutorizar: string | null;
  /** La lista de webs autorizadas se puede abrir (solo con la nativa de ahora). */
  conListaDeWebs: boolean;
  /** Lo pegado es un código de antes del código por id y ella puede pasarse al de ahora. */
  codigoAntiguo: boolean;
}

/** El orden en que se decide el único aviso. El primero que encaja gana. */
export const ORDEN: readonly ClaveAviso[] = ['web-sin-autorizar', 'desfase', 'version', 'codigo-antiguo', 'diseno-propio', 'boton-de-antes'];

/** El nombre del botón que la publica en su web (decisión 1: un solo verbo). */
const PUBLICAR = '«Publicar en mi web»';

type Regla = (f: EntradaFila, ahora: number | null) => AvisoFila | null;

/**
 * Cada tipo de aviso, con su condición, su texto y su botón. Un `Record` sobre
 * `ClaveAviso`: un tipo nuevo sin regla no compila.
 */
export const REGLAS: Record<ClaveAviso, Regla> = {
  desfase: f => (f.pieza.desfasado
    ? { clave: 'desfase', texto: textoCambios(f.pieza.cambios), accion: { texto: f.esEnlace ? 'Copiar el enlace nuevo' : 'Copiar el código nuevo', hace: 'copiar' } }
    : null),
  version: (f, ahora) => {
    if (ahora === null || !versionPidePegar(f.pieza.estado)) return null;
    const texto = textosEnTuWeb(f.pieza.estado, ahora).version;
    return texto ? { clave: 'version', texto, accion: { texto: f.esEnlace ? 'Copiar el enlace nuevo' : 'Copiar el código nuevo', hace: 'copiar' } } : null;
  },
  'codigo-antiguo': f => (f.codigoAntiguo
    ? {
      clave: 'codigo-antiguo',
      texto: `Tu web tiene ${f.esEnlace ? 'un enlace' : 'un código'} de antes: si cambias qué enseña, tendrás que pegarlo otra vez. Cámbialo una sola vez por el de ahora y esos cambios llegarán con ${PUBLICAR}.`
        + (f.pieza.botonCongelado ? ' Con el de ahora, el botón que abre la ventana también seguirá el estilo de tus widgets.' : ''),
      accion: { texto: f.esEnlace ? 'Copiar el enlace de ahora' : 'Copiar el código de ahora', hace: 'copiar' },
    }
    : null),
  'diseno-propio': f => (f.pieza.disenoPropio
    ? {
      clave: 'diseno-propio',
      texto: 'Tiene su propio diseño: el estilo, la letra y los colores que elijas para tus widgets no le llegan.',
      // HACE el cambio (quita el diseño propio), no solo lleva a otro sitio.
      accion: { texto: 'Que siga el estilo de tus widgets', hace: 'estilo-comun' },
    }
    : null),
  'web-sin-autorizar': f => (f.webSinAutorizar
    ? {
      clave: 'web-sin-autorizar',
      texto: `Tu web (${f.webSinAutorizar}) no está entre las webs autorizadas, y sin marco el widget solo carga en las que autorices.`,
      // Si ya no va sin marco, el aviso sigue siendo cierto (lo pegado sí), pero no hay lista que abrir.
      accion: f.conListaDeWebs ? { texto: 'Ir a las webs autorizadas', hace: 'webs-autorizadas' } : null,
    }
    : null),
  // Sin `ahora` aún no se sabe si habrá versión que decir: saldría y se iría.
  'boton-de-antes': (f, ahora) => (f.pieza.botonCongelado && ahora !== null
    ? {
      clave: 'boton-de-antes',
      texto: 'El botón que abre la ventana es de un código anterior y se queda como está. Si quieres que también cambie solo con el estilo de tus widgets, copia el código de ahora y pégalo en lugar del de antes.',
      accion: { texto: 'Ir a copiarlo', hace: 'copiar' },
    }
    : null),
};

/**
 * El estado y el aviso de una fila. Con lo copiado cambiado después de
 * copiarlo, el estado es «Tu web tiene lo de antes» aunque su web se haya visto
 * hace un rato: lo que se ve es lo de antes.
 */
export function filaDePortada(f: EntradaFila, ahora: number | null): FilaPortada {
  let aviso: AvisoFila | null = null;
  for (const clave of ORDEN) {
    aviso = REGLAS[clave](f, ahora);
    if (aviso) break;
  }
  if (ahora === null) return { chip: null, aviso };
  const chip = chipEnTuWeb(f.pieza.estado, ahora, f.esEnlace);
  if (f.pieza.desfasado) {
    return { chip: { texto: 'Tu web tiene lo de antes', tono: 'aviso', detalle: chip?.detalle ?? null }, aviso };
  }
  return { chip, aviso };
}
