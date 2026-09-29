// Tentare Widgets — el código que se copia.
//
// Funciones puras: widget + config → el texto EXACTO que la propietaria pega en
// su web. Lo que genera aquí es lo que el motor lee de verdad:
//  - la URL del iframe/popup la lee app/reservar/[slug]/page.tsx con
//    `resolverConfigWidget` + `resolverApariencia` (mismo vocabulario de
//    siempre: un snippet ya pegado sigue funcionando igual);
//  - los `data-*` de la integración nativa los lee app/widget-bundle/main.tsx;
//  - `data-tentare-popup` lo lee app/widget-bundle/popup.ts.
//
// ⚠️ Un default NO se emite (contrato del constructor desde 2026-08-20): sin
// tocar nada, el código se comporta exactamente como el widget de siempre. La
// única excepción es la etiqueta de seguimiento (`ref`), que no cambia nada
// de lo que se ve y es lo que permite medir cada widget por separado.
//
// Las plataformas de aquí (HTML, WordPress, Webflow, React) son variantes del
// CÓDIGO: en WordPress y Webflow es el mismo que en HTML y en React cambia.
// Con qué está hecha la web de la dueña y sus pasos viven en ./recetas.ts.

import { luminancia } from '../reservar/apariencia-widget.ts';
import { COLOR_VALIDO, fuenteValida, nativaTraeDisenoPropio } from '../reservar/config-widget.ts';
import { scriptSnippetIframe } from '../reservar/snippet-embed.ts';
import { PARAM_BORRADOR, borradorAParam, type WidgetWeb } from '../reservar/estilo-web-tipos.ts';
import { RADIO_BOTON, VAR_FONDO, VAR_RADIO, VAR_TEXTO, leerBotonVivo, type BotonVivo } from './boton-vivo.ts';
import type { MetodoIntegracion, WidgetDisponible } from './catalogo.ts';
import {
  anchoPopupDe, anchoPorDefecto, etiquetaEfectiva, textoBotonEfectivo, type ConfigConstructor,
} from './config.ts';
import { firmaDeUrl } from './firma-contenido.ts';
import { huella } from './huella.ts';
import { PARAM_PIEZA, esIdPieza } from './pieza.ts';

export type Plataforma = 'html' | 'wordpress' | 'webflow' | 'react';

export interface EntradaIntegracion {
  widget: WidgetDisponible;
  config: ConfigConstructor;
  /** Origen de Tentare (el de `LEGAL.url` en producción). */
  origen: string;
  slug: string;
  /** El color de marca del estudio, para botones con su identidad. */
  colorEstudio?: string | null;
  /**
   * El botón de la ventana como se ve HOY (`botonDeLaVentana`,
   * lib/reservar/estilo-web.ts): el respaldo del código de un popup que sigue
   * el estilo de sus widgets (`botonSigueElEstilo`). Sin él (cargando, o un
   * valor que no valida), el respaldo es el de siempre (`colorBoton`).
   */
  botonVivo?: BotonVivo | null;
  /**
   * El id de lo publicado de este widget (`widget_piezas`, ./pieza.ts). Con él,
   * el código lleva SOLO el id y lo que va en el propio HTML (el ancho, la carga
   * diferida, el botón…); el contenido lo pone Tentare al abrirlo, así que
   * cambiarlo ya no obliga a pegarlo otra vez. Sin él (no hay nada publicado, o
   * no se pudo crear), el código congelado de siempre, que funciona igual.
   */
  pieza?: string | null;
}

/** ¿Este código va por id? */
export function codigoPorId(e: EntradaIntegracion): boolean {
  return esIdPieza(e.pieza);
}

/**
 * La URL de un código por id: solo `w=<id>` (y `embed=1` dentro de una página).
 * El resto lo añade la ruta de Tentare al abrirla (lib/widgets/pieza-destino.ts).
 * El popup no lleva `embed`: lo añade su runtime, como a cualquier código.
 */
function urlDePieza(e: EntradaIntegracion, embebido: boolean): string {
  return `${e.origen}/reservar/${e.slug}?${embebido ? 'embed=1&' : ''}${PARAM_PIEZA}=${e.pieza}`;
}

const COLOR_POR_DEFECTO = '#343825';

// ── Parámetros ────────────────────────────────────────────────────────────────

const color = (v: string | null) => (v && COLOR_VALIDO.test(v) ? v : null);
const familia = (v: string | null) => (v && fuenteValida(v) ? v.trim() : null);

