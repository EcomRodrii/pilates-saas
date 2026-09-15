// El buscador del inicio de Configuración.
//
// «¿Dónde se cambia el IVA?» no tenía respuesta: ⌘K solo busca las pantallas
// del menú, y Configuración son once secciones con cuarenta tarjetas. Esto busca
// en los títulos de lib/configuracion/secciones.ts y en sus `palabras`, sin
// índice aparte: si una tarjeta cambia de nombre o de sección, el buscador la
// sigue sola, igual que sus enlaces.
//
// Pura: la ejecuta `node --test` directamente.

import {
  SECCIONES, cumpleCondicion,
  type SeccionConfiguracion, type SeccionId, type TarjetaConfiguracion, type TarjetaId,
} from './secciones.ts';

export interface ResultadoAjuste {
  /** Único en la lista: sirve de id del enlace. */
  id: string;
  titulo: string;
  /** La sección donde está. `null` si el resultado ES la sección. */
  donde: string | null;
  seccion: SeccionId;
  ancla?: TarjetaId;
}

/** Sin tildes, en minúsculas y con un solo espacio: «Cancelación» casa con «cancelacion». */
export function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

const trocear = (texto: string) => normalizar(texto).split(/[^a-z0-9]+/).filter(Boolean);

/**
 * Cada palabra buscada tiene que ser el PRINCIPIO de alguna palabra del texto.
 * Por dentro no vale: «iva» casaba con «privacidad» y con «Motivación», y la
 * búsqueda más típica devolvía tres cosas que no eran el IVA. Por el principio
 * sí, para que escribir «canc» ya encuentre «Cancelar».
 */
function casa(palabrasBuscadas: readonly string[], textos: readonly string[]): boolean {
  const palabras = textos.flatMap(trocear);
  return palabrasBuscadas.every(b => palabras.some(p => p.startsWith(b)));
}

/**
 * Secciones y tarjetas en cuyo título o `palabras` están TODAS las palabras
 * buscadas, en el orden de la lista. Las tarjetas que este estudio no tiene
 * (sedes, catálogo de la cadena) no salen: llevarían a nada.
 */
export function buscarAjustes(
  consulta: string,
  opciones: { secciones?: readonly SeccionConfiguracion[]; haySedes?: boolean; esCadena?: boolean } = {},
): ResultadoAjuste[] {
  const buscadas = trocear(consulta);
  if (buscadas.length === 0) return [];
  const { secciones = SECCIONES, haySedes = false, esCadena = false } = opciones;

  const resultados: ResultadoAjuste[] = [];
  // `SECCIONES` es `as const`: vista con su tipo ancho, `palabras` existe en todas.
  for (const s of secciones as readonly SeccionConfiguracion[]) {
    if (casa(buscadas, [s.titulo, ...(s.palabras ?? [])])) {
      resultados.push({ id: `seccion-${s.id}`, titulo: s.titulo, donde: null, seccion: s.id });
    }
    for (const t of s.tarjetas as readonly TarjetaConfiguracion[]) {
      if (!cumpleCondicion(t.condicion, { haySedes, esCadena })) continue;
      if (casa(buscadas, [t.titulo, ...(t.palabras ?? [])])) {
        resultados.push({ id: `tarjeta-${t.id}`, titulo: t.titulo, donde: s.titulo, seccion: s.id, ancla: t.id as TarjetaId });
      }
    }
  }
  return resultados;
}
