// El buscador de ajustes: el del inicio de Configuración y el grupo «Ajustes»
// de ⌘K.
//
// «¿Dónde se cambia el IVA?» no tenía respuesta: ⌘K solo buscaba las pantallas
// del menú, y Configuración son catorce secciones con cuarenta tarjetas. Esto
// busca en los títulos de lib/configuracion/secciones.ts y en sus `palabras`,
// sin índice aparte: si una tarjeta cambia de nombre o de sección, los dos
// buscadores la siguen solos, igual que sus enlaces.
//
// Pura: la ejecuta `node --test` directamente.

import {
  FILAS_EXTERNAS, GRUPOS, SECCIONES, cumpleCondicion,
  type FilaExterna, type HerramientaId, type RolConfiguracion, type SeccionConfiguracion, type SeccionId, type TarjetaConfiguracion, type TarjetaId,
} from './secciones.ts';
import { hrefDeLugar, lugarDeTarjeta, resolverHref, seccionesVisibles } from './destino.ts';

export interface ResultadoAjuste {
  /** Único en la lista: sirve de id del enlace. */
  id: string;
  titulo: string;
  /** La sección donde está. `null` si el resultado ES la sección. */
  donde: string | null;
  /** `null` = no es una sección: una fila que lleva a otra pantalla (`href`). */
  seccion: SeccionId | null;
  /** La herramienta en cuya pantalla está la tarjeta (el constructor de widgets…). */
  abrir?: HerramientaId;
  ancla?: TarjetaId;
  href?: string;
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
 * Secciones, tarjetas y filas de otra pantalla («Plan de Tentare») en cuyo
 * título o `palabras` están TODAS las palabras buscadas, en el orden del
 * inicio. Las tarjetas que este estudio no tiene (sedes, catálogo de la cadena)
 * no salen: llevarían a nada. Cuáles tiene lo dice quien llama, con lo que ya
 * sabe (el plan): el buscador no espera a que ninguna sección cargue sus datos.
 */
export function buscarAjustes(
  consulta: string,
  opciones: {
    secciones?: readonly SeccionConfiguracion[];
    externas?: readonly FilaExterna[];
    haySedes?: boolean;
    esCadena?: boolean;
  } = {},
): ResultadoAjuste[] {
  const buscadas = trocear(consulta);
  if (buscadas.length === 0) return [];
  const { secciones = SECCIONES, externas = Object.values(FILAS_EXTERNAS), haySedes = false, esCadena = false } = opciones;

  const resultados: ResultadoAjuste[] = [];
  // `SECCIONES` es `as const`: vista con su tipo ancho, `palabras` existe en todas.
  for (const s of secciones as readonly SeccionConfiguracion[]) {
    if (casa(buscadas, [s.titulo, ...(s.palabras ?? [])])) {
      resultados.push({ id: `seccion-${s.id}`, titulo: s.titulo, donde: null, seccion: s.id });
    }
    for (const t of s.tarjetas as readonly TarjetaConfiguracion[]) {
      if (!cumpleCondicion(t.condicion, { haySedes, esCadena })) continue;
      if (casa(buscadas, [t.titulo, ...(t.palabras ?? [])])) {
        // Una tarjeta de una herramienta abre su pantalla: en la sección solo está su fila.
        const { abrir, ancla } = lugarDeTarjeta(t.id as TarjetaId);
        resultados.push({
          id: `tarjeta-${t.id}`, titulo: t.titulo, donde: s.titulo, seccion: s.id,
          ...(abrir ? { abrir } : {}),
          ...(ancla ? { ancla: ancla as TarjetaId } : {}),
        });
      }
    }
  }
  for (const f of externas) {
    if (casa(buscadas, [f.titulo, ...(f.palabras ?? [])])) {
      const grupo = GRUPOS.find(g => g.externas?.includes(f.id));
      resultados.push({ id: `externa-${f.id}`, titulo: f.titulo, donde: grupo?.titulo ?? null, seccion: null, href: f.href });
    }
  }
  return resultados;
}

/** Un ajuste en ⌘K: «Datos fiscales e IVA · Cobros y facturas», con su enlace. */
export interface AjusteEnBuscadorGlobal {
  id: string;
  titulo: string;
  /** La sección donde está; «Configuración» si el resultado es la sección. */
  donde: string;
  /** La sección y, si es una tarjeta, su ancla: `/configuracion?tab=cobros#datos-fiscales`. */
  href: string;
}

export const MAX_AJUSTES_EN_BUSCADOR_GLOBAL = 5;

/**
 * Lo que enseña el grupo «Ajustes» de ⌘K: la misma búsqueda que el inicio,
 * acotada a las secciones que este rol abre (las mismas que la columna de
 * Configuración) y a cinco. Un rol que no entra en Configuración no ve ninguna:
 * un resultado que lleva a una pantalla cerrada es un enlace que miente.
 *
 * Sin las filas de otra pantalla («Plan de Tentare», «Mi cuenta»): no son un
 * ajuste con su tarjeta, y ⌘K ya las encuentra por su entrada del menú.
 */
export function ajustesParaBuscadorGlobal(
  consulta: string,
  opciones: { rol: RolConfiguracion | string; haySedes?: boolean; esCadena?: boolean },
): AjusteEnBuscadorGlobal[] {
  const secciones = seccionesVisibles(opciones.rol);
  if (secciones.length === 0) return [];
  return buscarAjustes(consulta, { secciones, externas: [], haySedes: opciones.haySedes, esCadena: opciones.esCadena })
    .flatMap(r => r.seccion
      ? [{ id: r.id, titulo: r.titulo, donde: r.donde ?? 'Configuración', href: hrefDeLugar({ tab: r.seccion, abrir: r.abrir, ancla: r.ancla }) }]
      : [])
    .slice(0, MAX_AJUSTES_EN_BUSCADOR_GLOBAL);
}

/**
 * Dónde acaba de verdad un enlace: ruta, sección (`tab`) y ancla. Los de
 * Configuración pasan por `resolverHref`, así que un `?tab=` viejo cuenta como
 * la sección que abre hoy.
 */
function destinoDe(href: string): string {
  const url = new URL(href, 'https://tentare.invalid');
  if (url.pathname === '/configuracion') {
    const d = resolverHref(href);
    if ('redirect' in d) return d.redirect;
    return `/configuracion|${d.tab ?? ''}|${d.ancla ?? ''}`;
  }
  return `${url.pathname}|${url.searchParams.get('tab') ?? ''}|${url.hash.replace(/^#/, '')}`;
}

/**
 * Las tareas de ⌘K sin las que llevan al mismo sitio que un ajuste ya en la
 * lista: «IVA» enseñaba «Datos fiscales e IVA» y «Poner los datos fiscales y el
 * IVA», dos filas a la misma tarjeta. Se queda el ajuste, que dice dónde está.
 */
export function sinTareasRepetidas<T extends { href: string }>(
  tareas: readonly T[],
  ajustes: readonly { href: string }[],
): T[] {
  if (ajustes.length === 0) return [...tareas];
  const destinos = new Set(ajustes.map(a => destinoDe(a.href)));
  return tareas.filter(t => !destinos.has(destinoDe(t.href)));
}
