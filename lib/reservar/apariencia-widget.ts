// Cómo se ve el widget de reservas DENTRO de la web del estudio.
//
// ⚠️ Existe porque el widget llevaba su propio decorado puesto y no había forma
// de quitarlo: fondo `#F6F7F9` opaco (una losa casi blanca sobre una web
// oscura), tipografía fija, el pie con la dirección y los legales repetidos
// —que la web anfitriona ya tiene— y las cuatro pestañas aunque se incrustara
// solo el horario. Medido, no supuesto.
//
// Y no se podía arreglar tocando el tema: el tema de Apariencia es del PORTAL
// de la socia. Cambiarlo para que pegue con la web del estudio le cambia la app
// a sus clientas. Son dos superficies distintas y necesitaban ajustes
// distintos.
//
// ⚠️ **La tipografía no se puede HEREDAR de la web anfitriona.** Un iframe es
// otro documento: `font-family: inherit` no cruza esa frontera, y no hay API
// que lo permita sin que el anfitrión colabore. Lo que sí funciona es que el
// estudio la NOMBRE («Space Grotesk») y la carguemos nosotros. La interfaz lo
// dice con esas palabras en vez de prometer una herencia que no existe.

// El regex de color Y el de fuente viven en config-widget.ts (módulo común de
// los dos modos de embebido, sin dependencias) — una sola puerta anti-XSS, no
// dos copias. `fuenteValida` se reexporta para no romper a quien ya lo
// importaba de aquí.
import { COLOR_VALIDO, fuenteValida, familiaCssDe, urlFuenteGoogle } from './config-widget.ts';

export { fuenteValida };

export interface AparienciaWidget {
  /** `null` = el fondo del portal, como hasta ahora. */
  fondo: 'transparente' | string | null;
  /** Nombre de familia (Google Fonts) para el cuerpo/UI. `null` = la del tema. */
  fuente: string | null;
  /** Radio de las esquinas de TARJETAS en px. `null` = el del tema. */
  radio: number | null;
  /** El pie con dirección y legales. La web anfitriona ya suele tener el suyo. */
  ocultarPie: boolean;
  /** Enseñar SOLO la pestaña que pide `?tab=`, sin la barra de las otras. */
  soloPestana: boolean;
  /**
   * El color del TEXTO. `claro` = letra clara, para una web oscura.
   *
   * ⚠️ `auto` NO adivina el fondo de la web anfitriona — no se puede: un iframe
   * no ve el documento que lo contiene. Solo deduce del fondo que el estudio
   * haya elegido AQUÍ. Con «transparente» no hay nada que deducir y se queda en
   * oscuro, que es como se veía siempre.
   */
  texto: 'auto' | 'claro' | 'oscuro';
  // Fase 1 del rediseño (docs/widget-reservas-theme-builder-diseno.md §3):
  // extensión ADITIVA — todo `null` = el aspecto de MODO_TOKENS.dia/.noche de
  // siempre, cero cambio visual para quien no los toque.
  /** Fuente de titulares/horas/precios. `null` = la misma que `fuente`. */
  fuenteDisplay: string | null;
  /** Radio de BOTONES en px. `null` = píldora, como hasta ahora. */
  radioBoton: number | null;
  /** Radio de INPUTS/chips de día en px. `null` = el de `radio`. */
  radioInput: number | null;
  /** Fondo de tarjetas/inputs. `null` = blanco (o el oscuro de la paleta noche). */
  superficie: string | null;
  /** Color del texto principal. `null` = el de la paleta. */
  tinta: string | null;
  /** Color del texto secundario/muted. `null` = el de la paleta. */
  textoSecundario: string | null;
  /** Color de bordes y separadores. `null` = el de la paleta. */
  linea: string | null;
  /** Relleno suave (chips, notas, skeleton). `null` = el de la paleta. */
  relleno: string | null;
}

export const APARIENCIA_POR_DEFECTO: AparienciaWidget = {
  fondo: null, fuente: null, radio: null, ocultarPie: false, soloPestana: false, texto: 'auto',
  fuenteDisplay: null, radioBoton: null, radioInput: null,
  superficie: null, tinta: null, textoSecundario: null, linea: null, relleno: null,
};

