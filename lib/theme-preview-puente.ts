// La mitad del tema que NO es CSS, y cómo viaja por el puente del preview.
//
// El puente `tentare-theme-preview` (editor → iframe) nació transportando solo
// CSS vars, porque al principio un tema solo cambiaba color, tipografía y
// radio. Desde `variantes` (lib/theme-variantes.ts) eso ya no es cierto: hay
// ejes del tema que deciden qué elementos EXISTEN en el DOM, y esos se
// resuelven en JS —`resolveVariantes()` en lib/studio-context.tsx— nunca como
// una custom property. Resultado: el preview grande del editor
// (/portal-preview/[slug]) mostraba la paleta del borrador pero la FORMA del
// tema publicado — la propietaria elegía tema viendo la mitad de lo que cambia.
//
// Este módulo fija lo que va en el campo `temaJs` del mensaje. Tres campos, no
// solo `variantes`: `barraClasica` y `tabBarStyle` son exactamente el mismo
// tipo de eje (valor JS que decide render, no CSS var) y arrastran el mismo
// problema desde antes. Se resuelven juntos para que "la mitad JS del tema" sea
// UNA cosa que se pisa entera, y no tres overrides sueltos que puedan quedar a
// medias.
//
// Módulo PURO a propósito (sin React ni zod), como lib/theme-variantes.ts y
// lib/portal-nav.ts: lo importa tanto el emisor (components/theme/*) como el
// receptor (lib/studio-context.tsx), que se monta en TODO el portal de socias y
// no debe arrastrar zod a ese bundle. Por eso `TabBarStyleId` entra como import
// de TIPO y su validación se escribe a mano abajo.

import { resolveVariantes, type VariantesResueltas } from './theme-variantes.ts';
import type { TabBarStyleId, QuickLinksStyleId } from './theme-schema.ts';
// `esTemaPortal` es una guarda pura sobre un objeto literal — no arrastra React
// ni zod, así que puede entrar en este módulo.
import { esTemaPortal, type TemaPortalId } from '../themes/registro.ts';

/** Tipo de mensaje del puente. Lo emiten ThemePreview y HomePreview; lo escuchan
 *  ThemePreviewListener (CSS vars) y StudioProvider (esto). */
export const MENSAJE_TEMA_PREVIEW = 'tentare-theme-preview';

/** Los ejes del tema que se resuelven en JS. Siempre completo, nunca parcial. */
export interface TemaJs {
  variantes: VariantesResueltas;
  barraClasica: boolean;
  tabBarStyle: TabBarStyleId;
  // Solo afecta a temas del kit — ver ESTILOS_ACCESOS_RAPIDOS en
  // theme-schema.ts. `null` = hereda el look de fábrica del tema (Noir
  // 'bare', los otros 'cards'), igual en emisor y receptor: mismo nombre de
  // campo en los dos extremos, sin la asimetría que tiene `temaKit` más
  // abajo.
  quickLinksStyle: QuickLinksStyleId | null;
  /**
   * Qué tema del kit en React es el borrador, si es que lo es.
   *
   * ⚠️ Es el eje MÁS grande de todos, y llegó el último: decide qué portal se
   * pinta entero, no un elemento suelto. Sin él, la vista previa del editor
   * montaba SIEMPRE el portal de siempre — así que la propietaria elegía un
   * tema del kit, veía cómo quedaba en el portal que sus socias ya no usan, y
   * lo que publicaba no se parecía a lo que había mirado.
   *
   * `null` = no es del kit (o el mensaje es viejo y no lo trae): se pinta el
   * portal de siempre, que es lo que hacía antes.
   */
  temaKit: TemaPortalId | null;
}

/**
 * Resuelve la mitad JS de un tema. Sirve para los DOS extremos del puente:
 * el emisor la aplica sobre el `ThemeConfig` en borrador, el receptor sobre lo
 * que llegó por `postMessage` — que es entrada no confiable y se valida igual
 * de estricto que en `fetchPublicStudioData` (mismas reglas que usa
 * StudioProvider con el tema publicado: `resolveVariantes` clave a clave,
 * `=== true`, y el único valor no-'clasica' de la barra escrito a mano).
 *
 * Devuelve `null` cuando no hay nada que resolver (mensaje sin `temaJs`, tema
 * en borrador todavía sin cargar): eso significa "no pises nada", que es
 * distinto de "pisa con los valores por defecto" — un mensaje viejo sin el
 * campo no debe borrar la forma del tema publicado.
 */
/** Un id del kit, o `null`. Acepta cualquiera de los dos nombres del puente. */
function idDeTema(valor: unknown): TemaPortalId | null {
  return typeof valor === 'string' && esTemaPortal(valor) ? valor : null;
}

export function resolveTemaJs(raw: unknown): TemaJs | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  return {
    variantes: resolveVariantes(o.variantes),
    barraClasica: o.barraClasica === true,
    tabBarStyle: o.tabBarStyle === 'pestanaActiva' ? 'pestanaActiva' : 'clasica',
    // Entrada no confiable, mismo criterio que el resto: solo 'cards'/'bare'
    // pasan, cualquier otra cosa (incluido un mensaje viejo sin el campo) cae
    // a `null` — "no pises nada", no un valor por defecto inventado.
    quickLinksStyle: o.quickLinksStyle === 'cards' || o.quickLinksStyle === 'bare' ? o.quickLinksStyle : null,
    // ⚠️ Se aceptan LOS DOS nombres, y no es por comodidad: esta función corre
    // en los dos extremos del puente (lo dice la cabecera). El emisor se la
    // aplica al `ThemeConfig`, donde el campo se llama `themeId`, y devuelve
    // ya un `TemaJs`, donde se llama `temaKit`. El receptor se la aplica a ESE
    // resultado. O sea que tiene que ser IDEMPOTENTE — leer solo uno de los
    // dos rompe el viaje de vuelta.
    //
    // Las dos versiones anteriores fallaron justo por ahí: la primera pedía
    // `temaKit` y dos de los tres emisores mandaban el `ThemeConfig` crudo
    // (sin él); la segunda pasó a leer `themeId` y entonces se rompió el lado
    // receptor, que recibe lo ya normalizado. Ninguna se vio en local: los
    // tests probaban un extremo cada vez, nunca la ida y la vuelta.
    //
    // Entrada NO confiable, igual que el resto: solo pasa un id que exista de
    // verdad en el registro de temas.
    temaKit: idDeTema(o.themeId) ?? idDeTema(o.temaKit),
  };
}
