// El estilo de los widgets en la web del estudio, resuelto: qué se ve.
//
// Fase B del constructor de widgets (28-sep-2026). La dueña elige UNA vez, en
// el panel, cómo se ven los widgets que pone dentro de su web —«Igual que tu
// app» o un estilo solo para su web, la letra, si se funde con su web y el
// color de los botones— y lo aplica: cambia solo en todos sus widgets pegados,
// sin volver a pegar nada. Lo guardado es `WidgetWeb` (./estilo-web-tipos.ts);
// esto lo traduce al vocabulario de /reservar (`--portal-*`, `ModoTokens`) con
// las MISMAS piezas que F1 (./tema-app.ts) y la app de la alumna
// (lib/student/apariencia.ts), que ya garantizan el contraste por código.
//
// Cuatro reglas, todas con su test (./estilo-web.test.ts):
//   · Sin nada elegido, `null`: /reservar se ve EXACTAMENTE como con F1. Ningún
//     widget pegado cambia por desplegar esto.
//   · Un código con diseño propio (cualquier parámetro de diseño en su URL) no
//     recibe el estilo de su web: es lo que promete el panel al aplicarlo
//     («los widgets con un diseño propio dentro de su código no cambian»).
//     Con la precedencia eje por eje, un código con solo `marca=` sobre una
//     web clara no «decide» la paleta (./precedencia-tema.ts) y heredaría los
//     neutros de su web: por eso la regla es entera, no por eje.
//   · Fundirse con su web solo si el texto se lee sobre ella; si el estilo
//     elegido no se lee, el del otro lado (claro ↔ Carbón); si ninguno, el
//     panel y el servidor no lo dejan aplicar (`validarEstiloWeb`). Y nunca en
//     la ventana que se abre encima: su marco es blanco fijo
//     (app/widget-bundle/popup.ts), y letra clara sobre él no se leería.
//   · Los botones por defecto son los de F1, no los de la app (ver `botonWeb`).
//
// Puro, sin servidor ni zod: lo usan la página /reservar (cliente), el panel y
// el endpoint que lo aplica.

import type { ModoTokens } from '../portal-paleta.ts';
import { foregroundParaFondo, ratioContraste } from '../wcag-contrast.ts';
import {
  acentoDe, acentoFiel, estiloPorId, resolverApariencia, tipografiaPorId,
  type AparienciaApp, type EstiloId, type IntensidadMarca,
} from '../student/apariencia.ts';
import { varsDeTokensReservar } from '../reservar-publico-tokens.ts';
import { reservarCambiaMarca, rgba, tokensDeEstilo, varsPareja } from './tema-app.ts';
import { textoDeMarca } from './precedencia-tema.ts';
import type { AparienciaWidget, ParamsWidget } from './apariencia-widget.ts';
import {
  BOTONES_WEB, PARAM_BORRADOR, colorDeLaWeb, esNeutro, leerWidgetWeb, type BotonWeb, type WidgetWeb,
} from './estilo-web-tipos.ts';

/** AA para texto normal: el umbral de todo lo que se lee aquí. */
const LEGIBLE = 4.5;
const r = (a: string, b: string) => ratioContraste(a, b) ?? 0;

/**
 * El `primary` de `DEFAULT_THEME` (lib/theme-schema.ts; un test los ata): lo
 * que pinta F1 en `--portal-brand` cuando el estudio no tiene color. No se
 * importa de allí para no arrastrar zod al paquete de /reservar.
 */
export const COLOR_PRIMARIO_POR_DEFECTO = '#343825';

const HEX_PRIMARIO = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** Con qué se resuelve el estilo de su web: la apariencia de la app y el color del estudio. */
export interface BaseEstiloWeb {
  app: AparienciaApp;
  /** Solo hex: acaba en estilos en línea. `null` = sin color (el de por defecto). */
  colorPrimario: string | null;
}

export function baseEstiloWeb(colorPrimario: unknown, appAlumna: unknown): BaseEstiloWeb {
  return {
    app: resolverApariencia(appAlumna),
    colorPrimario: typeof colorPrimario === 'string' && HEX_PRIMARIO.test(colorPrimario) ? colorPrimario : null,
  };
}

/** Dentro de su web (iframe) o en la ventana que se abre encima (popup, `ventana=1`). */
export type Contexto = 'dentro' | 'ventana';

