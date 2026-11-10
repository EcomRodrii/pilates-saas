// Las etiquetas de alumnas: el catálogo de cada estudio (nombre + color) y lo que sale de juntarlo con lo que ya hay en las
// fichas. Pura y sin imports: la ejecuta `node --test` directamente.
//
// Quién tiene cada etiqueta sigue en `socios.tags` (campañas, segmentos y el filtro de Clientas la leen de ahí). El
// catálogo (`etiquetas`, migr 20261110105611) añade un nombre estable, un color y las etiquetas que aún no tiene nadie.
// Una etiqueta puesta en alguna ficha y que no está en el catálogo SIGUE siendo válida: se lista, sin color propio.
// Las etiquetas no se distinguen por mayúsculas («VIP» y «vip» son la misma), igual que en la base de datos.

export const COLORES_ETIQUETA = ['gris', 'rosa', 'rojo', 'naranja', 'amarillo', 'verde', 'azul', 'violeta'] as const;
export type ColorEtiqueta = (typeof COLORES_ETIQUETA)[number];

export const MAX_NOMBRE_ETIQUETA = 30;

export interface Etiqueta {
  readonly id: string;
  readonly nombre: string;
  readonly color: ColorEtiqueta;
}

/** Una fila de la lista de Configuración o del selector de la ficha. */
export interface EtiquetaEnLista {
  /** `null` = está en alguna ficha pero no en el catálogo. */
  readonly id: string | null;
  readonly nombre: string;
  readonly color: ColorEtiqueta;
  /** A cuántas alumnas se la has puesto. */
  readonly usos: number;
}

/**
 * Las siete que la ficha ofrecía de serie. Siguen saliendo como SUGERIDAS al etiquetar, para que quien ya las usaba no
 * pierda su atajo; si el estudio crea o usa una con el mismo nombre, manda la suya.
 */
export const SUGERIDAS: readonly { readonly nombre: string; readonly color: ColorEtiqueta }[] = [
  { nombre: 'VIP', color: 'rosa' },
  { nombre: 'Prueba', color: 'amarillo' },
  { nombre: 'Lesión', color: 'rojo' },
  { nombre: 'Embarazo', color: 'verde' },
  { nombre: 'Baja temp.', color: 'gris' },
  { nombre: 'Online', color: 'azul' },
  { nombre: 'Profesora', color: 'naranja' },
];

/** Los colores de la paleta categórica del panel (clara y oscura, con contraste comprobado), no hexadecimales sueltos. */
const VARIABLE_DE_COLOR: Record<ColorEtiqueta, string> = {
  gris: 'var(--muted-foreground)',
  rosa: 'var(--cat-7)',
  rojo: 'var(--destructive)',
  naranja: 'var(--cat-8)',
  amarillo: 'var(--cat-9)',
  verde: 'var(--cat-2)',
  azul: 'var(--cat-4)',
  violeta: 'var(--cat-6)',
};

export const NOMBRE_DE_COLOR: Record<ColorEtiqueta, string> = {
  gris: 'Gris', rosa: 'Rosa', rojo: 'Rojo', naranja: 'Naranja', amarillo: 'Amarillo', verde: 'Verde', azul: 'Azul', violeta: 'Violeta',
};

/** Fondo suave y texto del color: el estilo de una etiqueta. */
export function estiloDeEtiqueta(color: ColorEtiqueta): { backgroundColor: string; color: string; borderColor: string } {
  const c = VARIABLE_DE_COLOR[color];
  return {
    backgroundColor: `color-mix(in srgb, ${c} 12%, var(--card))`,
    color: c,
    borderColor: `color-mix(in srgb, ${c} 25%, var(--card))`,
  };
}

export function esColorEtiqueta(v: unknown): v is ColorEtiqueta {
  return typeof v === 'string' && (COLORES_ETIQUETA as readonly string[]).includes(v);
}

/** El nombre como se guarda: sin espacios de más, ni al principio, ni al final, ni repetidos por dentro. */
export function normalizarNombre(nombre: string): string {
  return nombre.replace(/\s+/g, ' ').trim();
}

const clave = (nombre: string) => nombre.toLocaleLowerCase('es');

/**
 * El motivo por el que un nombre no vale, o `null` si vale. `existentes` son los nombres que ya hay (catálogo y fichas);
 * `actual` es el nombre que se está editando, que no cuenta como repetido consigo mismo (cambiar solo mayúsculas vale).
 */
