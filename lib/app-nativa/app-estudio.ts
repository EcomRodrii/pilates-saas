// La app de un estudio (la que sale de la cuenta de Tentare con su nombre, icono y
// color) frente a la app «Tentare» y la web. Lógica pura: sin imports de `@/`,
// para que `node --test` la ejecute.
//
// El bundle id lo da la carcasa nativa (`bundleIdDeLaApp`): `null` en la web,
// `app.tentare` en la app genérica y otro cualquiera en la de un estudio. Es un
// dato del cliente y se puede falsear, así que SOLO sirve para estrechar (abrir
// en un estudio concreto), nunca para dar acceso a nada: la sesión y la pertenencia
// al estudio las sigue decidiendo el servidor.

export const BUNDLE_TENTARE = 'app.tentare';

/** El mismo formato que la columna `apps_estudio.bundle_id`. */
export function esBundleDeEstudio(bundle: unknown): bundle is string {
  return typeof bundle === 'string'
    && bundle === bundle.toLowerCase()
    && bundle !== BUNDLE_TENTARE
    && bundle.length <= 155
    && /^[a-z][a-z0-9-]*(\.[a-z0-9-]+)+$/.test(bundle);
}

/** `'estudio'` solo si el bundle tiene el formato de una app de estudio; web y app «Tentare», `'general'`. */
export function tipoDeApp(bundle: string | null | undefined): 'general' | 'estudio' {
  return esBundleDeEstudio(bundle) ? 'estudio' : 'general';
}

export interface AppDeEstudio {
  slug: string;
  nombre: string;
  nombreApp: string;
  bundleId: string;
  icono: string;
  color: string | null;
  /**
   * Las sedes de la app de una CADENA (una app por cadena, decisión del fundador 15-oct-2026), la
   * principal primero. Solo con dos o más; en un estudio suelto no viene.
   */
  sedes?: SedeDeLaApp[];
}

export interface SedeDeLaApp { slug: string; nombre: string; icono: string; color: string | null }

const SLUG_VALIDO = /^[a-z0-9-]{1,80}$/;

function esSede(d: unknown): d is SedeDeLaApp {
  if (!d || typeof d !== 'object') return false;
  const o = d as Record<string, unknown>;
  return typeof o.slug === 'string' && SLUG_VALIDO.test(o.slug)
    && typeof o.nombre === 'string' && o.nombre.length > 0
    && typeof o.icono === 'string'
    && (o.color === null || typeof o.color === 'string');
}

/** Lo mínimo que la entrada necesita para fijarse en un estudio (y, si es de cadena, en sus sedes). */
export function esAppDeEstudio(d: unknown): d is AppDeEstudio {
  if (!esSede(d)) return false;
  const sedes = (d as { sedes?: unknown }).sedes;
  return sedes === undefined || (Array.isArray(sedes) && sedes.every(esSede));
}

/** Las sedes de una app de cadena, o `null` si es la de un estudio suelto (o solo queda una). */
export function sedesDeLaApp(app: AppDeEstudio | null): SedeDeLaApp[] | null {
  return app?.sedes && app.sedes.length >= 2 ? app.sedes : null;
}

/**
 * A dónde entra la alumna en la app de una CADENA, con su cuenta ya abierta.
 *  · `enlace`: la sede que pide un enlace (`?estudio=`), si es de esta cadena;
 *  · `pideLista`: «Cambiar de sede» (`?elegir=1`): siempre la lista;
 *  · si no, a la última que abrió en este móvil, o a la única de la cadena donde ya es alumna;
 *  · si es de varias (sin última) o de ninguna, la lista de sedes para elegir (en una que aún no es
 *    suya, se da de alta).
 */
export type EntradaEnCadena = { tipo: 'ir'; slug: string } | { tipo: 'alta'; slug: string } | { tipo: 'elegir' };

export function entradaEnCadena(
  sedes: readonly SedeDeLaApp[], suyas: ReadonlySet<string>,
  o: { ultimo: string | null; pideLista: boolean; enlace: string | null },
): EntradaEnCadena {
  const deLaCadena = (slug: string | null): slug is string => !!slug && sedes.some((s) => s.slug === slug);
  if (deLaCadena(o.enlace)) return suyas.has(o.enlace) ? { tipo: 'ir', slug: o.enlace } : { tipo: 'alta', slug: o.enlace };
  if (o.pideLista) return { tipo: 'elegir' };
  if (deLaCadena(o.ultimo) && suyas.has(o.ultimo)) return { tipo: 'ir', slug: o.ultimo };
  const enLaCadena = sedes.filter((s) => suyas.has(s.slug));
  return enLaCadena.length === 1 ? { tipo: 'ir', slug: enLaCadena[0].slug } : { tipo: 'elegir' };
}