/** Pares `[nombre, valor]` ya validados; `encodeURIComponent` se aplica al unir. */
type Par = [string, string];

function paresContenido(e: EntradaIntegracion, metodo: MetodoIntegracion): Par[] {
  const { widget: w, config: c } = e;
  const p: Par[] = [];
  if (w.contenido.includes('horario')) {
    // El calendario semanal sustituye a la lista entera: con él, la vista
    // inicial y el diseño de la lista no pintan nada y no se emiten. La nativa
    // (el bundle) no lo entiende, así que ahí manda la lista de siempre.
    const semana = metodo !== 'nativa' && c.presentacion === 'semana';
    if (semana) p.push(['presentacion', 'semana']);
    if (!semana && c.vista === 'hoy') p.push(['vista', 'hoy']);
    if (c.tipos.length) p.push(['tipos', c.tipos.join(',')]);
    if (c.instructoras.length) p.push(['instructoras', c.instructoras.join(',')]);
    if (c.salas.length) p.push(['salas', c.salas.join(',')]);
    if (!c.mostrarPrecio) p.push(['ocultar-precio', '1']);
    if (!c.mostrarNivel) p.push(['ocultar-nivel', '1']);
    if (!c.mostrarSustituta) p.push(['ocultar-sustituta', '1']);
    // El default del iframe es 'completo'; el de la nativa, 'ligero'.
    const defecto = metodo === 'nativa' ? 'ligero' : 'completo';
    if (!semana && c.diseno && c.diseno !== defecto) p.push(['diseno', c.diseno]);
  }
  const tiposPlan = w.tiposPlanFijos ?? (w.contenido.includes('tiposPlan') ? c.tiposPlan : []);
  if (tiposPlan.length) p.push(['planes', tiposPlan.join(',')]);
  return p;
}

/**
 * ¿Lleva su código un diseño propio? Entonces el estilo de los widgets de su
 * web no le llega. Es la pregunta que se hace quien pinta, vista desde el
 * panel, y sale de lo que de verdad se EMITE con ese método, no de `identidad`:
 *  - dentro de una página y encima (y lo que no tiene método aquí: botón y
 *    enlace), los parámetros de diseño de su URL, como /reservar
 *    (`urlTraeDisenoPropio`, lib/reservar/estilo-web.ts);
 *  - sin marco (Fase E), los `data-*` de diseño, como el bundle
 *    (`nativaTraeDisenoPropio`, lib/reservar/config-widget.ts). No es lo mismo:
 *    la nativa solo entiende marca, fondo, tinta y letra, así que «propia» con
 *    solo una superficie no emite nada en ella y sigue el estilo, aunque en el
 *    iframe sea un diseño propio.
 * «Propia» sin tocar nada no emite nada en ningún método y sigue su estilo.
 */
export function tieneDisenoEnCodigo(c: ConfigConstructor, metodo: MetodoIntegracion = 'iframe'): boolean {
  if (metodo === 'nativa') return nativaTraeDisenoPropio(lectorDePares(paresDisenoNativa(c)));
  return paresDiseno(c).length > 0;
}

function paresDiseno(c: ConfigConstructor): Par[] {
  if (c.identidad !== 'propia') return [];
  const p: Par[] = [];
  const marca = color(c.marca);
  if (marca) p.push(['marca', marca]);
  if (c.fondo === 'transparente') p.push(['fondo', 'transparente']);
  else if (color(c.fondo)) p.push(['fondo', c.fondo!]);
  const tinta = color(c.tinta);
  if (tinta) p.push(['tinta', tinta]);
  const superficie = color(c.superficie);
  if (superficie) p.push(['superficie', superficie]);
  const linea = color(c.linea);
  if (linea) p.push(['linea', linea]);
  // «Tema claro» = para una web clara = letra OSCURA. El parámetro del motor
  // se llama por el color del texto (`texto`), no por el del tema.
  if (c.tema === 'claro') p.push(['texto', 'oscuro']);
  if (c.tema === 'oscuro') p.push(['texto', 'claro']);
  if (c.forma) p.push(['forma', c.forma]);
  if (c.densidad) p.push(['densidad', c.densidad]);
  const fuente = familia(c.fuente);
  if (fuente) p.push(['fuente', fuente]);
  const fuenteDisplay = familia(c.fuenteDisplay);
  if (fuenteDisplay) p.push(['fuente-display', fuenteDisplay]);
  return p;
}

