// El estilo de los widgets de su web, en la integración SIN MARCO (Fase E).
//
// Hasta la Fase D, lo que la dueña aplicaba en «Cómo se ve» llegaba al iframe y
// a la ventana encima, pero no a la nativa: el bundle (app/widget-bundle/main.tsx)
// pintaba siempre sus tokens de día, con el color de la COLUMNA del estudio. Aquí
// se decide qué pinta la nativa con ese estilo, con las MISMAS piezas que el
// iframe (`resolverEstiloWeb`, lib/reservar/estilo-web.ts) y la misma lectura
// del tema que /reservar, para que la vista previa del panel, el bundle y el
// iframe no puedan contar tres cosas distintas.
//
// Tres reglas, cada una con su test (./estilo-nativa.test.ts):
//   · Sin nada elegido, `null`: la nativa se ve EXACTAMENTE como hasta ahora
//     (sus tokens, la letra de su web o la de siempre, sin fondo y sin pedir
//     ninguna fuente). Ninguna nativa pegada cambia por desplegar esto, salvo el
//     color de identidad, que pasa a ser el del tema (`datosEstiloNativaDeTema`).
//   · Con algo elegido, lo del iframe con ese estilo: sus tokens, su botón, sus
//     esquinas y su separación. El estilo de la app se fuerza como elegido
//     (`estilo: w.estilo ?? app.estilo`): el iframe lo hereda de `:root` (F1),
//     y debajo de la nativa no hay F1 que heredar, así que las variables se
//     escriben siempre.
//   · La LETRA, no (enmienda al diseño de la Fase E, 29-sep-2026): con
//     «Como tu app» (`letra: null`) la nativa conserva la de su web, que es su
//     gran ventaja frente al iframe, y no se pierde por elegir un color. Solo
//     una letra elegida a propósito la cambia.
//
// ⚠️ Entra en el bundle de la nativa, que se sirve en la web de un tercero: sin
// React, sin servidor, sin `LEGAL` (scripts/build-widget-bundle.mjs para el
// build si vuelve). Y todo lo que acaba en un `style` sale de catálogos o de un
// hex validado: lo que llega por la red se vuelve a leer clave a clave
// (`leerDatosEstiloNativa`), nunca se pega.

import { colorMarcaDelEstudio, hexDeMarca } from '../emails/color-marca.ts';
import { escalaDensidad, luminancia, radiosDe, resolverApariencia as resolverAparienciaWidget } from '../reservar/apariencia-widget.ts';
import { baseEstiloWeb, resolverEstiloWeb, type BaseEstiloWeb } from '../reservar/estilo-web.ts';
import { HEX6, esNeutro, leerWidgetWeb, type WidgetWeb } from '../reservar/estilo-web-tipos.ts';
import { radius } from '../reservar-publico-tokens.ts';
import { resolverApariencia, type AparienciaApp, type TipografiaId } from '../student/apariencia.ts';
import type { ModoTokens } from '../portal-paleta.ts';

/**
 * Lo que la nativa necesita de la apariencia de la app. Lista blanca: ni el
 * «Botón principal» (/reservar no lo sigue, ver `botonWeb`) ni el encuadre de
 * la portada viajan a la web de nadie.
 */
export type AppDeLaNativa = Pick<AparienciaApp, 'estilo' | 'tipografia' | 'marca'>;

/** `estiloWidget` de /api/public/studio-data: un hex, ids de catálogo y el estilo guardado. */
export interface DatosEstiloNativa {
  /** El color del estudio, del TEMA (publicado → preset). `null` si no hay ninguno válido. */
  color: string | null;
  /** `null` = nada elegido: la nativa se ve como siempre. */
  web: { widgetWeb: WidgetWeb; app: AppDeLaNativa } | null;
}

function appDeLaNativa(a: AparienciaApp): AppDeLaNativa {
  return { estilo: a.estilo, tipografia: a.tipografia, marca: a.marca };
}

/**
 * ¿No le llega nada sin marco? Un estilo neutro y, además, uno que solo quita
 * el pie: la nativa no lleva pie, así que quitarlo no puede cambiarla. Es la
 * ÚNICA pregunta de «¿cambia algo sin marco?»: la hacen el bundle (por
 * `webDe`), la vista previa y todos los textos del panel sobre la nativa, para
 * que no puedan contar cosas distintas. Con `esNeutro` a secas, quitar el pie
 * le ponía el recuadro con el estilo de su app sin que nadie lo eligiera.
 */
