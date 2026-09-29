// Lo pegado en la web del estudio: con qué forma y dónde se ve (Fase C).
//
// Reglas puras que comparten la página (/reservar, que lo manda con
// `widget_loaded`), la ruta que lo guarda (/api/public/evento) y el panel (la
// portada «Lo que tienes en tu web»). Sin React ni Supabase: node --test.
//
// ⚠️ Solo tres formas dicen dónde se ven: dentro de una página (`incrustado`),
// encima (`ventana`) y sin marco (`nativa`, cuyo anfitrión pone el servidor a
// partir de la cabecera `Origin`). Botón y enlace no mandan NADA, a propósito:
// quien pulsa un enlace llega de Instagram, de WhatsApp o de un blog personal,
// que no es la web del estudio, y la misma sesión lleva después el id de la
// socia. Guardarlo ataría a una persona con la web de la que vino.

import { canonicalizarOrigen } from '../legal-info.ts';
import type { MetodoIntegracion } from './catalogo.ts';

export type FormaPegada = 'incrustado' | 'ventana' | 'nativa';

export const FORMAS_PEGADAS: readonly FormaPegada[] = ['incrustado', 'ventana', 'nativa'];

/**
 * Una firma de `firmaDeUrl` (./firma-contenido.ts): `c`, la versión y el
 * FNV-1a de 32 bits en base 36 (hasta 7 caracteres). La misma expresión que el
 * CHECK de `widget_eventos.firma`.
 */
export const FIRMA_CONTENIDO_VALIDA = /^c[0-9][0-9a-z]{1,7}$/;

/** La forma con la que se ve lo copiado con este método, o `null` si no se mide dónde se ve. */
export function formaDeMetodo(m: MetodoIntegracion): FormaPegada | null {
  // Un `switch` y no un objeto: `copiado.metodo` sale de un jsonb, y con un
  // objeto `'toString'` devolvería una función en vez de `null`.
  switch (m) {
    case 'iframe': return 'incrustado';
    case 'popup': return 'ventana';
    case 'nativa': return 'nativa';
    default: return null;
  }
}

/**
 * Cómo se reconoce una versión vista. Con la forma delante: el iframe y el
 * popup cargan la MISMA URL, así que la firma sola no distingue una pieza
 * dentro de una página de la misma pieza abriéndose encima.
 */
export function claveVista(forma: FormaPegada, firma: string): string {
  return `${forma}:${firma}`;
}

const ETIQUETA_DNS = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const HOSTS_LOCALES = new Set(['localhost', '127.0.0.1']);
const ORIGEN_MAX = 300;

/**
 * Solo el ORIGEN, http o https; sin credenciales ni IP (salvo localhost y
 * 127.0.0.1); etiquetas DNS; ≤300; 'null' o '' → null.
 *
 * ⚠️ No es `normalizarOrigenWidget` (lib/widget/dominios-autorizados.ts): esa
 * decide qué se AUTORIZA y rechaza `http:`, con razón. Esta solo cuenta dónde
 * se vio, y una web del estudio en `http` es una web del estudio: con aquella,
 * saldría como «una web que no nos dice su dirección», que es falso.
 *
 * Nunca se queda con la ruta ni la query (de un `document.referrer` completo,
 * solo el origen), y lo que devuelve cabe en el CHECK de
 * `widget_eventos.anfitrion`. El tope de 300 es sobre ese origen, no sobre lo
 * que llega: un referrer con una ruta larga sigue diciendo de qué web viene.
 */
export function origenAnfitrion(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const v = valor.trim();
  // `'null'` es lo que dan un iframe sandbox, `file://` y `ancestorOrigins` sin origen.
  if (!v || v === 'null') return null;
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (u.username || u.password) return null;
  const host = u.hostname;
  if (!HOSTS_LOCALES.has(host)) {
    if (host.length > 253 || host.startsWith('[') || /^[\d.]+$/.test(host)) return null;
    const etiquetas = host.split('.');
    if (etiquetas.length < 2 || !etiquetas.every(e => ETIQUETA_DNS.test(e))) return null;
    if (/^\d+$/.test(etiquetas[etiquetas.length - 1])) return null;
  }
  return u.origin.length <= ORIGEN_MAX ? u.origin : null;
}