export function motivoNombreNoValido(nombre: string, existentes: readonly string[], actual?: string): string | null {
  const n = normalizarNombre(nombre);
  if (n.length === 0) return 'Escribe un nombre.';
  if (n.length > MAX_NOMBRE_ETIQUETA) return `Máximo ${MAX_NOMBRE_ETIQUETA} caracteres.`;
  const k = clave(n);
  if (actual !== undefined && clave(actual) === k) return null;
  if (existentes.some(e => clave(e) === k)) return 'Ya hay una etiqueta con ese nombre.';
  return null;
}

/**
 * Lo que sabe el estudio: el catálogo y lo que está en las fichas, juntos y sin repetir, con cuántas alumnas tiene cada
 * una. Manda el nombre y el color del catálogo; sin catálogo, la grafía más usada en las fichas y gris. Orden alfabético.
 */
export function listaDeEtiquetas(catalogo: readonly Etiqueta[], socios: readonly { readonly tags?: readonly string[] | null }[]): EtiquetaEnLista[] {
  const porClave = new Map<string, { id: string | null; nombre: string; color: ColorEtiqueta; usos: number; grafias: Map<string, number> }>();
  for (const e of catalogo) {
    porClave.set(clave(e.nombre), { id: e.id, nombre: e.nombre, color: e.color, usos: 0, grafias: new Map() });
  }
  for (const s of socios) {
    // Una alumna cuenta una vez por etiqueta aunque la tenga escrita de dos maneras.
    const vistas = new Set<string>();
    for (const t of s.tags ?? []) {
      const n = normalizarNombre(t);
      if (!n) continue;
      const k = clave(n);
      let f = porClave.get(k);
      if (!f) { f = { id: null, nombre: n, color: 'gris', usos: 0, grafias: new Map() }; porClave.set(k, f); }
      f.grafias.set(n, (f.grafias.get(n) ?? 0) + 1);
      if (!vistas.has(k)) { vistas.add(k); f.usos += 1; }
    }
  }
  const lista: EtiquetaEnLista[] = [];
  for (const f of porClave.values()) {
    let nombre = f.nombre;
    if (f.id === null) {
      // Sin catálogo: la grafía que más se ha escrito (y, a igualdad, la primera por orden alfabético).
      nombre = [...f.grafias.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'))[0]?.[0] ?? f.nombre;
    }
    lista.push({ id: f.id, nombre, color: f.color, usos: f.usos });
  }
  return lista.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

/**
 * Lo que se ofrece al etiquetar a una alumna: las del estudio (catálogo y fichas) y, después, las sugeridas que el estudio
 * aún no tiene; sin las que ya lleva puestas.
 */
export function opcionesParaPoner(
  catalogo: readonly Etiqueta[],
  socios: readonly { readonly tags?: readonly string[] | null }[],
  yaPuestas: readonly string[],
): EtiquetaEnLista[] {
  const suyas = listaDeEtiquetas(catalogo, socios);
  const conocidas = new Set(suyas.map(e => clave(e.nombre)));
  const sugeridas: EtiquetaEnLista[] = SUGERIDAS
    .filter(s => !conocidas.has(clave(s.nombre)))
    .map(s => ({ id: null, nombre: s.nombre, color: s.color, usos: 0 }));
  const puestas = new Set(yaPuestas.map(t => clave(normalizarNombre(t))));
  return [...suyas, ...sugeridas].filter(e => !puestas.has(clave(e.nombre)));
}

/** El color con el que pintar una etiqueta puesta en una ficha: el del catálogo, o el de la sugerida de serie, o gris. */
export function colorDe(nombre: string, catalogo: readonly Etiqueta[]): ColorEtiqueta {
  const k = clave(normalizarNombre(nombre));
  const del = catalogo.find(e => clave(e.nombre) === k);
  if (del) return del.color;
  return SUGERIDAS.find(s => clave(s.nombre) === k)?.color ?? 'gris';
}

/**
 * Lo que pasa en las fichas al renombrar, para enseñarlo ANTES de confirmar: a cuántas alumnas toca y si el nuevo nombre
 * ya existe (entonces las dos etiquetas se funden en una).
 */
export function efectoDeRenombrar(lista: readonly EtiquetaEnLista[], viejo: string, nuevo: string): { alumnas: number; seFunde: boolean } {
  const kv = clave(normalizarNombre(viejo));
  const kn = clave(normalizarNombre(nuevo));
  const del = lista.find(e => clave(e.nombre) === kv);
  const seFunde = kv !== kn && lista.some(e => clave(e.nombre) === kn);
  return { alumnas: del?.usos ?? 0, seFunde };
}

/** El valor de hoy de la fila de Configuración. */
export function resumenDeEtiquetas(lista: readonly EtiquetaEnLista[] | null): string | null {
  if (lista === null) return null;
  if (lista.length === 0) return 'Ninguna';
  return lista.length === 1 ? '1 etiqueta' : `${lista.length} etiquetas`;
}
