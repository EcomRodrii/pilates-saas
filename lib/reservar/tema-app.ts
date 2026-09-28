// El estilo de la app de la alumna, llevado a la página pública /reservar/[slug].
//
// Decisión del fundador (27-sep-2026): /reservar toma el MISMO estilo que el
// estudio eligió para la app de sus alumnas —estilo (neutros), pareja
// tipográfica e intensidad de marca—, en vez del suyo propio fijo. Hasta ahora
// el layout volvía a forzar Plus Jakarta Sans por encima de todo
// (`<style id="reservar-fuente">`) y la página ignoraba la apariencia aunque el
// servidor ya la tuviera en memoria.
//
// Nada se inventa aquí: los colores, las parejas y el acento salen de
// lib/student/apariencia.ts, que ya garantiza el contraste por código y con
// sus tests. Esto solo los traduce al vocabulario de /reservar (`--portal-*`,
// `ModoTokens`).
//
// Cuatro reglas, todas con su test (./tema-app.test.ts):
//   · Sin nada elegido, /reservar se ve EXACTAMENTE como antes: Jakarta, la
//     paleta de día y la marca del estudio tal cual. Ningún estudio cambia de
//     aspecto por desplegar esto — la misma regla que se puso la app.
//   · Ninguna variable de fuente se referencia a sí misma (ver `pilaSinCiclo`).
//   · La marca como TEXTO se lee sobre el fondo, la tarjeta y el relleno.
//   · Lo del widget (parámetros del snippet) gana a todo esto en `embed=1`:
//     eso lo decide ./precedencia-tema.ts, en cliente, escribiendo en línea.
//
// Fuera a propósito, pendiente de visto bueno del fundador:
//   · `boton: 'tinta'` (el botón principal oscuro de la app) NO se aplica: los
//     CTA de /reservar van en `--portal-brand` por decisión cerrada
//     (cabecera de lib/reservar-publico-tokens.ts), y cambiarlo cambiaría el
//     botón «Reservar» de las tarjetas de clase.
//   · Los radios de cada estilo tampoco: trasladarlos sería reestructurar las
//     tarjetas, y esas no se tocan.
//   · La escala y el tracking de titular de cada pareja: /reservar no tiene un
//     punto único de titular donde aplicarlos (el `heading()` de los tokens no
//     lo usa nadie). Sí el peso, en los titulares que ya iban en negrita
//     (`pesoTitular`).

import type { ModoTokens } from '../portal-paleta.ts';
import { hexARgb } from '../wcag-contrast.ts';
import { mezclarHex } from '../color-utils.ts';
import {
  acentoDe, estiloPorId, resolverApariencia, tipografiaPorId, type AparienciaApp, type Estilo, type TipografiaId,
} from '../student/apariencia.ts';
import { RESERVAR_PALETA, fuenteReservarCssVars, varsDeTokensReservar } from '../reservar-publico-tokens.ts';
import { textoDeMarca, widgetDecidePaleta, type ColoresWidget, type TemaAppReservar } from './precedencia-tema.ts';

// Vive en ./precedencia-tema.ts porque también la usa la página (cliente), para
// la `marca=` del snippet. Se reexporta: el servidor la sigue pidiendo aquí.
export { textoDeMarca };

/**
 * ¿Ha elegido algo el estudio que /reservar deba seguir? Es la misma pregunta
 * que se hace `temaAppCssText`, sin el encuadre de la portada: ese solo mueve la
 * foto de la app, y no puede ser que mover una foto cambie el color de los
 * botones de la página de reservas.
 */
export function esReservarPorDefecto(a: AparienciaApp): boolean {
  return a.estilo === 'crema' && a.tipografia === 'moderna' && a.marca === 'suave' && a.boton === 'tinta';
}

/**
 * ¿Cambia el color de los botones de /reservar? Solo con los dos ejes que
 * definen el color en la app: el estilo y la intensidad de marca.
 *
 * ⚠️ Antes bastaba con elegir CUALQUIER cosa (`!esReservarPorDefecto`): cambiar
 * solo la pareja tipográfica, o solo «Botón principal: En tu color», pasaba
 * todos los CTA de la marca del estudio tal cual (un rosa #E11D48) al acento
 * `suave`, apagado. O sea, elegir «en tu color» dejaba /reservar MENOS de su
 * color. Con Crema + suave la app pinta el mismo tono de siempre y /reservar
 * se queda con la marca que ya tenía.
 */
