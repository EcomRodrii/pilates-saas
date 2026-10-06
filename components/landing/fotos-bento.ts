// Las fotos de la rejilla «todo en una plataforma» (SeccionBento.tsx): qué
// pide cada hueco y qué hay puesto hoy.
//
// Cada hueco es una pieza lista para soltar una foto sin rehacer nada: basta
// con registrarla en `components/landing/fotos.ts` (con su crédito y su
// consentimiento si sale alguien), generar los derivados con
// `node scripts/fotos-landing.mjs` y poner su clave en `foto`. Mientras valga
// `null`, el hueco se pinta como un tinte limpio, sin texto, y las pegatinas del
// producto se reordenan solas.
//
// ⚠️ Nada de stock de otras marcas ni de imágenes descargadas sin decidir su
// origen (el fundador, 6-oct-2026): lo que hay puesto sale del registro de la
// home, con su licencia.
import { FOTOS, type FotoRegistrada } from './fotos';

export interface HuecoFoto {
  /** Qué foto pide el hueco: lo que el fundador tiene que conseguir. */
  pide: string;
  /** Proporción (ancho:alto) del hueco en escritorio y en móvil. */
  proporcion: { escritorio: string; movil: string };
  /** La foto puesta hoy; `null` = tinte limpio. */
  foto: FotoRegistrada | null;
  /** Si la foto de hoy es provisional (una de las cuatro de la home). */
  provisional?: boolean;
}

export const FOTOS_BENTO = {
  // Reservas + lista de espera: la mitad derecha de la tarjeta.
  reservas: {
    pide: 'Alumna haciendo Pilates en un reformer, con luz natural, estudio limpio y claro (vertical o cuadrada)',
    proporcion: { escritorio: '4 / 5', movil: '4 / 3' },
    foto: FOTOS.heroe,
    provisional: true,
  },
  // App de la alumna: detrás del móvil.
  app: {
    pide: 'Alumna sonriendo con el móvil en la mano justo después de la clase, ropa de deporte clara, fondo luminoso (vertical 4:5)',
    proporcion: { escritorio: '4 / 5', movil: '4 / 3' },
    foto: null,
  },
  // Equipo: media tarjeta de arriba.
  equipo: {
    pide: 'Instructora y alumna charlando en la recepción de un estudio de Pilates (horizontal 5:4)',
    proporcion: { escritorio: '5 / 3', movil: '4 / 3' },
    foto: FOTOS.cierre,
    provisional: true,
  },
} as const satisfies Record<string, HuecoFoto>;

export type ClaveHueco = keyof typeof FOTOS_BENTO;
