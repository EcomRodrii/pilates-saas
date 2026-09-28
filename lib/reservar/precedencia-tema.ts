// Quién manda en el aspecto de /reservar/[slug]: el estilo de la app de la
// alumna, los parámetros del widget o lo de siempre.
//
// Decisión del fundador (27-sep-2026): la página pública de reservas toma EL
// MISMO estilo que el estudio eligió para la app de sus alumnas (Configuración
// > Apariencia). Y dentro de la web del estudio (`embed=1`), lo que el estudio
// puso en el snippet del widget sigue ganando a eso. O sea:
//
//   página suelta:  tema de la app  >  lo de siempre
//   incrustada:     widget  >  tema de la app  >  lo de siempre
//
// El tema de la app llega por CSS en `:root` (lo inyecta el layout en servidor,
// `temaReservarCssText` de ./tema-app.ts: sin destello). El widget gana porque
// escribe EN LÍNEA sobre la raíz de la página, que está más cerca que `:root`.
// Este fichero decide QUÉ escribe el widget ahí, y qué tokens reciben por prop
// los componentes que no leen variables (el calendario, Mi cuenta, el pago).
//
// ⚠️ Cuando el widget decide la paleta, la escribe ENTERA, día o noche, no solo
// los campos que tocó. Con la app en «Carbón» y un widget de fondo blanco,
// escribir solo el fondo dejaba tarjetas oscuras con letra clara sobre blanco:
// ilegible. Y por lo mismo se devuelve la marca a la del estudio tal cual: el
// acento aclarado de un estilo oscuro no se lee sobre un fondo claro.
//
// Puro y sin dependencias del servidor: lo usa la página, que es de cliente.

import type { ModoTokens } from '../portal-paleta.ts';
import { RESERVAR_PALETA, varsReservarModo, tokensCalendarioDeApariencia } from '../reservar-publico-tokens.ts';
import { modoTextoDe, type AparienciaWidget } from './apariencia-widget.ts';

/**
 * Lo que la página (cliente) necesita del tema de la app, resuelto en servidor.
 * `aparienciaApp` no viaja en los datos públicos del estudio, así que el layout
 * se lo pasa ya resuelto (components/reservar/tema-app-provider.tsx).
 */
export interface TemaAppReservar {
  /**
   * Los neutros del estilo como `ModoTokens`, para el canal de color por PROP
   * (`t=`). Siempre hex reales, nunca `var(--…)`: el pago se los pasa tal cual
   * a Stripe (`appearance.variables`), que no entiende variables CSS.
   */
  tokens: ModoTokens;
  /** Estilo de fondo oscuro («Carbón»): el logo del pie y los avisos pasan a su variante de noche. */
  oscuro: boolean;
}

/** Sin nada elegido: la paleta de día de siempre. ⚠️ Es también lo que ve quien no tiene el proveedor encima. */
export const TEMA_APP_RESERVAR_POR_DEFECTO: TemaAppReservar = { tokens: RESERVAR_PALETA.dia, oscuro: false };

/**
 * ¿Ha decidido el widget los colores? Con cualquiera de sus ajustes de color
 * —fondo (también «transparente»), color del texto o uno de los cinco «Colores
 * del widget»— sí; con solo la fuente, la forma o la marca, no.
 */
export function widgetDecidePaleta(a: AparienciaWidget): boolean {
  return a.fondo != null || a.texto !== 'auto'
    || a.superficie != null || a.tinta != null || a.textoSecundario != null || a.linea != null || a.relleno != null;
}

/**
 * La marca del estudio tal cual, recuperada de las variables que el servidor
 * deja siempre puestas (`--portal-brand-estudio*`, ./tema-app.ts). Solo se
 * escribe cuando el widget decide la paleta. ⚠️ Nunca
 * `--portal-brand: var(--portal-brand-estudio, var(--portal-brand))`: en el
 * mismo elemento se referencia a sí misma, el navegador lo trata como ciclo y
 * la marca desaparece.
 */
export const MARCA_DEL_ESTUDIO_EN_LINEA: Readonly<Record<string, string>> = {
  '--portal-brand': 'var(--portal-brand-estudio)',
  '--portal-brand-foreground': 'var(--portal-brand-estudio-foreground)',
  '--portal-brand-texto': 'var(--portal-brand-estudio-texto)',
};

export interface PaletaEfectiva {
  /** Para la prop `t=` del calendario, Mi cuenta, la pantalla de reserva y la de error. */
  tokens: ModoTokens;
  /** Fondo oscuro: letra clara, logo en blanco, avisos en su variante de noche. */
  noche: boolean;
  /** Lo que el widget escribe en línea sobre la raíz, o `null` si no decide nada (se hereda `:root`). */
  varsEnLinea: Record<string, string> | null;
}

/**
 * La paleta que se ve, con la precedencia de la cabecera.
 *
 * Sin widget que decida, la prop `t` es la del tema de la app y no se escribe
 * nada en línea: todo se hereda de `:root`. Con la apariencia por defecto eso
 * es EXACTAMENTE lo de antes (`RESERVAR_PALETA.dia`), para la página suelta y
 * para el widget sin parámetros de color.
 *
 * Con widget que decide, es lo que había antes de que existiera el tema de la
 * app, carácter por carácter: `tokensCalendarioDeApariencia` en su modo, y la
 * paleta de ese modo en línea — ahora también la de DÍA, porque debajo ya no
 * tiene por qué haber un día.
 */
export function paletaEfectivaReservar(a: AparienciaWidget, embed: boolean, temaApp: TemaAppReservar): PaletaEfectiva {
  if (!embed || !widgetDecidePaleta(a)) {
    return { tokens: temaApp.tokens, noche: temaApp.oscuro, varsEnLinea: null };
  }
  const modo = modoTextoDe(a);
  return {
    tokens: tokensCalendarioDeApariencia(a, modo),
    noche: modo === 'noche',
    varsEnLinea: {
      ...varsReservarModo(modo),
      ...MARCA_DEL_ESTUDIO_EN_LINEA,
      // `color-scheme` es heredable y el estilo oscuro lo pone a `dark` en
      // `:root`: sin esto, las barras de desplazamiento y los controles nativos
      // de un widget de día se pintarían oscuros. En noche no se toca: es lo
      // de siempre.
      ...(modo === 'dia' ? { colorScheme: 'light' } : {}),
    },
  };
}

/**
 * Las variables de tipografía que el widget escribe en línea sobre la raíz.
 *
 * `fuenteDisplay` ya llega resuelta con su contrato («null = la misma que
 * `fuente`»). Con una fuente de titulares del widget, el peso de titular de la
 * pareja de la app (`--reservar-heading-weight`) se anula (`initial` = la
 * variable no existe y vale el número de siempre): el 700 de Libre Caslon no
 * tiene nada que ver con la Lobster que eligió el estudio.
 *
 * ⚠️ Sin fuente del widget no se declara NADA: la raíz hereda lo del layout
 * (e2e/widget-tipografia-llega-a-todo.spec.ts lo comprueba).
 */
export function varsTipografiaWidget(fuente: string | null, fuenteDisplay: string | null): Record<string, string> {
  return {
    ...(fuente ? { '--font-ui': fuente } : {}),
    ...(fuenteDisplay ? {
      '--font-display': fuenteDisplay,
      '--portal-heading-font': fuenteDisplay,
      '--reservar-heading-weight': 'initial',
    } : {}),
  };
}