export interface EstiloWebResuelto {
  /** El estilo cuyos neutros se ven: el elegido o, si se funde y no se lee, el del otro lado. */
  neutros: EstiloId;
  /** Para la prop `t=` (calendario, Mi cuenta, el pago). Siempre hex reales. */
  tokens: ModoTokens;
  noche: boolean;
  /** La paleta entera y la marca, en línea sobre la raíz. Solo si eligió estilo, botones o fundirse. */
  varsEnLinea: Record<string, string> | null;
  /** Las cuatro variables de la pareja, en línea. Solo si eligió letra. */
  varsLetra: Record<string, string> | null;
  /** Se funde con su web: la raíz y el documento, sin fondo. */
  fondoRaiz: 'transparent' | null;
  /** Lo que entra por `resolverApariencia` como «guardado» (la URL del snippet gana). */
  capa: Pick<AparienciaWidget, 'forma' | 'densidad' | 'ocultarPie'>;
  /** El color de los botones que se ve, para las muestras del panel. */
  boton: { fondo: string; texto: string };
}

/**
 * Los parámetros del snippet que son DISEÑO: los que emite el constructor con
 * «Un diseño distinto solo para este widget» (`paresDiseno`,
 * lib/widgets/integracion.ts) y los del editor anterior. Fuera, a propósito,
 * lo que no es aspecto: `diseno` (lista o rejilla), `presentacion`, `pie`,
 * `solo-pestana`, los filtros y `ref`.
 */
export const PARAMS_DISENO_PROPIO = [
  'marca', 'fondo', 'texto', 'tinta', 'superficie', 'linea', 'texto-secundario', 'relleno',
  'forma', 'densidad', 'fuente', 'fuente-display', 'radio', 'radio-boton', 'radio-input',
] as const;

/** ¿Lleva el código su propio diseño? Entonces el estilo de su web no le llega (cabecera). */
export function urlTraeDisenoPropio(p: ParamsWidget): boolean {
  return PARAMS_DISENO_PROPIO.some(k => (p.get(k) ?? '').trim() !== '');
}

/**
 * Los neutros del widget sobre su web.
 *
 * En su recuadro, los del estilo tal cual. Fundido, su fondo pasa a ser el de
 * su web (`bg`: lo que ven Stripe y todo lo que pinta `t.bg`), y se queda el
 * primer estilo cuyo texto y secundario se lean sobre ella: el elegido o, si
 * no, el del otro lado (uno claro sobre una web oscura pasa a Carbón, y
 * Carbón sobre una web clara pasa a Crema). Las tarjetas conservan las del
 * estilo: Arena fundida sobre blanco sigue teniendo sus tarjetas tostadas.
 *
 * Si ninguno se lee (un gris medio), `legible: false` con el que menos pierde,
 * para que la vista previa enseñe algo; aplicarlo lo impide `validarEstiloWeb`.
 */
export function paletaWidget(estilo: EstiloId, colorWeb: string, fundido: boolean): {
  neutros: EstiloId; tokens: ModoTokens; noche: boolean; fondoRaiz: 'transparent' | null; legible: boolean;
} {
  const propio = estiloPorId(estilo);
  if (!fundido) {
    return { neutros: propio.id, tokens: tokensDeEstilo(propio), noche: propio.oscuro === true, fondoRaiz: null, legible: true };
  }
  const peor = (id: EstiloId) => {
    const t = tokensDeEstilo(estiloPorId(id));
    return Math.min(r(t.ink, colorWeb), r(t.muted, colorWeb));
  };
  const candidatos: EstiloId[] = [propio.id, propio.oscuro ? 'crema' : 'carbon'];
  const elegido = candidatos.find(id => peor(id) >= LEGIBLE)
    ?? (peor(candidatos[1]) > peor(candidatos[0]) ? candidatos[1] : candidatos[0]);
  const e = estiloPorId(elegido);
  return {
    neutros: e.id,
    tokens: { ...tokensDeEstilo(e), bg: colorWeb, tabbar: rgba(colorWeb, 0.72) },
    noche: e.oscuro === true,
    fondoRaiz: 'transparent',
    legible: peor(e.id) >= LEGIBLE,
  };
}

/**
 * El color de los botones —y de todo lo que en /reservar va en
 * `--portal-brand`: es UN solo token para botón y acento (cabecera de
 * lib/reservar-publico-tokens.ts), y las tarjetas de clase no se tocan—.
 *
 *   · `null` (por defecto): la regla de F1 sobre los neutros que se ven. Si
 *     esos neutros cambian la marca (`reservarCambiaMarca`), el acento de la
 *     app; si no, el color del estudio tal cual con su texto por luminancia,
 *     que es lo que pinta el tema en `:root`. ⚠️ NO el «Botón principal» de la
 *     app: por defecto es oscuro, y seguirlo cambiaría los botones de todos
 *     los widgets ya pegados el día del despliegue.
 *   · `tinta` («Oscuros»; «Claros» en Carbón): la tinta del estilo.
 *   · `suave`: el acento de la app en su gama contenida.
 *   · `fiel` («Tu color tal cual»): el color crudo si su texto llega a AA; si
 *     no, oscurecido lo justo (`acentoFiel`). El crudo con el texto blanco o
 *     negro de `foregroundParaFondo` puede quedarse en ~4,3:1 en los tonos
 *     medios, y eso no se da por bueno. Sobre un estilo oscuro, el acento
 *     aclarado de la app (`acentoDe`), como en la app.
 */
