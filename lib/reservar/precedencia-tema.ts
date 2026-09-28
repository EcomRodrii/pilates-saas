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
import { ratioContraste } from '../wcag-contrast.ts';
import { colorLegibleSobre } from '../color-utils.ts';
import { RESERVAR_PALETA, varsReservarModo, tokensCalendarioDeApariencia } from '../reservar-publico-tokens.ts';
import { fondoCss, luminancia, modoTextoDe, type AparienciaWidget } from './apariencia-widget.ts';

/**
 * Los ajustes del widget que deciden los COLORES (y solo esos): fondo, color
 * del texto y los cinco «Colores del widget».
 */
export type ColoresWidget = Pick<AparienciaWidget, 'fondo' | 'texto' | 'superficie' | 'tinta' | 'textoSecundario' | 'linea' | 'relleno'>;

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
  /**
   * Los «Colores del widget» que el estudio GUARDÓ en su tema, resueltos en
   * servidor, solo si deciden algo (si no, la clave no está).
   *
   * ⚠️ En cliente llegan con `/api/public/studio-data`, DESPUÉS del primer
   * fotograma. Antes de la app de la alumna daba igual (día sobre día), pero
   * con una app en «Carbón» y un widget guardado de fondo claro, el iframe
   * pintaba Carbón y saltaba a su paleta de día dentro de la web del estudio.
   * La página los usa hasta que llegan los de verdad, que son los mismos.
   */
  widgetGuardado?: ColoresWidget;
}

/** Sin nada elegido: la paleta de día de siempre. ⚠️ Es también lo que ve quien no tiene el proveedor encima. */
export const TEMA_APP_RESERVAR_POR_DEFECTO: TemaAppReservar = { tokens: RESERVAR_PALETA.dia, oscuro: false };

/**
 * ¿Ha decidido el widget los colores? Con cualquiera de sus ajustes de color
 * —fondo (también «transparente»), color del texto o uno de los cinco «Colores
 * del widget»— sí; con solo la fuente, la forma o la marca, no. (La marca y el
 * diseño «ligero» deciden sobre un estilo OSCURO de la app: ver `widgetDecide`.)
 */