export function nadaParaSinMarco(w: WidgetWeb | null | undefined): boolean {
  return esNeutro(w ? { ...w, ocultarPie: false } : w);
}

/** El estilo, solo si le cambia algo: lo que no le llega es «nada elegido», igual que no tener ninguno. */
function webDe(w: WidgetWeb | null, app: AparienciaApp): DatosEstiloNativa['web'] {
  return w && !nadaParaSinMarco(w) ? { widgetWeb: w, app: appDeLaNativa(app) } : null;
}

/**
 * Servidor: lo que viaja a la nativa, sacado del tema PUBLICADO
 * (`getThemePublicado`, que ya cae al preset si no hay tema).
 *
 * El color, en el orden de /reservar y la app (`colorMarcaDelEstudio`,
 * lib/emails/color-marca.ts): el del tema, y la columna `studios.color_primario`
 * solo como último recurso. La nativa pintaba la columna, que en casi todos los
 * estudios es el índigo que escribe el alta y no ha elegido nadie.
 */
export function datosEstiloNativaDeTema(
  tema: { primary?: unknown; widgetWeb?: unknown; appAlumna?: unknown },
  colorColumna: unknown,
): DatosEstiloNativa {
  return {
    color: colorMarcaDelEstudio(tema.primary, null, colorColumna),
    web: webDe(leerWidgetWeb(tema.widgetWeb), resolverApariencia(tema.appAlumna)),
  };
}

/**
 * Panel: lo mismo, con el borrador (o lo publicado) y la base que ya tiene
 * (`useEstiloWeb`). Da lo mismo que el servidor con el mismo tema (lo ata un
 * test): es lo que deja a la vista previa enseñar lo que pintará su web. El
 * color pasa por el MISMO validador que en el servidor (`hexDeMarca`): la base
 * admite `#abc`, y sin expandirlo aquí igual que allí, la previa y su web
 * mezclarían colores distintos.
 */
export function datosEstiloNativaDeBase(w: WidgetWeb | null | undefined, base: BaseEstiloWeb): DatosEstiloNativa {
  return { color: hexDeMarca(base.colorPrimario), web: webDe(w ? leerWidgetWeb(w) : null, base.app) };
}

/**
 * Bundle: lo que llega por la red, leído clave a clave. `null` si no es un
 * objeto (un servidor de antes no lo manda: la nativa se ve como siempre).
 * Un color que no es `#rrggbb` se descarta; un estilo corrupto o neutro es
 * `web: null`; una apariencia de la app con basura vale la de por defecto.
 */
export function leerDatosEstiloNativa(crudo: unknown): DatosEstiloNativa | null {
  if (!crudo || typeof crudo !== 'object' || Array.isArray(crudo)) return null;
  const o = crudo as Record<string, unknown>;
  const color = typeof o.color === 'string' && HEX6.test(o.color) ? o.color : null;
  const web = o.web && typeof o.web === 'object' && !Array.isArray(o.web) ? o.web as Record<string, unknown> : null;
  return { color, web: web ? webDe(leerWidgetWeb(web.widgetWeb), resolverApariencia(web.app)) : null };
}

export interface EstiloNativa {
  /** Para `t=`. `null` = los de siempre (solo con `soloLetra`). */
  tokens: ModoTokens | null;
  /**
   * El `style` del envoltorio: variables, `colorScheme`, la letra si se eligió
   * y, en su recuadro, fondo, radio y relleno. Sin las familias de las fuentes
   * (`VARS_FAMILIAS_NATIVA`, ./fuentes-nativa.ts): las pone el bundle, que es
   * quien las carga; el panel ya las tiene por `next/font`.
   */
  raiz: Record<string, string>;
  /** La pareja elegida, o `null` = la letra de su web, como siempre. Solo con ella hacen falta fuentes. */
  letra: TipografiaId | null;
  radiosEsc: { tarjeta: number; boton: number; input: number } | null;
  densidadEsc: number | null;
  /** «Siete días en columnas» con un estilo de noche: de él solo llega la letra. */
  soloLetra: boolean;
}

/** El recuadro de la nativa: el radio del código del iframe (12 px) y aire alrededor. */
export const RECUADRO_NATIVA = { borderRadius: '12px', padding: '16px' } as const;

