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
}

/** Lo mínimo que la entrada necesita para fijarse en un estudio. */
export function esAppDeEstudio(d: unknown): d is AppDeEstudio {
  if (!d || typeof d !== 'object') return false;
  const o = d as Record<string, unknown>;
  return typeof o.slug === 'string' && /^[a-z0-9-]{1,80}$/.test(o.slug)
    && typeof o.nombre === 'string' && o.nombre.length > 0
    && typeof o.icono === 'string'
    && (o.color === null || typeof o.color === 'string');
}