export function widgetDecidePaleta(a: ColoresWidget): boolean {
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

/**
 * La misma marca para un widget de NOCHE: la marca como texto, en su variante
 * que se lee sobre la paleta oscura (`--portal-brand-estudio-texto-noche`, la
 * calcula el servidor). La de día está oscurecida para fondo claro: una marca
 * dorada o rosa, que de noche se leía de maravilla tal cual, quedaba apagada.
 */
export const MARCA_DEL_ESTUDIO_EN_LINEA_NOCHE: Readonly<Record<string, string>> = {
  ...MARCA_DEL_ESTUDIO_EN_LINEA,
  '--portal-brand-texto': 'var(--portal-brand-estudio-texto-noche)',
};

export interface PaletaEfectiva {
  /** Para la prop `t=` del calendario, Mi cuenta, la pantalla de reserva y la de error. */
  tokens: ModoTokens;
  /** Fondo oscuro: letra clara, logo en blanco, avisos en su variante de noche. */
  noche: boolean;
  /** Lo que el widget escribe en línea sobre la raíz, o `null` si no decide nada (se hereda `:root`). */
  varsEnLinea: Record<string, string> | null;
}

/** Lo del snippet que, sin ser un color, también puede decidir la paleta. */
export interface OpcionesWidget {
  /** `marca=`: el color primario del snippet. */
  marca?: string | null;
  /** `diseno=ligero`: la rejilla de neutros FIJOS de día (formato 06). */
  ligero?: boolean;
}

/**
 * ¿Decide el widget la paleta? Con cualquier color suyo, siempre. Y sobre un
 * estilo OSCURO de la app, también con dos ajustes que no son colores pero que
 * solo existen pensados para el día:
 *   · `marca=`: el constructor la emite siempre que la identidad es «propia»
 *     (lib/widgets/integracion.ts), para la web CLARA del estudio. Sobre
 *     Carbón, su `#1A1A1A` o su verde oscuro pisaban el acento aclarado y
 *     quedaban a 1–2:1: contadores de plazas invisibles y píldoras «Reservar»
 *     que no se distinguían del fondo.
 *   · `diseno=ligero`: la rejilla pinta sus celdas en blanco FIJO (nunca `t`);
 *     sobre Carbón eran losas blancas con la hora en el acento aclarado para
 *     fondo oscuro, ilegible, y los estados vacío/error, tinta negra sobre
 *     negro.
 * Sobre un estilo claro, ninguno de los dos choca: se hereda el de la app.
 */
export function widgetDecide(a: ColoresWidget, temaApp: TemaAppReservar, w: OpcionesWidget = {}): boolean {
  if (widgetDecidePaleta(a)) return true;
  return temaApp.oscuro && (!!w.marca || w.ligero === true);
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
export function paletaEfectivaReservar(
  a: AparienciaWidget, embed: boolean, temaApp: TemaAppReservar, w: OpcionesWidget = {},
): PaletaEfectiva {
  if (!embed || !widgetDecide(a, temaApp, w)) {
    return { tokens: temaApp.tokens, noche: temaApp.oscuro, varsEnLinea: null };
  }
  const modo = modoTextoDe(a);
  return {
    tokens: tokensCalendarioDeApariencia(a, modo),
    noche: modo === 'noche',
    varsEnLinea: {
      ...varsReservarModo(modo),
      ...(modo === 'noche' ? MARCA_DEL_ESTUDIO_EN_LINEA_NOCHE : MARCA_DEL_ESTUDIO_EN_LINEA),
      // `color-scheme` es heredable y el estilo oscuro lo pone a `dark` en
      // `:root`: sin esto, las barras de desplazamiento y los controles nativos
      // de un widget de día se pintarían oscuros. En noche no se toca: es lo
      // de siempre. (El documento, además, lo devuelve a `normal`: ver
      // `cssDocumentoIncrustado`.)
      ...(modo === 'dia' ? { colorScheme: 'light' } : {}),
    },
  };
}

/**
 * El `<style>` del DOCUMENTO del iframe en `embed=1`: lo que el div raíz no
 * alcanza porque vive por encima de él.
 *
 *   · `html,body{background}`: sin esto «transparente» no lo es (el `<body>`
 *     pinta su `bg-background` opaco por debajo). Sin fondo del widget, el de
 *     la paleta que se ve: cuando decide el widget, su hex — `var(--portal-bg)`
 *     en `html` sería el de `:root`, o sea Carbón debajo de un widget de día.
 *   · ⚠️ `:root:root{color-scheme:normal}` cuando decide el widget. Carbón
 *     pone `color-scheme: dark` en la raíz del documento, y un iframe cuyo
 *     esquema de raíz no coincide con el de su `<iframe>` anfitrión (una web
 *     normal, en claro) se pinta sobre un lienzo OPACO de su propio esquema
 *     (CSS Color Adjust §2.2, lo cumplen Chrome, Firefox y Safari): una losa
 *     casi negra bajo un widget que tenía que ser transparente, con la tinta
 *     de día encima. El `colorScheme` en línea del div no basta: va en el div,
 *     no en `<html>`. Así la raíz queda como estaba antes del tema de la app.
 *     `:root:root` para ganarle al `:root` del layout sin `!important`.
 *
 * Seguro dentro de un `<style>`: `fondoCss` solo devuelve `transparent` o un
 * color que ya pasó `COLOR_VALIDO`, y `tokens.bg` sale de la paleta.
 */
export function cssDocumentoIncrustado(a: AparienciaWidget, p: PaletaEfectiva): string {
  const decide = p.varsEnLinea != null;
  const fondo = fondoCss(a) ?? (decide ? p.tokens.bg : 'var(--portal-bg)');
  return `html,body{background:${fondo} !important;}${decide ? ':root:root{color-scheme:normal;}' : ''}`;
}

/**
 * La marca como TEXTO (un enlace, una cifra suelta) legible sobre las tres
 * superficies donde se pinta: se mide contra la que peor contrasta y se
 * oscurece —o aclara, en oscuro— solo lo justo. En «Luz» la tarjeta es MÁS
 * oscura que el fondo, así que medir solo contra el fondo no bastaría.
 *
 * ⚠️ Se vuelve a medir tras cada ajuste: la peor superficie de la marca de
 * partida no tiene por qué serlo de la ajustada. Una marca casi negra sobre
 * la paleta de noche se aclaraba contra el fondo (el más parecido a ella) y
 * se quedaba corta sobre la tarjeta, que es más clara.
 */
export function textoDeMarca(marca: string, t: ModoTokens): string {
  const fondos = [t.bg, t.surface, t.surface2];
  let color = marca;
  for (let i = 0; i < fondos.length; i++) {
    const r = (fondo: string) => ratioContraste(color, fondo) ?? 0;
    const peor = fondos.reduce((p, f) => (r(f) < r(p) ? f : p));
    if (r(peor) >= 4.5) return color;
    color = colorLegibleSobre(color, peor);
  }
  return color;
}

/**
 * `marca=` del snippet: pisa el primario en la raíz del widget. El texto de
 * encima se deriva por luminancia —dejar el crema del tema sobre una marca
 * clara lo dejaba ilegible— y la marca como TEXTO se mide contra la paleta
 * que se ve (`tokens`): sin ella, `--portal-brand-texto` seguía siendo la del
 * estudio o la del estilo, y las cifras en marca no eran la marca del snippet.
 * `null` sin `marca=` (y fuera de `embed=1`, donde no se resuelve).
 */
export function varsMarcaWidget(marca: string | null | undefined, tokens: ModoTokens): Record<string, string> | null {
  if (!marca) return null;
  const l = luminancia(marca.slice(0, 7));
  return {
    '--portal-brand': marca,
    '--portal-brand-foreground': l != null && l < 0.45 ? '#FFFFFF' : '#22261F',
    '--portal-brand-texto': textoDeMarca(marca.slice(0, 7), tokens),
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