export function reservarCambiaMarca(a: AparienciaApp): boolean {
  return a.estilo !== 'crema' || a.marca !== 'suave';
}

/** Un hex con transparencia (la barra translúcida). Lo usa también el fundido del estilo de su web (./estilo-web.ts). */
export function rgba(hex: string, alfa: number): string {
  const c = hexARgb(hex);
  return c ? `rgba(${c.r},${c.g},${c.b},${alfa})` : hex;
}

/**
 * Los neutros de un estilo de la app como `ModoTokens` de /reservar.
 *
 * «Crema» es la paleta de día de siempre, tal cual, y no los valores del kit de
 * la app (su relleno es `#EFEDE4` y el de /reservar `#F1F2EA`): la regla es que
 * sin elegir nada no cambie ni un píxel.
 *
 * El reparto: fondo → `bg`, tarjeta → `surface`, gris → `surface2`, borde →
 * `line`, texto → `ink`, secundario → `muted`, apoyo → `micro` y el acento de
 * las versalitas. Los velos (los chips translúcidos) siguen el patrón de las
 * dos paletas de siempre: blanco translúcido en claro, y el propio texto a muy
 * baja opacidad en oscuro. Y el degradado de la portada va de fondo a gris en
 * claro, y de tarjeta a fondo en oscuro — igual que día y noche.
 */
export function tokensDeEstilo(e: Estilo): ModoTokens {
  if (e.id === 'crema') return RESERVAR_PALETA.dia;
  const dia = RESERVAR_PALETA.dia;
  const velos = e.oscuro
    ? { velo: rgba(e.foreground, 0.05), veloFuerte: rgba(e.foreground, 0.09), veloSuave: rgba(e.foreground, 0.03) }
    : { velo: dia.velo, veloFuerte: dia.veloFuerte, veloSuave: dia.veloSuave };
  const hero = e.oscuro
    ? `linear-gradient(175deg,${e.card} 0%,${mezclarHex(e.card, e.background, 0.5)} 58%,${e.background} 100%)`
    : `linear-gradient(175deg,${e.background} 0%,${mezclarHex(e.background, e.muted, 0.5)} 58%,${e.muted} 100%)`;
  return {
    bg: e.background, surface: e.card, surface2: e.muted, line: e.border,
    ink: e.foreground, muted: e.mutedForeground, muted2: e.mutedForeground, micro: e.subtleForeground,
    accentInk: e.background, tabbar: rgba(e.background, 0.72), bar: e.muted,
    hero, heroLine: e.border, heroText: e.foreground, heroSub: e.mutedForeground, heroAccent: e.subtleForeground,
    ...velos,
  };
}

/**
 * Los «Colores del widget» guardados en el tema publicado (`widgetFondo`,
 * `widgetTexto`, `widgetSuperficie`…), solo si deciden la paleta. Solo hex (o
 * «transparente»): esto viaja a cliente y acaba en estilos en línea.
 */
export function coloresWidgetGuardados(tema: object | null | undefined): ColoresWidget | null {
  if (!tema) return null;
  const t = tema as Readonly<Record<string, unknown>>;
  const hex = (v: unknown) => (typeof v === 'string' && HEX.test(v) ? v : null);
  const c: ColoresWidget = {
    fondo: t.widgetFondo === 'transparente' ? 'transparente' : hex(t.widgetFondo),
    texto: t.widgetTexto === 'claro' || t.widgetTexto === 'oscuro' ? t.widgetTexto : 'auto',
    superficie: hex(t.widgetSuperficie),
    tinta: hex(t.widgetTinta),
    textoSecundario: hex(t.widgetTextoSecundario),
    linea: hex(t.widgetLinea),
    relleno: hex(t.widgetRelleno),
  };
  return widgetDecidePaleta(c) ? c : null;
}

/**
 * Lo que el layout le pasa a la página (cliente) por el proveedor. Con el tema
 * publicado, además, los colores del widget que el estudio guardó (ver
 * `TemaAppReservar.widgetGuardado`).
 */