export function botonWeb(b: BotonWeb | null, neutros: EstiloId, base: BaseEstiloWeb): { fondo: string; texto: string } {
  const e = estiloPorId(neutros);
  const app: AparienciaApp = { ...base.app, estilo: e.id };
  const acento = (marca: IntensidadMarca) => {
    const a = acentoDe(base.colorPrimario, { ...app, marca });
    return { fondo: a.accent, texto: a.accentForeground };
  };
  const crudo = base.colorPrimario ?? COLOR_PRIMARIO_POR_DEFECTO;
  switch (b) {
    case 'tinta':
      return { fondo: e.tinta, texto: e.tintaForeground };
    case 'suave':
      return acento('suave');
    case 'fiel': {
      if (e.oscuro) return acento('fiel');
      const texto = foregroundParaFondo(crudo);
      if (r(crudo, texto) >= LEGIBLE) return { fondo: crudo, texto };
      const f = acentoFiel(crudo, e.background);
      return { fondo: f.accent, texto: f.accentForeground };
    }
    default:
      if (reservarCambiaMarca(app)) return acento(app.marca);
      return { fondo: crudo, texto: foregroundParaFondo(crudo) };
  }
}

/**
 * La opción que se ve IGUAL que la de por defecto (mismo hex de fondo y de
 * texto), para ponerle la insignia «Por defecto»: elegirla guarda `null`.
 * `null` si ninguna coincide (el panel ofrece entonces «Por defecto» aparte).
 */
export function botonPorDefecto(neutros: EstiloId, base: BaseEstiloWeb): BotonWeb | null {
  const def = botonWeb(null, neutros, base);
  const igual = (x: string, y: string) => x.toLowerCase() === y.toLowerCase();
  return BOTONES_WEB.find(b => {
    const o = botonWeb(b, neutros, base);
    return igual(o.fondo, def.fondo) && igual(o.texto, def.texto);
  }) ?? null;
}

/**
 * Lo que se ve con este estilo de su web, o `null` si no cambia nada respecto
 * a la app (entonces /reservar es F1 tal cual).
 *
 * Solo se escribe en línea lo necesario: la paleta y la marca si eligió
 * estilo, botones o fundirse; la letra si eligió letra; las esquinas, la
 * separación y el pie van por la capa «guardado» de `resolverApariencia`, donde
 * la URL del snippet gana.
 */
export function resolverEstiloWeb(
  w: WidgetWeb | null | undefined, base: BaseEstiloWeb, contexto: Contexto,
): EstiloWebResuelto | null {
  if (!w || esNeutro(w)) return null;
  const funde = w.fundido && contexto === 'dentro';
  const p = paletaWidget(w.estilo ?? base.app.estilo, colorDeLaWeb(w), funde);
  const boton = botonWeb(w.boton, p.neutros, base);
  const decideColores = w.estilo != null || w.boton != null || funde;
  return {
    neutros: p.neutros,
    tokens: p.tokens,
    noche: p.noche,
    varsEnLinea: decideColores ? {
      ...varsDeTokensReservar(p.tokens),
      '--portal-brand': boton.fondo,
      '--portal-brand-foreground': boton.texto,
      // La marca como texto, medida contra lo que se ve: fundido, contra SU web.
      '--portal-brand-texto': textoDeMarca(boton.fondo, p.tokens),
      // Explícito en los dos sentidos: debajo, en `:root`, puede estar el de
      // una app en Carbón (oscuro) o el de una app clara bajo un estilo Carbón.
      colorScheme: p.noche ? 'dark' : 'light',
    } : null,
    varsLetra: w.letra ? { ...varsPareja(w.letra) } : null,
    fondoRaiz: p.fondoRaiz,
    capa: { forma: w.forma, densidad: w.densidad, ocultarPie: w.ocultarPie },
    boton,
  };
}

/** Un borrador más largo que esto no lo ha escrito el panel: se ignora sin leerlo. */
const BORRADOR_MAX = 1000;

