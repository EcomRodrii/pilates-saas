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

export interface AparienciaWidget {
  /** `null` = el fondo del portal, como hasta ahora. */
  fondo: 'transparente' | string | null;
  /** Nombre de familia (Google Fonts). `null` = la tipografía del tema. */
  fuente: string | null;
  /** Radio de las esquinas en px. `null` = el del tema. */
  radio: number | null;
  /** El pie con dirección y legales. La web anfitriona ya suele tener el suyo. */
  ocultarPie: boolean;
  /** Enseñar SOLO la pestaña que pide `?tab=`, sin la barra de las otras. */
  soloPestana: boolean;
}

export const APARIENCIA_POR_DEFECTO: AparienciaWidget = {
  fondo: null, fuente: null, radio: null, ocultarPie: false, soloPestana: false,
};

/**
 * ⚠️ Un nombre de fuente llega por la URL de una página PÚBLICA, así que
 * cualquiera puede escribirlo. Se acota a letras, números y espacios: es lo que
 * cabe en un nombre de familia de Google Fonts, y deja fuera comillas, llaves y
 * paréntesis — o sea, todo lo que haría falta para salirse de la declaración
 * CSS o del `<link>` que la carga.
 */
const FUENTE_VALIDA = /^[A-Za-z0-9][A-Za-z0-9 ]{0,39}$/;
const COLOR_VALIDO = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export function fuenteValida(v: string): boolean {
  return FUENTE_VALIDA.test(v.trim());
}

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
  const pie = leerBooleano(params.get('pie'));
  const soloPestana = leerBooleano(params.get('solo-pestana'));

  return {
    fondo: fondo ?? base.fondo,
    fuente: fuente ?? base.fuente,
    radio: radio ?? base.radio,
    // `?pie=0` significa «sin pie», así que se invierte al guardarlo como
    // «ocultar». El parámetro se llama por lo que se ve, no por la variable.
    ocultarPie: pie === undefined ? base.ocultarPie : !pie,
    soloPestana: soloPestana ?? base.soloPestana,
  };
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
  return `'${a.fuente}', system-ui, sans-serif`;
}

/**
 * La URL de Google Fonts para cargarla, o `null`.
 *
 * Se vuelve a validar el nombre aunque ya haya pasado el filtro al resolverlo:
 * son dos puertas para lo mismo a propósito, porque esta cadena acaba en el
 * `href` de un `<link>` que se inyecta en el documento.
 *
 * ⚠️ Se codifica PRIMERO y se cambian los `%20` por `+` DESPUÉS. Al revés
 * —meter los `+` y luego codificar— salen `%2B` y Google Fonts devuelve un 400:
 * pedirías la familia «Space+Grotesk» con un signo más literal en el nombre.
 */
export function urlFuente(a: AparienciaWidget): string | null {
  if (!a.fuente || !fuenteValida(a.fuente)) return null;
  const familia = encodeURIComponent(a.fuente.trim()).replace(/%20/g, '+');
  return `https://fonts.googleapis.com/css2?family=${familia}:wght@400;500;600;700&display=swap`;
}
