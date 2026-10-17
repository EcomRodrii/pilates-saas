// «Tu horario, tus clases»: el aviso a quien YA tiene pegado un código de
// horario de antes de la opción (17-oct-2026).
//
// Hasta entonces, un horario dentro de una página (o encima) enseñaba debajo
// toda la página de reservas: la banda de bonos y cuotas, «Sobre nosotros», las
// cifras y el pie. Con la opción, el código lleva `solo=1` y no sale nada de eso.
// Pero un código ya pegado es texto en su web: no cambia solo. Este aviso dice
// cómo recuperarlo, con palabras sencillas, y SOLO a quien le toca.
//
// Puro (sin React) para `node --test`.
//
// ⚠️ La señal es la del panel, y es la más honesta que hay: «lo copiaste desde
// aquí antes de la opción» (`Copiado.antesDeSolo`). No sabemos si lo pegó, ni
// dónde, ni si su web enseña los bonos debajo: por eso el aviso es condicional
// («si en tu web te salen…») y no afirma ningún estado. Tampoco sale:
//  - a quien aún no ha copiado nada (no hay copia);
//  - a quien ya copió el código de ahora, con la opción (la copia no es «de antes»);
//  - a quien lo copió de ahora con la opción apagada a propósito (es su decisión);
//  - con la forma de ahora que no la lleva (sin marco, botón, enlace): prometería
//    algo que el código nuevo no trae.

import type { MetodoIntegracion, WidgetDisponible } from './catalogo.ts';
import type { ConfigConstructor, Copiado } from './config.ts';
import { ofreceSoloHorario } from './integracion.ts';

/** El nombre de la opción, tal como la lee quien la usa. */
export const NOMBRE_SOLO_HORARIO = 'Tu horario, tus clases';

export interface AvisoSoloHorario {
  /** `copiar`: pegado un código congelado, hay que copiar el nuevo. `publicar`: es un código por id, llega con «Publicar en mi web». */
  modo: 'copiar' | 'publicar';
  texto: string;
  /** El botón que lo resuelve; `null` si ya no hace falta ninguno (la barra de publicar está a la vista). */
  accion: { texto: string; hace: 'copiar' | 'activar-solo-horario' } | null;
}

const DEBAJO = 'Si en tu web te salen los bonos y las cuotas debajo del horario';

export function avisoSoloHorario(x: {
  widget: WidgetDisponible;
  /** Lo que se copió de este widget (la copia leída de `widget_builder`). */
  copia: Copiado | null | undefined;
  /** La configuración de ahora (sin huérfanos). */
  ahora: ConfigConstructor;
  metodoAhora: MetodoIntegracion;
  /** Lo PUBLICADO de este widget por id (`widget_piezas`), si se ha podido leer. */
  publicada: ConfigConstructor | null | undefined;
}): AvisoSoloHorario | null {
  const k = x.copia;
  if (!k || k.antesDeSolo !== true) return null;
  // Lo copiado era una forma con la página entera debajo (dentro de una página o encima). Sin forma conocida
  // (una copia muy antigua), no se sabe, y no se dice.
  if (k.metodo !== 'iframe' && k.metodo !== 'popup') return null;
  if (!ofreceSoloHorario(x.widget, k.metodo)) return null;
  // Y el código de ahora tiene que poder traerla.
  if (!ofreceSoloHorario(x.widget, x.metodoAhora)) return null;

  if (k.pieza) {
    // Por id: lo que ve su web es lo publicado. Sin saber qué hay publicado, no se dice nada.
    if (!x.publicada || x.publicada.soloHorario) return null;
    return {
      modo: 'publicar',
      texto: `${DEBAJO}, activa «${NOMBRE_SOLO_HORARIO}» y pulsa «Publicar en mi web»: el código que ya tienes pegado no cambia, lo que se publica llega a tu web sin volver a pegar nada.`,
      accion: x.ahora.soloHorario ? null : { texto: `Activar «${NOMBRE_SOLO_HORARIO}»`, hace: 'activar-solo-horario' },
    };
  }
  // Congelado: es texto pegado en su web. El nuevo lo trae si la opción está encendida.
  if (!x.ahora.soloHorario) return null;
  return {
    modo: 'copiar',
    texto: `${DEBAJO}, vuelve a copiar el código: el nuevo trae «${NOMBRE_SOLO_HORARIO}» activado. El que ya tienes pegado no cambia solo.`,
    accion: { texto: 'Copiar el código nuevo', hace: 'copiar' },
  };
}