// Las listas de ids (`tipos=a,b`) se dejan con la coma a la vista: los ids ya
// vienen filtrados a letras/números/guiones y así el código se puede leer.
function unir(pares: Par[]): string {
  return pares
    .map(([k, v]) => `${k}=${encodeURIComponent(v).replace(/%2C/g, ',')}`)
    .join('&');
}

/** La pestaña del motor para este widget y esta config. */
function tabEmbebido(e: EntradaIntegracion): string {
  if (e.widget.contenido.includes('cuentaInicio')) return e.config.cuentaInicio === 'bonos' ? 'cuenta' : 'misreservas';
  return e.widget.embebido.tab;
}

/** La URL del widget incrustado (iframe y popup). */
export function urlEmbebido(e: EntradaIntegracion, metodo: MetodoIntegracion = 'iframe'): string {
  const { widget: w, config: c } = e;
  const pares: Par[] = [['embed', '1'], ['tab', tabEmbebido(e)]];
  for (const [k, v] of Object.entries(w.embebido.extra ?? {})) pares.push([k, v]);
  if (w.contenido.includes('sesion') && c.sesion) pares.push(['sesion', c.sesion]);
  pares.push(...paresContenido(e, metodo), ...paresDiseno(c));
  if (!c.mostrarPie) pares.push(['pie', '0']);
  const ref = etiquetaEfectiva(c, w);
  if (ref) pares.push(['ref', ref]);
  return `${e.origen}/reservar/${e.slug}?${unir(pares)}`;
}

/**
 * La página de reservas COMPLETA (enlace y botón). Los filtros y el diseño del
 * widget NO viajan aquí: la página completa es el portal del estudio con su
 * propia apariencia, y el motor solo los lee en modo incrustado.
 *
 * La excepción es la presentación del horario (`presentacion=semana`): no es
 * un filtro ni apariencia, es cómo se lee el mismo horario, y la página la
 * honra también fuera del modo incrustado (`leerPresentacion`).
 */
export function urlPagina(e: EntradaIntegracion): string {
  const { widget: w, config: c } = e;
  const pares: Par[] = [];
  const tab = w.contenido.includes('cuentaInicio')
    ? (c.cuentaInicio === 'bonos' ? 'cuenta' : 'misreservas')
    : w.pagina.tab;
  if (tab && tab !== 'clases') pares.push(['tab', tab]);
  for (const [k, v] of Object.entries(w.pagina.extra ?? {})) pares.push([k, v]);
  if (w.contenido.includes('horario') && c.presentacion === 'semana') pares.push(['presentacion', 'semana']);
  if (w.contenido.includes('sesion') && c.sesion) pares.push(['sesion', c.sesion]);
  const ref = etiquetaEfectiva(c, w);
  if (ref) pares.push(['ref', ref]);
  const query = pares.length ? `?${unir(pares)}` : '';
  const ancla = w.pagina.ancla ? `#${w.pagina.ancla}` : '';
  return `${e.origen}/reservar/${e.slug}${query}${ancla}`;
}

/**
 * La misma URL marcada como vista previa del panel (`vista-previa=1`): la
 * página no cuenta la visita (lib/reservar/eventos.ts). Solo para el panel —
 * nunca entra en el código que se copia.
 *
 * Con `borradorWeb`, además, el estilo de los widgets que la dueña está
 * probando y aún no ha aplicado (`borrador-web=`): sustituye a lo publicado
 * solo en esta vista previa, aunque sea «nada elegido» (entonces enseña la
 * app). /reservar solo lo lee junto a `embed=1&vista-previa=1`.
 */
export function conVistaPrevia(url: string, opc?: { borradorWeb?: WidgetWeb }): string {
  const [sinAncla, ancla] = url.split('#');
  const borrador = opc?.borradorWeb ? `&${PARAM_BORRADOR}=${encodeURIComponent(borradorAParam(opc.borradorWeb))}` : '';
  return `${sinAncla}${sinAncla.includes('?') ? '&' : '?'}vista-previa=1${borrador}${ancla ? `#${ancla}` : ''}`;
}

/**
 * La parte de diseño de los `data-*` de la nativa, solo con «propia». La
 * nativa solo entiende marca, fondo, tinta (`negro`) y tipografías: el resto de
 * ajustes de diseño no se ofrecen con este método. Un fondo `transparente` no
 * se emite: sin atributo, el lienzo de la nativa ya deja ver su web.
 */