/**
 * Lo que pinta la nativa con este estilo, o `null` si no hay nada elegido.
 * `columnas`: el horario va en «Siete días en columnas» (`estiloDias='grid'`,
 * lo de por defecto en la nativa).
 *
 *  - En su recuadro, el fondo del estilo con `RECUADRO_NATIVA`; fundido, sin
 *    fondo: aquí la web se ve DE VERDAD por detrás, porque la nativa vive en su
 *    DOM. Qué paleta se lee encima lo decide el color que la dueña DECLARÓ de
 *    su web, no uno medido: el mismo que valida el servidor y enseña la previa.
 *  - «Siete días en columnas» con un estilo de noche: sus celdas son de
 *    neutros fijos de día, y el iframe tampoco le pasa la paleta
 *    (`widgetDecide`, lib/reservar/precedencia-tema.ts). Solo la letra, sin
 *    recuadro: así «solo la letra» es literal.
 */
export function estiloDeLaNativa(d: DatosEstiloNativa | null, x: { columnas: boolean }): EstiloNativa | null {
  // También aquí, no solo al leer: con el estilo de la app forzado debajo, un
  // neutro (o solo quitar el pie) que se colara pintaría el recuadro sin que
  // nadie lo eligiera.
  if (!d?.web || nadaParaSinMarco(d.web.widgetWeb)) return null;
  const base = baseEstiloWeb(d.color, d.web.app);
  const w = d.web.widgetWeb;
  const r = resolverEstiloWeb({ ...w, estilo: w.estilo ?? base.app.estilo }, base, 'dentro');
  // Con el estilo forzado nunca es neutro ni se queda sin colores; se comprueba
  // igual para no pintar a medias si eso cambiara algún día.
  if (!r?.varsEnLinea) return null;
  const letra = w.letra;
  // `fontFamily` también: el texto que HEREDA no lee las variables, lee la
  // familia del envoltorio de fuera (la de su web).
  const deLetra = r.varsLetra ? { ...r.varsLetra, fontFamily: 'var(--font-ui)' } : null;
  if (x.columnas && r.noche) {
    return { tokens: null, raiz: { ...deLetra, colorScheme: 'light' }, letra, radiosEsc: null, densidadEsc: null, soloLetra: true };
  }
  // Como /reservar: el estilo entra por la capa «guardado» y aquí no hay URL encima.
  const a = resolverAparienciaWidget(r.capa, null);
  return {
    tokens: r.tokens,
    raiz: { ...r.varsEnLinea, ...deLetra, ...(r.fondoRaiz ? null : { background: r.tokens.bg, ...RECUADRO_NATIVA }) },
    letra,
    radiosEsc: w.forma ? radiosDe(a, { tarjeta: radius.card, boton: radius.pill, input: radius.spot }) : null,
    densidadEsc: w.densidad === 'compacta' ? escalaDensidad(a) : null,
    soloLetra: false,
  };
}

/**
 * La marca de siempre de la nativa: el color y su texto por luminancia (la
 * regla de `pintarMarca`, app/widget-bundle/main.tsx).
 *
 * ⚠️ NO valida el color, y escribirlo con `setProperty` tampoco: en una custom
 * property el navegador acepta casi cualquier cosa, no solo colores. Lo validan
 * quienes la llaman: el de identidad, con `HEX6` (`WidgetApp`, y por la red
 * `leerDatosEstiloNativa`); `data-marca`, con `COLOR_VALIDO`
 * (`resolverConfigWidget`); `data-color`, con `colorDeDataColor` (`montarUno`);
 * y en el panel, `PreviewNativa` con `COLOR_VALIDO`.
 */
export function marcaDeLaNativa(hex: string): { '--portal-brand': string; '--portal-brand-foreground': string } {
  const l = luminancia(hex);
  return { '--portal-brand': hex, '--portal-brand-foreground': l != null && l < 0.45 ? '#FFFFFF' : '#22261F' };
}

/**
 * El `data-color` de antes del constructor, que nunca se validó: solo si es un
 * color para el navegador (`esColor`: `CSS.supports('color', v)` en el bundle),
 * así que `red` o `rgb(…)` siguen valiendo y lo que no es un color, no.
 * `var()`, `env()` y `attr()` fuera aunque pasen esa comprobación (se validan
 * al usarse, no al escribirse), y un escape CSS, que podría escribirlas.
 */
export function colorDeDataColor(v: string | undefined, esColor: (v: string) => boolean): string | null {
  const t = v?.trim();
  if (!t || /\\|\b(?:var|env|attr)\(/i.test(t)) return null;
  return esColor(t) ? t : null;
}