function leerFondo(v: string | null): AparienciaWidget['fondo'] | undefined {
  if (v == null) return undefined;
  const t = v.trim();
  if (t === 'transparente') return 'transparente';
  return COLOR_VALIDO.test(t) ? t : undefined;
}

function leerBooleano(v: string | null): boolean | undefined {
  if (v == null) return undefined;
  // Solo '1' y '0'. Un `Boolean('false')` es `true`, y ese fallo aquí dejaría
  // el pie escondido para siempre en cuanto alguien escribiera `pie=false`.
  return v === '1' ? true : v === '0' ? false : undefined;
}

function leerRadio(v: string | null): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  // Tope a 32: por encima las tarjetas se vuelven cápsulas y el widget deja de
  // parecerse a lo que la propietaria vio en la vista previa.
  return Number.isInteger(n) && n >= 0 && n <= 32 ? n : undefined;
}

/** Igual que `leerFondo`, para un color que NO admite 'transparente'. */
function leerColor(v: string | null): string | undefined {
  if (v == null) return undefined;
  const t = v.trim();
  return COLOR_VALIDO.test(t) ? t : undefined;
}

/** Lo mínimo que hace falta de la URL. Un `URLSearchParams` encaja tal cual. */
export interface ParamsWidget {
  get(nombre: string): string | null;
}

/**
 * Los ajustes guardados, con los parámetros de la URL pisando encima.
 *
 * ⚠️ **La URL gana, pero solo con un valor VÁLIDO.** Un parámetro con basura se
 * ignora y queda lo guardado — nunca se cae a un valor por defecto. Si
 * `?fondo=azul` apagara el color que el estudio eligió, un error de tecleo en
 * el snippet le rompería la web sin decir nada.
 */
export function resolverApariencia(
  guardado: Partial<AparienciaWidget> | null | undefined,
  params?: ParamsWidget | null,
): AparienciaWidget {
  const base: AparienciaWidget = { ...APARIENCIA_POR_DEFECTO, ...(guardado ?? {}) };
  if (!params) return base;

  const fondo = leerFondo(params.get('fondo'));
  const fuenteCruda = params.get('fuente');
  const fuente = fuenteCruda != null && fuenteValida(fuenteCruda) ? fuenteCruda.trim() : undefined;
  const radio = leerRadio(params.get('radio'));
  const textoCrudo = params.get('texto');
  const texto = textoCrudo === 'claro' || textoCrudo === 'oscuro' || textoCrudo === 'auto'
    ? textoCrudo : undefined;
  const pie = leerBooleano(params.get('pie'));
  const soloPestana = leerBooleano(params.get('solo-pestana'));
  // Fase 1 rediseño widget — mismos parámetros de URL que el resto, para que
  // el iframe de vista previa del Theme Builder (WidgetPreview) pueda mostrar
  // un borrador sin publicarlo primero.
  const fuenteDisplayCruda = params.get('fuente-display');
  const fuenteDisplay = fuenteDisplayCruda != null && fuenteValida(fuenteDisplayCruda) ? fuenteDisplayCruda.trim() : undefined;
  const radioBoton = leerRadio(params.get('radio-boton'));
  const radioInput = leerRadio(params.get('radio-input'));
  const superficie = leerColor(params.get('superficie'));
  const tinta = leerColor(params.get('tinta'));
  const textoSecundario = leerColor(params.get('texto-secundario'));
  const linea = leerColor(params.get('linea'));
  const relleno = leerColor(params.get('relleno'));

  return {
    fondo: fondo ?? base.fondo,
    fuente: fuente ?? base.fuente,
    radio: radio ?? base.radio,
    // `?pie=0` significa «sin pie», así que se invierte al guardarlo como
    // «ocultar». El parámetro se llama por lo que se ve, no por la variable.
    ocultarPie: pie === undefined ? base.ocultarPie : !pie,
    soloPestana: soloPestana ?? base.soloPestana,
    texto: texto ?? base.texto,
    fuenteDisplay: fuenteDisplay ?? base.fuenteDisplay,
    radioBoton: radioBoton ?? base.radioBoton,
    radioInput: radioInput ?? base.radioInput,
    superficie: superficie ?? base.superficie,
    tinta: tinta ?? base.tinta,
    textoSecundario: textoSecundario ?? base.textoSecundario,
    linea: linea ?? base.linea,
    relleno: relleno ?? base.relleno,
  };
}