function paresDisenoNativa(c: ConfigConstructor): Par[] {
  if (c.identidad !== 'propia') return [];
  const p: Par[] = [];
  const marca = color(c.marca);
  const fondo = color(c.fondo);
  const tinta = color(c.tinta);
  const fuente = familia(c.fuente);
  const fuenteDisplay = familia(c.fuenteDisplay);
  if (marca) p.push(['marca', marca]);
  if (fondo) p.push(['fondo', fondo]);
  if (tinta) p.push(['negro', tinta]);
  if (fuente) p.push(['fuente', fuente]);
  if (fuenteDisplay) p.push(['fuente-display', fuenteDisplay]);
  return p;
}

/**
 * Los `data-*` de la nativa (sin el `data-studio`) como los leerá `dataset` en
 * su web: el nombre en kebab, el valor SIN escapar y, un booleano a pelo
 * (`data-ocultar-precio`), con valor `''`, que es lo que da el navegador y lo
 * que el parser cuenta como «sí».
 *
 * Es la fuente de las dos cosas que tienen que coincidir: el código que se
 * copia (`atributosNativa`) y la versión que el bundle dirá ver en su web
 * (`firmaContenidoDe`, calculada allí con `firmaDeUrl` sobre su `dataset`).
 */
export function paresNativa(e: EntradaIntegracion): Par[] {
  const { widget: w, config: c } = e;
  const p: Par[] = [];
  for (const [k, v] of paresContenido(e, 'nativa')) p.push([k, v === '1' && k.startsWith('ocultar-') ? '' : v]);
  p.push(...paresDisenoNativa(c));
  // Con la identidad del estudio, el propio widget toma el color de la marca
  // y la letra de la web donde vive (app/widget-bundle/main.tsx).
  if (c.identidad !== 'propia') p.push(['identidad', 'estudio']);
  const ref = etiquetaEfectiva(c, w);
  if (ref) p.push(['ref', ref]);
  return p;
}

/**
 * Unos pares como los lee `dataset` (o `URLSearchParams`): la primera
 * aparición de cada nombre. Para preguntarle a las reglas del vocabulario
 * (`nativaTraeDisenoPropio`, `resolverConfigWidget`, `firmaDeUrl`) por lo que
 * se emite, sin montar un DOM.
 */
export function lectorDePares(p: readonly (readonly [string, string])[]): { get(k: string): string | null } {
  return { get: (k: string) => p.find(([x]) => x === k)?.[1] ?? null };
}

/**
 * Atributos `data-*` de la integración nativa (sin el `data-studio`), tal
 * cual van en el código: los de `paresNativa`, escapados. Solo los booleanos
 * `ocultar-*` van a pelo, como siempre: un `data-tipos=""` (una lista vacía
 * escrita a mano) se queda con su `=""` y el código copiado no cambia ni un
 * carácter. Para `dataset` los dos son `''`.
 */
export function atributosNativa(e: EntradaIntegracion): string[] {
  return paresNativa(e).map(([k, v]) => (v === '' && k.startsWith('ocultar-') ? `data-${k}` : `data-${k}="${escaparAtributo(v)}"`));
}

// ── Utilidades de texto ───────────────────────────────────────────────────────

/**
 * Una URL dentro de un atributo HTML. Se deja el `&` a la vista (válido en
 * HTML5 y legible para quien lo pega); lo único que podría cerrar el atributo
 * es una comilla, y ninguno de los valores validados la lleva — aun así se
 * codifica por si acaso.
 */