/**
 * El borrador de la vista previa del panel (`borrador-web=<JSON>`), que
 * SUSTITUYE a lo publicado mientras la dueña prueba. Solo junto a `embed=1` y
 * `vista-previa=1`: el código que se copia nunca lo lleva, y cualquiera que lo
 * escriba a mano solo cambia lo que ve su propio navegador (como ya pasa con
 * `?fondo=`). `undefined` = no hay borrador (manda lo publicado); un borrador
 * «nada elegido» sí cuenta: enseña la app.
 */
export function leerBorradorWeb(p: ParamsWidget): WidgetWeb | undefined {
  if (p.get('embed') !== '1' || p.get('vista-previa') !== '1') return undefined;
  const crudo = p.get(PARAM_BORRADOR);
  if (crudo == null || crudo.length > BORRADOR_MAX) return undefined;
  try {
    return leerWidgetWeb(JSON.parse(crudo)) ?? undefined;
  } catch {
    return undefined;
  }
}

export interface ErrorEstiloWeb {
  campo: 'colorWeb' | 'boton';
  mensaje: string;
}

export const MENSAJE_FUNDIDO_ILEGIBLE = 'Con este color de web, el texto fundido no se lee bien. Prueba «En su propio recuadro».';
export const MENSAJE_BOTON_ILEGIBLE = 'Con este estilo, el texto de los botones no se lee bien. Prueba otro color de botones.';

/**
 * Lo que impide aplicarlo: el MISMO veredicto en el panel (botón desactivado)
 * y en el servidor (422). Fundido, el texto sobre su web; y el botón solo si lo
 * eligió ella, en los dos sitios donde se ve (dentro, quizá fundido, y en la
 * ventana, nunca fundido). El de por defecto es lo que ya se ve hoy y no se
 * bloquea: un color de tono medio puede quedarse en ~4,3:1 igual que con F1.
 */
export function validarEstiloWeb(w: WidgetWeb, base: BaseEstiloWeb): ErrorEstiloWeb[] {
  const errores: ErrorEstiloWeb[] = [];
  const estilo = w.estilo ?? base.app.estilo;
  const web = colorDeLaWeb(w);
  if (w.fundido && !paletaWidget(estilo, web, true).legible) {
    errores.push({ campo: 'colorWeb', mensaje: MENSAJE_FUNDIDO_ILEGIBLE });
  }
  if (w.boton) {
    const ilegible = [w.fundido, false].some(funde => {
      const b = botonWeb(w.boton, paletaWidget(estilo, web, funde).neutros, base);
      return r(b.fondo, b.texto) < LEGIBLE;
    });
    if (ilegible) errores.push({ campo: 'boton', mensaje: MENSAJE_BOTON_ILEGIBLE });
  }
  return errores;
}

const ESQUINAS: Record<NonNullable<WidgetWeb['forma']>, string> = { pill: 'redondas', redondeado: 'suaves', recto: 'rectas' };

/**
 * «Arena, solo para tu web · letra Editorial»: lo elegido, en palabras de la
 * interfaz. Solo nombres de los catálogos: nunca un dato del estudio.
 */
export function resumenEstiloWeb(w: WidgetWeb | null, app: AparienciaApp): string {
  const partes = [w?.estilo ? `${estiloPorId(w.estilo).nombre}, solo para tu web` : `Igual que tu app · ${estiloPorId(app.estilo).nombre}`];
  if (!w) return partes[0];
  if (w.letra) partes.push(`letra ${tipografiaPorId(w.letra).nombre}`);
  if (w.boton) {
    const oscuro = estiloPorId(paletaWidget(w.estilo ?? app.estilo, colorDeLaWeb(w), w.fundido).neutros).oscuro === true;
    partes.push(w.boton === 'tinta' ? `botones ${oscuro ? 'claros' : 'oscuros'}`
      : w.boton === 'suave' ? 'botones en tu color, suave' : 'botones en tu color tal cual');
  }
  if (w.fundido) partes.push('fundido con tu web');
  if (w.forma) partes.push(`esquinas ${ESQUINAS[w.forma]}`);
  if (w.densidad === 'compacta') partes.push('compacto');
  if (w.ocultarPie) partes.push('sin dirección al pie');
  return partes.join(' · ');
}

/** La línea de Actividad al aplicar o deshacer. Sin datos personales: solo el resumen de catálogo. */
export function textoActividadEstiloWeb(w: WidgetWeb | null, app: AparienciaApp, motivo: 'aplicar' | 'deshacer'): string {
  if (motivo === 'deshacer') return 'Estilo de tus widgets: vuelto al de antes';
  return `Estilo de tus widgets: ${resumenEstiloWeb(w, app).replace(/^Igual/, 'igual')}`;
}