function canonico(origen: string): string | null {
  try {
    const o = new URL(origen).origin;
    return o === 'null' ? null : canonicalizarOrigen(o);
  } catch {
    return null;
  }
}

/**
 * true si el origen es uno de `propios` (comparados con canonicalizarOrigen:
 * el apex cuenta como `www`, que es adonde redirige). Sin `*.vercel.app`: eso
 * lo añade `esOrigenDeTentare`.
 *
 * Aparte porque la página necesita distinguir lo SEGURO (su propio origen y
 * el canónico: la carga no es de ninguna web del estudio) de lo DUDOSO (otro
 * `*.vercel.app`, que puede ser una vista previa de Tentare o la web de un
 * estudio alojada ahí).
 */
export function esOrigenPropio(origen: string, propios: readonly string[]): boolean {
  const c = canonico(origen);
  return !!c && propios.some(p => canonico(p) === c);
}

/**
 * true si el origen es de Tentare: está en `propios` (comparados con
 * canonicalizarOrigen) o su host acaba en `.vercel.app`.
 *
 * Lo propio no es «su web»: el widget también se ve dentro de Tentare (el
 * onboarding, el portal, las vistas previas de cada despliegue), y contarlo
 * como «Visto en www.tentare.app» sería mentirle. `propios` lo pone quien
 * llama (el origen canónico y el de la propia petición); el apex cuenta como
 * `www`, que es adonde redirige.
 * ⚠️ Una web del estudio alojada en `*.vercel.app` no se distingue de una
 * vista previa de Tentare: nunca se NOMBRA. Pero su carga sí cuenta (la
 * página la manda sin dirección, lib/reservar/pegado-widget.ts): si no, esa
 * web no saldría nunca en la portada.
 */
export function esOrigenDeTentare(origen: string, propios: readonly string[]): boolean {
  const c = canonico(origen);
  if (!c) return false;
  if (new URL(c).hostname.endsWith('.vercel.app')) return true;
  return esOrigenPropio(c, propios);
}

/** Una fila de `widget_vistos()`: dónde y con qué versión se ha visto una pieza. */
export interface VistoWidget {
  /** La etiqueta (`ref`) con la que llegó. */
  origen: string;
  forma: FormaPegada;
  /** El origen de su web, o `null` si no nos lo dijo. */
  anfitrion: string | null;
  /**
   * `firmaDeUrl` de lo que cargó, o `null` (visitas de antes de guardarla, o
   * servidas con un `widget.js` en caché). La nativa, desde la Fase E, la
   * calcula de sus `data-*`.
   */
  firma: string | null;
  /** ISO. */
  primero: string;
  /** ISO. */
  ultimo: string;
  n: number;
}

/**
 * Las filas que PostgREST devuelve como mucho en una petición (`max-rows` del
 * proyecto). Una respuesta que llega a ese número puede venir recortada.
 */
export const MAX_FILAS_POSTGREST = 1000;

/**
 * Lo que devuelve `widget_vistos()`, listo para el panel (dbWidgetVistos,
 * lib/supabase-data.ts). `null` = no se sabe: si llega al tope de PostgREST
 * puede faltar justo lo de una pieza, y la portada diría de ella «Aún no lo
 * vemos en tu web» sin ser cierto. Mejor no decir nada.
 */
export function leerVistos(filas: readonly unknown[]): VistoWidget[] | null {
  if (filas.length >= MAX_FILAS_POSTGREST) return null;
  const out: VistoWidget[] = [];
  for (const f of filas) {
    if (!f || typeof f !== 'object') continue;
    const r = f as Record<string, unknown>;
    // Una forma que este código no conoce (una columna ampliada antes de
    // desplegar) no se pinta como si fuera otra.
    const forma = FORMAS_PEGADAS.find(x => x === r.forma);
    if (!forma || typeof r.origen !== 'string' || typeof r.primero !== 'string' || typeof r.ultimo !== 'string') continue;
    out.push({
      origen: r.origen, forma,
      anfitrion: typeof r.anfitrion === 'string' ? r.anfitrion : null,
      firma: typeof r.firma === 'string' ? r.firma : null,
      primero: r.primero, ultimo: r.ultimo, n: Number(r.n),
    });
  }
  return out;
}
