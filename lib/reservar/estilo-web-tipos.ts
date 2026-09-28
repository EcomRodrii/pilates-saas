// El estilo de los widgets en la web del estudio: la FORMA de lo que se guarda.
//
// Fase B del constructor de widgets (28-sep-2026): un solo estilo por estudio
// para todo lo que pone DENTRO de su web (iframe y ventana encima), que cambia
// solo al aplicarlo desde el panel, sin volver a pegar ningún código. Vive en
// el tema publicado como UN objeto (`widgetWeb`, lib/theme-schema.ts), no como
// claves sueltas: se aplica y se deshace entero, y no se mezcla con las 13
// `widget*` antiguas, que /reservar ya no lee.
//
// Módulo HOJA a propósito: lo importan el esquema del tema (servidor, zod), la
// página /reservar (cliente) y el panel. Solo depende de los catálogos cerrados
// de la app de la alumna, sin zod ni nada que pinte.
//
// ⚠️ Todo lo que sale de aquí acaba en estilos EN LÍNEA y, el color de su web,
// dentro de un `<style>` (`cssDocumentoIncrustado`). Por eso `leerWidgetWeb`
// solo deja pasar valores de los catálogos y hex de 6 dígitos: lo que no
// encaja se descarta clave a clave, nunca se pega.

import { ESTILO_IDS, TIPOGRAFIA_IDS, type EstiloId, type TipografiaId } from '../student/apariencia.ts';

/** «¿Cómo es tu web?». `null` ≡ blanca. */
export const WEBS = ['blanca', 'crema', 'oscura', 'otro'] as const;
export type WebId = (typeof WEBS)[number];

/** «Color de los botones». `null` = por defecto: la regla de /reservar de siempre (ver `botonWeb`). */
export const BOTONES_WEB = ['tinta', 'suave', 'fiel'] as const;
export type BotonWeb = (typeof BOTONES_WEB)[number];

/** Las esquinas: los mismos presets que `forma=` del snippet (lib/reservar/apariencia-widget.ts). */
export const FORMAS_WEB = ['pill', 'redondeado', 'recto'] as const;
export type FormaWeb = (typeof FORMAS_WEB)[number];

/** El color de cada web con nombre, los de la maqueta aprobada. «Otro color» lleva el suyo. */
export const COLOR_WEB = { blanca: '#FFFFFF', crema: '#F5EFE4', oscura: '#1D1E1B' } as const;
/** Lo que se propone al elegir «Otro color» por primera vez. */
export const COLOR_OTRO_INICIAL = '#E8E1D3';

/** Solo `#rrggbb`: sin alfa ni forma corta, para que el contraste se mida sobre el color que se pinta. */
export const HEX6 = /^#[0-9A-Fa-f]{6}$/;

/** El parámetro con el borrador de la vista previa del panel (solo con `embed=1&vista-previa=1`). */
export const PARAM_BORRADOR = 'borrador-web';

export interface WidgetWeb {
  /** `null` = igual que tu app. */
  estilo: EstiloId | null;
  /** `null` = como tu app. */
  letra: TipografiaId | null;
  /** `null` = por defecto (la regla de F1, ver `botonWeb` en ./estilo-web.ts). */
  boton: BotonWeb | null;
  /** `null` ≡ blanca. Sin `fundido` solo dibuja la vista previa: no cambia nada del widget. */
  web: WebId | null;
  /** Solo con `web: 'otro'`, y entonces siempre. */
  colorWeb: string | null;
  /** Que se funda con su web (fondo transparente) en vez de ir en su recuadro. */
  fundido: boolean;
  /** `null` = las de siempre. */
  forma: FormaWeb | null;
  /** `null` = cómoda. */
  densidad: 'compacta' | null;
  ocultarPie: boolean;
}

/** Nada elegido: exactamente F1 (la página se ve como la app). */
export const WIDGET_WEB_NEUTRO: Readonly<WidgetWeb> = Object.freeze({
  estilo: null, letra: null, boton: null, web: null, colorWeb: null,
  fundido: false, forma: null, densidad: null, ocultarPie: false,
});

