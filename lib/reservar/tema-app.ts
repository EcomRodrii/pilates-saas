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
import { hexARgb, ratioContraste } from '../wcag-contrast.ts';
import { colorLegibleSobre, mezclarHex } from '../color-utils.ts';
import { acentoDe, estiloPorId, resolverApariencia, tipografiaPorId, type AparienciaApp, type Estilo } from '../student/apariencia.ts';
import { RESERVAR_PALETA, fuenteReservarCssVars, varsDeTokensReservar } from '../reservar-publico-tokens.ts';
import type { TemaAppReservar } from './precedencia-tema.ts';

/**
 * ¿Ha elegido algo el estudio que /reservar deba seguir? Es la misma pregunta
 * que se hace `temaAppCssText`, sin el encuadre de la portada: ese solo mueve la
 * foto de la app, y no puede ser que mover una foto cambie el color de los
 * botones de la página de reservas.
 */
export function esReservarPorDefecto(a: AparienciaApp): boolean {
  return a.estilo === 'crema' && a.tipografia === 'moderna' && a.marca === 'suave' && a.boton === 'tinta';
}

function rgba(hex: string, alfa: number): string {
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

/** Lo que el layout le pasa a la página (cliente) por el proveedor. */
export function temaAppParaReservar(crudo: unknown): TemaAppReservar {
  const e = estiloPorId(resolverApariencia(crudo).estilo);
  return { tokens: tokensDeEstilo(e), oscuro: e.oscuro === true };
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
 * La marca como TEXTO (un enlace, una cifra suelta) legible sobre las tres
 * superficies donde se pinta: se mide contra la que peor contrasta y se
 * oscurece —o aclara, en oscuro— solo lo justo. En «Luz» la tarjeta es MÁS
 * oscura que el fondo, así que medir solo contra el fondo no bastaría.
 */
export function textoDeMarca(marca: string, t: ModoTokens): string {
  const r = (fondo: string) => ratioContraste(marca, fondo) ?? 0;
  const peor = [t.bg, t.surface, t.surface2].reduce((p, f) => (r(f) < r(p) ? f : p));
  return colorLegibleSobre(marca, peor);
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
 *   · Si el estudio eligió algo, la marca de la app (`acentoDe`: suave, fiel o
 *     aclarada sobre oscuro, con su contraste ya garantizado).
 *   · Siempre, la marca del estudio tal cual en `--portal-brand-estudio*`, para
 *     que el widget la recupere cuando decide su propia paleta.
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
    const titulos = pilaSinCiclo(tipo.titulos);
    decl.push(
      `--font-ui: ${pilaSinCiclo(tipo.texto)};`,
      `--portal-heading-font: ${titulos};`,
      // Los cuatro titulares de los modales leen `--font-display` directamente.
      `--font-display: ${titulos};`,
      `--reservar-heading-weight: ${tipo.pesoTitulo};`,
    );
  }

  if (e.id !== 'crema') {
    for (const [k, v] of Object.entries(varsDeTokensReservar(tokens))) decl.push(`${k}: ${v};`);
  }

  if (!esReservarPorDefecto(a)) {
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
  );

  const pagina = e.id === 'crema' ? ''
    : `body{background:${e.background};}` + (e.oscuro ? `${selector}{color-scheme:dark;}` : '');
  return `${selector} { ${decl.join(' ')} }${pagina}`;
}
