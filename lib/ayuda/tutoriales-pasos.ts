// ─────────────────────────────────────────────────────────────────────────────
// Los pasos de cada tutorial de pantalla (P1.1/P1.2). Fichero APARTE del
// catálogo (`pantallas.ts`) a propósito —decisión del fundador del 12-oct-2026—:
// solo lo importa el tutorial, que llega con `dynamic()`, así que estos textos
// no viajan en el chunk de cada pantalla. No es una segunda lista de pantallas:
// las claves son las del catálogo que llevan `tutorial`, y tsc exige que estén
// todas y ninguna más.
//
// Cada paso señala un control REAL (`data-tour="…"` o `#id`, el formato de la
// visita: `selectorCss`). Lo vigila `lib/ayuda/tutoriales.test.ts`: que el
// selector exista en el código, 3–4 pasos, nada congelado.
// ─────────────────────────────────────────────────────────────────────────────
import type { RutaConTutorial } from './pantallas.ts';
import type { ClaveHecho } from '../tour/capitulos.ts';

export interface PasoTutorial {
  /** `data-tour` del control (o `#id`). */
  selector: string;
  /** Seis palabras como mucho. */
  titulo: string;
  /** Dos líneas como mucho, hablando de tú. */
  texto: string;
  /** El control no existe en el móvil: el paso se salta ahí. */
  soloEscritorio?: true;
}

/** «Hazlo conmigo» (P1.3): el último paso abre el formulario real con un ejemplo. */
export interface HazloConmigo {
  /** Lo que dice el botón: «Crear uno con un ejemplo». */
  texto: string;
  /** Adónde lleva (abre el formulario con el ejemplo). */
  href: string;
  /** El dato que da el paso por hecho (`lib/tour/hecho.ts`). */
  hecho: ClaveHecho;
}

export interface TutorialPasos {
  pasos: readonly PasoTutorial[];
  hazloConmigo?: HazloConmigo;
}

export const PASOS_TUTORIAL: { readonly [R in RutaConTutorial]: TutorialPasos } = {};
