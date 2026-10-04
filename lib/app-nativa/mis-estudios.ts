// Los estudios de una cuenta, para la entrada de la app (`/app`). Puro: se prueba
// con `node --test`. La consulta vive en app/api/app/mis-estudios/route.ts.

export interface FilaEstudioCuenta {
  id: string;
  slug: string | null;
  nombre: string | null;
  ciudad?: string | null;
  logo_url: string | null;
  color_primario: string | null;
}

export interface EstudioDeLaCuenta {
  slug: string;
  nombre: string;
  /** Instructora entra a su parte del equipo; si además es alumna, elige dentro. */
  como: 'alumna' | 'instructora' | 'las-dos';
  ciudad: string | null;
  logo: string | null;
  color: string | null;
}

/** A dónde va cada uno al elegirlo: la app del estudio, o su parte de equipo. */
export function rutaDeEntrada(e: Pick<EstudioDeLaCuenta, 'slug' | 'como'>): string {
  const base = `/portal/${encodeURIComponent(e.slug)}`;
  return e.como === 'instructora' ? `${base}/equipo` : base;
}

/** Sin slug no hay app a la que ir; ordenados por nombre, como los ve la persona. */
export function estudiosDeLaCuenta(
  filas: readonly FilaEstudioCuenta[],
  comoAlumna: ReadonlySet<string>,
  comoInstructora: ReadonlySet<string>,
): EstudioDeLaCuenta[] {
  return filas
    .filter((f): f is FilaEstudioCuenta & { slug: string } => !!f.slug)
    .map((f) => {
      const a = comoAlumna.has(f.id);
      const i = comoInstructora.has(f.id);
      return {
        slug: f.slug,
        nombre: (f.nombre ?? '').trim() || f.slug,
        como: a && i ? 'las-dos' : i ? 'instructora' : 'alumna',
        ciudad: (f.ciudad ?? '').trim() || null,
        logo: f.logo_url,
        color: f.color_primario,
      } satisfies EstudioDeLaCuenta;
    })
    .sort((x, y) => x.nombre.localeCompare(y.nombre, 'es'));
}

/**
 * Los estudios donde es alumna: los de las fichas ya vinculadas a su cuenta y los
 * de las fichas con su email que aún no lo están (la dio de alta el estudio, o
 * vino importada, y nunca ha entrado). Esas se vinculan solas al entrar en la app
 * del estudio (`resolverSociaAutenticada`), con el mismo email verificado.
 */
export function estudiosComoAlumna(
  vinculadas: readonly { studio_id: string }[],
  porEmail: readonly { studio_id: string }[],
): Set<string> {
  return new Set([...vinculadas, ...porEmail].map((f) => f.studio_id));
}

/** «Hola, Lucía»: el nombre de pila de su ficha, o nada si no lo hay. */
export function nombreDePila(nombres: readonly (string | null | undefined)[]): string | null {
  for (const n of nombres) {
    const pila = (n ?? '').trim().split(/\s+/)[0];
    if (pila) return pila.slice(0, 40);
  }
  return null;
}

/** El último que abrió va el primero; el resto, por nombre. */
export function conElUltimoPrimero<T extends { slug: string }>(estudios: readonly T[], ultimo: string | null): T[] {
  const i = ultimo ? estudios.findIndex((e) => e.slug === ultimo) : -1;
  return i <= 0 ? [...estudios] : [estudios[i], ...estudios.slice(0, i), ...estudios.slice(i + 1)];
}

/** La clave del último estudio abierto en este dispositivo (se entra directo la próxima vez). */
export const CLAVE_ULTIMO_ESTUDIO = 'tentare-app-ultimo-estudio';

/**
 * ¿A dónde se va sin preguntar? Al último que abrió si sigue en su lista; si solo
 * tiene uno, a ese. Si no, `null`: se le enseña la lista.
 */
export function entradaDirecta(estudios: readonly EstudioDeLaCuenta[], ultimo: string | null): EstudioDeLaCuenta | null {
  if (ultimo) {
    const e = estudios.find((x) => x.slug === ultimo);
    if (e) return e;
  }
  return estudios.length === 1 ? estudios[0] : null;
}