export function temaAppParaReservar(crudo: unknown, temaPublicado?: object | null): TemaAppReservar {
  const e = estiloPorId(resolverApariencia(crudo).estilo);
  const widgetGuardado = coloresWidgetGuardados(temaPublicado);
  return { tokens: tokensDeEstilo(e), oscuro: e.oscuro === true, ...(widgetGuardado ? { widgetGuardado } : {}) };
}

/**
 * Las dos variables de fuente que /reservar REDEFINE, en su composición base
 * — la misma que declara app/_fuentes/fuentes.css (un test lo compara con el
 * fichero, para que no se separen).
 */
export const FUENTE_BASE: Readonly<Record<'--font-ui' | '--font-display', string>> = {
  '--font-ui': "var(--font-ui-latin), var(--font-ui-ext), 'Instrument Sans Fallback'",
  '--font-display': "var(--font-display-latin), var(--font-display-ext), 'Instrument Serif Fallback'",
};

/**
 * Una pila de TIPOGRAFIAS sin referencias a `--font-ui`/`--font-display`.
 *
 * ⚠️ «Serena» y «Nítida» escriben sus familias como `var(--font-ui)` y
 * `var(--font-display)`, que en la app son Instrument Sans/Serif. Pero
 * /reservar REDEFINE esas dos variables: escribir `--font-ui: var(--font-ui), …`
 * es una variable que se referencia a sí misma, el navegador la da por inválida
 * y todo cae al respaldo de `sans` — Jakarta — sin un solo aviso. Se traducen a
 * su composición base, que no pasa por ellas.
 */
export function pilaSinCiclo(pila: string): string {
  return pila.replace(/var\((--font-ui|--font-display)\)/g, (_, v: '--font-ui' | '--font-display') => FUENTE_BASE[v]);
}

/** Las cuatro variables con las que /reservar lleva una pareja tipográfica. */
export type VarsPareja = Record<'--font-ui' | '--portal-heading-font' | '--font-display' | '--reservar-heading-weight', string>;

/**
 * Una pareja tipográfica como las variables de /reservar, SIEMPRE las cuatro.
 *
 * ⚠️ Las cuatro también con «Moderna», y no solo las dos de
 * `fuenteReservarCssVars`: el estilo de su web las escribe EN LÍNEA sobre la
 * raíz del widget, encima de la pareja de la app que ya está en `:root`. Con
 * la app en «Editorial» y la web en «Moderna», callar `--font-display` y el
 * peso dejaba los titulares de los modales en Libre Caslon y a 700. Por eso
 * «Moderna» devuelve cada una a su valor de siempre: `--font-display` a su
 * composición base (`FUENTE_BASE`) y el peso a `initial` (la variable no
 * existe y cada titular usa el suyo).
 *
 * El `<style>` de `:root` (`temaReservarCssText`) sigue emitiendo solo las dos
 * de siempre con «Moderna»: ahí no hay nada debajo que devolver.
 */
export function varsPareja(id: TipografiaId): VarsPareja {
  const tipo = tipografiaPorId(id);
  if (tipo.id === 'moderna') {
    return {
      '--font-ui': 'var(--font-jakarta)',
      '--portal-heading-font': 'var(--font-jakarta)',
      '--font-display': FUENTE_BASE['--font-display'],
      '--reservar-heading-weight': 'initial',
    };
  }
  const titulos = pilaSinCiclo(tipo.titulos);
  return {
    '--font-ui': pilaSinCiclo(tipo.texto),
    '--portal-heading-font': titulos,
    // Los cuatro titulares de los modales leen `--font-display` directamente.
    '--font-display': titulos,
    '--reservar-heading-weight': String(tipo.pesoTitulo),
  };
}

/** La marca del estudio tal como la emite `ThemeStyle` (el tema publicado), para poder recuperarla. */
export interface MarcaEstudio {
  brand: string;
  foreground: string;
  texto: string;
}

const HEX = /^#[0-9a-fA-F]{3,8}$/;

/**
 * Saca la marca de siempre de las variables del tema publicado
 * (`themeToCssVars`, lib/theme-runtime.ts). Solo acepta hex: esto acaba en un
 * `<style>` con `dangerouslySetInnerHTML`, y un valor que no lo sea se descarta
 * en vez de pegarse.
 */