/**
 * Luminancia relativa de un `#rrggbb` (0 = negro, 1 = blanco).
 *
 * Fórmula estándar de sRGB, no la media de los canales: el verde pesa siete
 * veces más que el azul para el ojo, y una media haría pasar por «claro» un
 * azul intenso sobre el que la letra oscura no se lee.
 */
export function luminancia(hex: string): number | null {
  const m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/**
 * Qué paleta del portal usa el widget: `noche` pinta la letra clara.
 *
 * ⚠️ Con el fondo TRANSPARENTE, `auto` se queda en `dia` (letra oscura). No es
 * una elección estética: es que no hay ningún dato con el que decidir, y
 * adivinar «probablemente su web es clara» dejaría ilegible a quien la tenga
 * oscura sin avisar. El panel empuja a elegir explícitamente en ese caso.
 */
export function modoTextoDe(a: AparienciaWidget): 'dia' | 'noche' {
  if (a.texto === 'claro') return 'noche';
  if (a.texto === 'oscuro') return 'dia';
  // auto: solo se deduce de un fondo que conozcamos.
  if (typeof a.fondo === 'string' && a.fondo !== 'transparente') {
    const l = luminancia(a.fondo);
    if (l != null) return l < 0.45 ? 'noche' : 'dia';
  }
  return 'dia';
}

/** El valor de `background` para la raíz del widget, o `null` si no se toca. */
export function fondoCss(a: AparienciaWidget): string | null {
  if (a.fondo === 'transparente') return 'transparent';
  return a.fondo ?? null;
}

/**
 * El `font-family` completo, con la pila de reserva detrás.
 *
 * La fuente elegida puede tardar en cargar o no existir; sin reserva, ese rato
 * se ve en Times New Roman, que es peor que la tipografía de Tentare.
 */
export function familiaCss(a: AparienciaWidget): string | null {
  if (!a.fuente) return null;
  return familiaCssDe(a.fuente);
}

/**
 * La URL de Google Fonts para cargarla, o `null`. La construcción (y la
 * segunda puerta de validación, ver su comentario) vive en `urlFuenteGoogle`
 * (config-widget.ts) — compartida con el bundle de Modo B.
 */
export function urlFuente(a: AparienciaWidget): string | null {
  return urlFuenteGoogle(a.fuente);
}

/** Igual que `familiaCss`, para la fuente de titulares/horas/precios. */
export function familiaDisplayCss(a: AparienciaWidget): string | null {
  if (!a.fuenteDisplay) return null;
  return familiaCssDe(a.fuenteDisplay);
}

/** Igual que `urlFuente`, para la fuente de titulares/horas/precios. */
export function urlFuenteDisplay(a: AparienciaWidget): string | null {
  return urlFuenteGoogle(a.fuenteDisplay);
}

/**
 * Los tokens de RADIO resueltos, con el valor de siempre como fallback: sin
 * tocar nada, `radioBoton`/`radioInput` heredan de `radio` (que a su vez
 * hereda del tema si tampoco está puesto) — un estudio que solo cambia
 * `radio` sigue viendo un widget coherente, no tarjetas de un radio y botones
 * de otro por accidente.
 */
export function radiosDe(a: AparienciaWidget, porDefecto: { tarjeta: number; boton: number; input: number }) {
  return {
    tarjeta: a.radio ?? porDefecto.tarjeta,
    boton: a.radioBoton ?? a.radio ?? porDefecto.boton,
    input: a.radioInput ?? a.radio ?? porDefecto.input,
  };
}

/**
 * Los tokens de COLOR resueltos, con la paleta día/noche (`lib/portal-paleta.ts`)
 * como fallback — nunca un color a medias: si el estudio no toca ninguno de
 * los 5 controles nuevos, esto devuelve exactamente `porDefecto`.
 */
export function coloresDe(a: AparienciaWidget, porDefecto: {
  superficie: string; tinta: string; textoSecundario: string; linea: string; relleno: string;
}) {
  return {
    superficie: a.superficie ?? porDefecto.superficie,
    tinta: a.tinta ?? porDefecto.tinta,
    textoSecundario: a.textoSecundario ?? porDefecto.textoSecundario,
    linea: a.linea ?? porDefecto.linea,
    relleno: a.relleno ?? porDefecto.relleno,
  };
}