function urlEnAtributo(url: string): string {
  return url.replace(/"/g, '%22').replace(/</g, '%3C').replace(/>/g, '%3E');
}

export function escaparAtributo(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escaparTexto(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
/** Para un literal de JS/JSX entre comillas simples. */
function jsString(v: string): string {
  return `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

export function idIframe(e: EntradaIntegracion): string {
  // Por id, el del propio id: el de siempre lleva la clase elegida, y con él
  // cambiar de clase obligaría a pegarlo otra vez.
  if (codigoPorId(e)) return `tentare-widget-${e.slug}-${e.pieza}`;
  const base = `tentare-widget-${e.slug}-${e.widget.id}`;
  return e.widget.contenido.includes('sesion') && e.config.sesion ? `${base}-${e.config.sesion}` : base;
}

function anchoMaximoPx(e: EntradaIntegracion): number | null {
  const ancho = e.config.ancho ?? anchoPorDefecto(e.widget, e.config);
  return ancho === 'compacto' ? 480 : null;
}

/** El color del botón: la marca propia si la hay, si no la del estudio. */
export function colorBoton(e: EntradaIntegracion): string {
  return (e.config.identidad === 'propia' ? color(e.config.marca) : null)
    ?? color(e.colorEstudio ?? null) ?? COLOR_POR_DEFECTO;
}

export interface EstiloBoton {
  background: string;
  color: string;
  border: string;
  borderRadius: string;
}

/**
 * ¿Sigue el botón de este código el estilo de sus widgets (Fase D)? Solo el que
 * abre la ventana (popup) y sin diseño propio: la misma regla con la que el
 * estilo le llega a lo de dentro (`tieneDisenoEnCodigo`). El botón a la página
 * (`<a>`) no carga ningún script que lo pinte, y un diseño propio es un color
 * congelado a propósito.
 *
 * Es el predicado que emite las variables en el código Y el que marca la copia
 * (`copiado.botonVivo`, ./config.ts): lo que el panel dice de un botón pegado
 * no puede contradecir lo que se copió.
 */
export function botonSigueElEstilo(c: ConfigConstructor, metodo: MetodoIntegracion): boolean {
  return metodo === 'popup' && !tieneDisenoEnCodigo(c);
}

/**
 * El botón pintado con LITERALES: el respaldo del código. Si sigue el estilo
 * (`botonSigueElEstilo`) y hay `botonVivo` válido, el botón de la ventana como
 * se ve hoy; si no, lo de siempre (su marca o la del estudio, texto por
 * luminancia y el radio de su «forma»). Lo usan la vista previa del panel y los
 * tests; el código lleva además las variables (`estiloBotonCodigo`).
 */
export function estiloBoton(e: EntradaIntegracion, metodo: MetodoIntegracion = 'boton'): EstiloBoton {
  const vivo = botonSigueElEstilo(e.config, metodo) ? leerBotonVivo(e.botonVivo) : null;
  const marca = vivo?.fondo ?? colorBoton(e);
  const l = luminancia(marca);
  const sobreMarca = vivo?.texto ?? (l != null && l < 0.45 ? '#FFFFFF' : '#22261F');
  const radio = vivo ? RADIO_BOTON[vivo.esquinas]
    : e.config.forma === 'recto' ? '6px' : e.config.forma === 'redondeado' ? '12px' : '999px';
  return e.config.estiloBoton === 'contorno'
    ? { background: 'transparent', color: marca, border: `1.5px solid ${marca}`, borderRadius: radio }
    : { background: marca, color: sobreMarca, border: `1.5px solid ${marca}`, borderRadius: radio };
}

/**
 * Las cuatro propiedades de color y esquinas del botón: el literal y, si la
 * tiene, su versión con variable y el MISMO literal de respaldo. El fondo del
 * contorno es `transparent` en cualquier estilo: no lleva variable.
 */
function propiedadesBoton(e: EntradaIntegracion, metodo: MetodoIntegracion): { css: string; react: string; literal: string; vivo: string | null }[] {
  const s = estiloBoton(e, metodo);
  const contorno = e.config.estiloBoton === 'contorno';
  // El color del botón: el fondo con relleno, el texto (y el borde) con contorno.
  const marca = contorno ? s.color : s.background;
  return [
    { css: 'background', react: 'background', literal: s.background, vivo: contorno ? null : `var(${VAR_FONDO},${marca})` },
    { css: 'color', react: 'color', literal: s.color, vivo: `var(${contorno ? VAR_FONDO : VAR_TEXTO},${s.color})` },
    { css: 'border', react: 'border', literal: s.border, vivo: `1.5px solid var(${VAR_FONDO},${marca})` },
    { css: 'border-radius', react: 'borderRadius', literal: s.borderRadius, vivo: `var(${VAR_RADIO},${s.borderRadius})` },
  ];
}

/**
 * Las declaraciones de color y esquinas del `style` HTML del botón.
 *
 * Sin seguir el estilo, una vez cada una y literales: lo de siempre, carácter
 * por carácter. Siguiéndolo, CADA propiedad DOS veces: primero el hex literal y
 * después el `var()` con el MISMO respaldo. El navegador se queda con la
 * segunda (la que rellena `widget-popup.js`); un filtro de HTML que se coma las
 * declaraciones con `var()` (KSES de un WordPress sin `unfiltered_html`) deja
 * la primera, y el botón se ve como un código de antes: con su color, congelado.
 * Y como ya no lee ninguna variable, el script no pide nada
 * (`usaBotonVivo`, ./boton-vivo.ts).
 */
function estiloBotonCodigo(e: EntradaIntegracion, metodo: MetodoIntegracion): string {
  const sigue = botonSigueElEstilo(e.config, metodo);
  return propiedadesBoton(e, metodo)
    .map(p => `${p.css}:${p.literal};${sigue && p.vivo ? `${p.css}:${p.vivo};` : ''}`)
    .join('');
}

// `font:inherit` a propósito: el botón toma la letra de la web donde vive.
// 44 px de alto mínimo: es un objetivo táctil.
function cssBoton(e: EntradaIntegracion, metodo: MetodoIntegracion): string {
  return [
    'display:inline-flex', 'align-items:center', 'justify-content:center', 'min-height:44px',
    'padding:10px 22px', 'font:inherit', 'font-weight:600', 'font-size:15px', 'line-height:1.2',
    'text-decoration:none', 'cursor:pointer',
  ].join(';') + ';' + estiloBotonCodigo(e, metodo);
}

/**
 * El mismo botón, como objeto de estilo de React. Aquí NO hay doble
 * declaración: un objeto no puede repetir claves. Siguiendo el estilo, SOLO el
 * `var()` con su respaldo (`'var(--tentare-boton,#343825)'`), que en un
 * navegador sin la variable vale el literal. No hace falta más: una web hecha
 * en React no pasa su código por un filtro de HTML que se lo coma.
 */
function objetoEstiloReact(e: EntradaIntegracion, metodo: MetodoIntegracion): string {
  const sigue = botonSigueElEstilo(e.config, metodo);
  const colores = propiedadesBoton(e, metodo)
    .map(p => `${p.react}: ${jsString(sigue && p.vivo ? p.vivo : p.literal)}`)
    .join(', ');
  return `{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 44, padding: '10px 22px', font: 'inherit', fontWeight: 600, fontSize: 15, lineHeight: 1.2, textDecoration: 'none', cursor: 'pointer', ${colores} }`;
}

/** Nombre de componente React para el widget: `TentareHorarioYReservas`. */
function nombreComponente(w: WidgetDisponible): string {
  const limpio = w.nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 ]/g, ' ');
  return `Tentare${limpio.split(/\s+/).filter(Boolean).map(p => p[0].toUpperCase() + p.slice(1)).join('')}`;
}

// ── Generación ────────────────────────────────────────────────────────────────

export type Lenguaje = 'html' | 'jsx' | 'url';

export interface CodigoGenerado {
  codigo: string;
  lenguaje: Lenguaje;
}

/** Qué plataformas tienen sentido para un método (el enlace no se «instala»). */
export function plataformasDe(metodo: MetodoIntegracion): Plataforma[] {
  return metodo === 'enlace' ? [] : ['html', 'wordpress', 'webflow', 'react'];
}

/**
 * Lo que falta para poder dar un código que funcione, o `null` si nada.
 * Dar un código que no va a funcionar es peor que no darlo todavía.
 */
export function faltaParaGenerar(
  e: EntradaIntegracion,
  metodo: MetodoIntegracion,
  opts: { dominiosAutorizados: readonly string[] },
): string | null {
  if (e.widget.contenido.includes('sesion') && !e.config.sesion) {
    return 'Elige la clase para tener el código.';
  }
  if (metodo === 'nativa' && opts.dominiosAutorizados.length === 0) {
    return 'Para usarlo sin marco, autoriza antes el dominio de tu web.';
  }
  return null;
}

// ── Huella de lo copiado ──────────────────────────────────────────────────────

/**
 * La huella de lo que va en el código de este widget con esta forma, para
 * avisar si cambia después de copiarlo. Fuera de ella, a propósito:
 *  - el origen de Tentare (el mismo código copiado desde otra dirección de la
 *    app es el mismo código);
 *  - el `style` del BOTÓN (popup y botón), que lleva el color de marca del
 *    estudio: ese se cambia en Apariencia, no aquí, y no debe saltar como «has
 *    cambiado algo». Lo que ella elige para el botón sí cuenta (abajo). Con
 *    más razón desde la Fase D: el `style` de un popup que sigue el estilo
 *    lleva de respaldo el color de su botón el día que se copió
 *    (`botonVivo`), que cambia al aplicar otro estilo en su web; contarlo
 *    daría por «cambiado después de copiarlo» a todo popup ya copiado. La
 *    doble declaración tampoco cambia la huella: va toda dentro del `style`.
 * ⚠️ El `style` del iframe sí va dentro: lleva el «Ancho» (`max-width`), que
 * es un ajuste suyo con la etiqueta «Va en el código».
 */
export function firmaCodigo(e: EntradaIntegracion, metodo: MetodoIntegracion): string {
  const c = e.config;
  const crudo = generarCodigo(e, metodo, 'html').codigo.split(e.origen).join('');
  const codigo = metodo === 'popup' || metodo === 'boton' ? crudo.replace(/ style="[^"]*"/g, '') : crudo;
  const boton = metodo === 'popup' || metodo === 'boton'
    ? [c.estiloBoton, c.identidad === 'propia' ? `${c.marca ?? ''}|${c.forma ?? ''}` : ''].join('|')
    : '';
  return huella(`${metodo}\n${codigo}\n${boton}`);
}

/**
 * La huella de lo que la PÁGINA entiende de este código (`firmaDeUrl`,
 * ./firma-contenido.ts): la misma que calcula quien pinta al cargar dentro de
 * su web. Es la que dice qué versión se ve allí; `firmaCodigo` sigue diciendo
 * si algo cambió aquí después de copiarlo.
 *
 *  - Dentro de una página y encima: /reservar, sobre su propia URL. Los dos
 *    cargan `urlEmbebido`, que es lo que llega entero a la página (el popup,
 *    reescrito por `urlPopupPermitida`, pero con los mismos valores).
 *  - Sin marco (Fase E): el bundle, sobre el `dataset` de su `<div>`. Por eso
 *    sale de `paresNativa`, que da los `data-*` como los leerá `dataset`, y no
 *    del texto del código: el navegador ya ha deshecho el escapado y un
 *    booleano a pelo le llega como `''`. `data-studio` y `data-tentare-booking`
 *    no cuentan: no están en `CLAVES_FIRMA`.
 *  - El botón y el enlace no mandan nada a propósito: de dónde llega quien
 *    pulsa un enlace no es la web del estudio.
 */
export function firmaContenidoDe(e: EntradaIntegracion, m: MetodoIntegracion): string | null {
  if (m === 'nativa') return firmaDeUrl(lectorDePares(paresNativa(e)));
  if (m !== 'iframe' && m !== 'popup') return null;
  return firmaDeUrl(new URL(urlEmbebido(e, m)).searchParams);
}

export function generarCodigo(e: EntradaIntegracion, metodo: MetodoIntegracion, plataforma: Plataforma = 'html'): CodigoGenerado {
  const w = e.widget;
  const react = plataforma === 'react';
  switch (metodo) {
    case 'enlace':
      return { codigo: codigoPorId(e) ? urlDePieza(e, false) : urlPagina(e), lenguaje: 'url' };

    case 'boton': {
      const url = codigoPorId(e) ? urlDePieza(e, false) : urlPagina(e);
      const texto = textoBotonEfectivo(e.config, w);
      const nueva = e.config.abrirEn === 'nueva';
      if (react) {
        return {
          lenguaje: 'jsx',
          codigo: `// ${w.nombre} — botón de Tentare. Pégalo donde quieras que aparezca.
export function ${nombreComponente(w)}Boton() {
  return (
    <a href=${jsString(url)}${nueva ? ` target="_blank" rel="noopener"` : ''} style={${objetoEstiloReact(e, 'boton')}}>
      {${jsString(texto)}}
    </a>
  );
}`,
        };
      }
      return {
        lenguaje: 'html',
        codigo: `<a href="${urlEnAtributo(url)}"${nueva ? ' target="_blank" rel="noopener"' : ''} style="${cssBoton(e, 'boton')}">${escaparTexto(texto)}</a>`,
      };
    }

    case 'popup': {
      const url = codigoPorId(e) ? urlDePieza(e, false) : urlEmbebido(e, 'popup');
      const texto = textoBotonEfectivo(e.config, w);
      const script = `${e.origen}/widget-popup.js`;
      if (react) {
        return {
          lenguaje: 'jsx',
          codigo: `import { useEffect } from 'react';

// ${w.nombre} — abre el widget de Tentare en una ventana encima de tu web.
export function ${nombreComponente(w)}Popup() {
  useEffect(() => {
    if (document.querySelector('script[src=${jsString(script).replace(/'/g, '"')}]')) return;
    const s = document.createElement('script');
    s.src = ${jsString(script)};
    s.async = true;
    document.body.appendChild(s);
  }, []);
  return (
    <button
      type="button"
      data-tentare-popup=${jsString(url)}
      data-tentare-titulo=${jsString(w.nombre)}
      data-tentare-ancho="${anchoPopupDe(w, e.config)}"
      style={${objetoEstiloReact(e, 'popup')}}
    >
      {${jsString(texto)}}
    </button>
  );
}`,
        };
      }
      return {
        lenguaje: 'html',
        codigo: `<button type="button" data-tentare-popup="${urlEnAtributo(url)}" data-tentare-titulo="${escaparAtributo(w.nombre)}" data-tentare-ancho="${anchoPopupDe(w, e.config)}" style="${cssBoton(e, 'popup')}">${escaparTexto(texto)}</button>
<script src="${script}" async></script>`,
      };
    }

    case 'nativa': {
      const attrs = codigoPorId(e) ? [`data-widget="${e.pieza}"`] : atributosNativa(e);
      const script = `${e.origen}/widget.js`;
      if (react) {
        const jsx = attrs.map(a => (a.includes('=') ? a : `${a}=""`)).map(a => `\n      ${a}`).join('');
        return {
          lenguaje: 'jsx',
          codigo: `import { useEffect } from 'react';

// ${w.nombre} — integración nativa de Tentare (sin marco).
export function ${nombreComponente(w)}() {
  useEffect(() => {
    if (document.querySelector('script[src=${jsString(script).replace(/'/g, '"')}]')) return;
    const s = document.createElement('script');
    s.src = ${jsString(script)};
    s.async = true;
    document.body.appendChild(s);
  }, []);
  return (
    <div
      data-tentare-booking=""
      data-studio=${jsString(e.slug)}${jsx}
    />
  );
}`,
        };
      }
      return {
        lenguaje: 'html',
        codigo: `<div data-tentare-booking data-studio="${e.slug}"${attrs.map(a => ` ${a}`).join('')}></div>
<script src="${script}" async></script>`,
      };
    }

    case 'iframe':
    default: {
      const url = codigoPorId(e) ? urlDePieza(e, true) : urlEmbebido(e, 'iframe');
      const id = idIframe(e);
      const max = anchoMaximoPx(e);
      const lazy = e.config.cargaDiferida;
      if (react) {
        return {
          lenguaje: 'jsx',
          codigo: `import { useEffect, useRef } from 'react';

// ${w.nombre} — widget de Tentare. Se ajusta solo a la altura de su contenido.
const ORIGEN = ${jsString(e.origen)};

export function ${nombreComponente(w)}() {
  const ref = useRef(null);
  useEffect(() => {
    let raf = 0;
    const avisarVista = () => {
      raf = 0;
      const f = ref.current;
      if (!f || !f.contentWindow) return;
      const r = f.getBoundingClientRect();
      const alto = Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0);
      f.contentWindow.postMessage({ tentareHostViewport: { top: Math.max(0, -r.top), height: Math.max(0, alto) } }, ORIGEN);
    };
    const pedirVista = () => { if (!raf) raf = requestAnimationFrame(avisarVista); };
    const onMessage = (e) => {
      const f = ref.current;
      if (!f || e.origin !== ORIGEN || e.source !== f.contentWindow || e.data?.tentareSlug !== ${jsString(e.slug)}) return;
      if (e.data.tentareEmbedAltura) { f.style.height = e.data.tentareEmbedAltura + 'px'; pedirVista(); }
      if (e.data.tentareScrollTo) f.scrollIntoView({ block: 'start', behavior: 'smooth' });
    };
    window.addEventListener('message', onMessage);
    window.addEventListener('scroll', pedirVista, true);
    window.addEventListener('resize', pedirVista);
    return () => {
      window.removeEventListener('message', onMessage);
      window.removeEventListener('scroll', pedirVista, true);
      window.removeEventListener('resize', pedirVista);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  return (
    <iframe
      ref={ref}
      src=${jsString(url)}
      title=${jsString(w.nombre)}${lazy ? '\n      loading="lazy"' : ''}
      allow="payment"
      style={{ width: '100%',${max ? ` maxWidth: ${max},` : ''} height: ${w.alto}, border: 0, borderRadius: 12 }}
    />
  );
}`,
        };
      }
      return {
        lenguaje: 'html',
        codigo: `<iframe id="${id}" src="${urlEnAtributo(url)}" style="width:100%;${max ? `max-width:${max}px;` : ''}height:${w.alto}px;border:0;border-radius:12px;" title="${escaparAtributo(w.nombre)}"${lazy ? ' loading="lazy"' : ''} allow="payment"></iframe>
${scriptSnippetIframe({ origen: e.origen, slug: e.slug, iframeId: id })}`,
      };
    }
  }
}