export function marcaEstudioDeVars(vars: object | null | undefined): MarcaEstudio | null {
  if (!vars) return null;
  const v = vars as Readonly<Record<string, unknown>>;
  const [brand, foreground, texto] = ['--portal-brand', '--portal-brand-foreground', '--portal-brand-texto'].map(k => v[k]);
  if (typeof brand !== 'string' || typeof foreground !== 'string' || typeof texto !== 'string') return null;
  if (!HEX.test(brand) || !HEX.test(foreground) || !HEX.test(texto)) return null;
  return { brand, foreground, texto };
}

/**
 * El `<style>` de /reservar con el estilo de la app. Va DETRÁS del de
 * `ThemeStyle` (misma especificidad, gana por orden) y sustituye al antiguo
 * `<style id="reservar-fuente">`, que hacía lo mismo solo con Jakarta.
 *
 * Emite, en `selector`:
 *   · Siempre, la pareja tipográfica. Con «Moderna», exactamente el Jakarta de
 *     antes (`fuenteReservarCssVars`).
 *   · Con un estilo que no sea «Crema», sus neutros como `--portal-*`, el fondo
 *     del `body` (lo que asoma al rebotar el scroll) y, en «Carbón»,
 *     `color-scheme: dark` — lo mismo que hace `temaAppCssText`.
 *   · Si el estudio cambió el estilo o la intensidad de marca
 *     (`reservarCambiaMarca`), la marca de la app (`acentoDe`: suave, fiel o
 *     aclarada sobre oscuro, con su contraste ya garantizado).
 *   · Siempre, la marca del estudio tal cual en `--portal-brand-estudio*`, para
 *     que el widget la recupere cuando decide su propia paleta — con la marca
 *     como texto también en su variante de noche (`-texto-noche`), para un
 *     widget de letra clara.
 *
 * `selector` existe para una futura vista previa del editor (`:root:root`, que
 * pisa lo publicado sin ganarle al widget en línea).
 */
export function temaReservarCssText(
  colorPrimario: string | null | undefined,
  crudo: unknown,
  marcaEstudio: MarcaEstudio | null,
  selector = ':root',
): string {
  const a = resolverApariencia(crudo);
  const e = estiloPorId(a.estilo);
  const tipo = tipografiaPorId(a.tipografia);
  const tokens = tokensDeEstilo(e);
  const decl: string[] = [];

  if (tipo.id === 'moderna') {
    decl.push(fuenteReservarCssVars());
  } else {
    for (const [k, v] of Object.entries(varsPareja(tipo.id))) decl.push(`${k}: ${v};`);
  }

  if (e.id !== 'crema') {
    for (const [k, v] of Object.entries(varsDeTokensReservar(tokens))) decl.push(`${k}: ${v};`);
  }

  if (reservarCambiaMarca(a)) {
    const acento = acentoDe(colorPrimario, a);
    decl.push(
      `--portal-brand: ${acento.accent};`,
      `--portal-brand-foreground: ${acento.accentForeground};`,
      `--portal-brand-texto: ${textoDeMarca(acento.accent, tokens)};`,
    );
  }

  // Sin la marca del tema (no debería pasar con un estudio real), la de
  // `:root` tal cual: sin elegir nada es la misma, y elegido algo es la de la
  // app — nunca una variable rota.
  const m = marcaEstudio ?? { brand: 'var(--portal-brand)', foreground: 'var(--portal-brand-foreground)', texto: 'var(--portal-brand-texto)' };
  decl.push(
    `--portal-brand-estudio: ${m.brand};`,
    `--portal-brand-estudio-foreground: ${m.foreground};`,
    `--portal-brand-estudio-texto: ${m.texto};`,
    `--portal-brand-estudio-texto-noche: ${marcaEstudio ? textoDeMarca(marcaEstudio.brand, RESERVAR_PALETA.noche) : 'var(--portal-brand-estudio)'};`,
  );

  const pagina = e.id === 'crema' ? ''
    : `body{background:${e.background};}` + (e.oscuro ? `${selector}{color-scheme:dark;}` : '');
  return `${selector} { ${decl.join(' ')} }${pagina}`;
}