const CLAVES = Object.keys(WIDGET_WEB_NEUTRO) as (keyof WidgetWeb)[];

function de<T extends string>(v: unknown, validos: readonly T[]): T | null {
  return typeof v === 'string' && (validos as readonly string[]).includes(v) ? (v as T) : null;
}

/**
 * Lo guardado (o lo que llega por la URL de la vista previa), validado clave a
 * clave: una clave corrupta vale lo de siempre y no arrastra a las demás —el
 * mismo criterio que `resolverApariencia` de la app—. `null` solo si no es un
 * objeto.
 *
 * `web: 'otro'` sin un hex válido no es «otro color»: sin color no hay nada
 * con lo que medir el fundido, así que web y color caen juntos. Y un color sin
 * `web: 'otro'` se descarta: el esquema exige que vayan de la mano.
 */
export function leerWidgetWeb(crudo: unknown): WidgetWeb | null {
  if (!crudo || typeof crudo !== 'object' || Array.isArray(crudo)) return null;
  const o = crudo as Record<string, unknown>;
  let web = de(o.web, WEBS);
  const colorWeb = web === 'otro' && typeof o.colorWeb === 'string' && HEX6.test(o.colorWeb) ? o.colorWeb : null;
  if (web === 'otro' && !colorWeb) web = null;
  return {
    estilo: de(o.estilo, ESTILO_IDS),
    letra: de(o.letra, TIPOGRAFIA_IDS),
    boton: de(o.boton, BOTONES_WEB),
    web,
    colorWeb,
    fundido: o.fundido === true,
    forma: de(o.forma, FORMAS_WEB),
    densidad: o.densidad === 'compacta' ? 'compacta' : null,
    ocultarPie: o.ocultarPie === true,
  };
}

/**
 * ¿No cambia nada respecto a la app? Cómo es su web solo cuenta si se funde:
 * en su recuadro el widget se ve igual sobre una web blanca que sobre una
 * oscura (la pregunta sirve entonces para dibujar la vista previa).
 */
export function esNeutro(w: WidgetWeb | null | undefined): boolean {
  if (!w) return true;
  return w.estilo == null && w.letra == null && w.boton == null && !w.fundido
    && w.forma == null && w.densidad == null && !w.ocultarPie;
}

/** El mismo estilo, con «nada elegido» ≡ `null` (lo que se guarda como ausente). */
export function mismoWidgetWeb(a: WidgetWeb | null, b: WidgetWeb | null): boolean {
  if (esNeutro(a) || esNeutro(b)) return esNeutro(a) && esNeutro(b);
  return CLAVES.every(k => {
    const x = a![k];
    const y = b![k];
    return typeof x === 'string' && typeof y === 'string' ? x.toLowerCase() === y.toLowerCase() : x === y;
  });
}

/** El color de su web: el de «Otro color» o el de la web con nombre. Sin contestar, blanca. */
export function colorDeLaWeb(w: WidgetWeb | null): string {
  if (w?.web === 'otro' && w.colorWeb && HEX6.test(w.colorWeb)) return w.colorWeb;
  if (w?.web && w.web !== 'otro') return COLOR_WEB[w.web];
  return COLOR_WEB.blanca;
}

/**
 * El borrador como valor de `borrador-web=`: un JSON con SOLO lo que difiere
 * de «nada elegido», para que la URL de la vista previa se quede corta.
 * `leerWidgetWeb(JSON.parse(x))` lo devuelve tal cual.
 */
export function borradorAParam(w: WidgetWeb): string {
  const distinto: Partial<Record<keyof WidgetWeb, unknown>> = {};
  for (const k of CLAVES) if (w[k] !== WIDGET_WEB_NEUTRO[k]) distinto[k] = w[k];
  return JSON.stringify(distinto);
}
