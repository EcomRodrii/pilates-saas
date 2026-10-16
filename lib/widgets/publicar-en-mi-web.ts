// «Publicar en mi web», la única barra para que su web cambie sin pegar nada
// («Tu web» v2, decisión 1 del fundador, 15-oct-2026). Sustituye a la barra de
// aplicar el estilo, a la región «Cambios sin aplicar», a la línea de guardado y
// al aviso de cabecera del constructor de siempre.
//
// Puro (sin React) para `node --test`. La orquestación —qué se manda, en qué
// orden, el cerrojo del doble clic— vive en components/widgets/v2/
// usar-publicar-en-mi-web.ts, y las peticiones son las de siempre
// (/api/estudio/widget-estilo y /api/estudio/widget-pieza, sin cambios).
//
// ⚠️ Lo que va en el propio HTML del código (el ancho, cómo carga, el botón:
// `GRUPOS_EN_EL_HTML`) NUNCA es «sin publicar»: publicar no lo cambia, hay que
// pegarlo. Lo dice la fila de la portada con «Copiar el código nuevo». Y lo
// pegado con un código de antes (sin `pieza`) tampoco: lo de ahí exige pegarlo.

import { GRUPOS, GRUPOS_EN_EL_HTML, gruposSinAplicar, unirGrupos } from './en-tu-web.ts';
import type { ConfigConstructor, Copiado } from './config.ts';

export interface PiezaPendiente {
  id: string;
  nombre: string;
  /** Qué cambió, por grupos (`gruposSinAplicar`): nunca uno que vaya en el HTML. */
  grupos: string[];
}

export interface Pendientes {
  /** El borrador del estilo cambia algo de lo que hay en su web. */
  estilo: boolean;
  /** Lo que impide publicar ahora (contraste, o se está volviendo a leer el estilo). `null` = se puede. */
  bloqueo: string | null;
  piezas: PiezaPendiente[];
}

/** Lo que la barra necesita saber del estilo de sus widgets (`EstiloWebPanel`). */
export interface EstadoEstilo {
  pendiente: boolean;
  errores: readonly { mensaje: string }[];
  relectura: 'releyendo' | 'fallo' | null;
}

/**
 * Qué está sin publicar en su web. Una pieza lo está si lo pegado escucha su
 * id (`copiado.pieza`), hay algo publicado y lo de ahora (sin huérfanos) cambia
 * algo que llega al publicar: la misma condición que encendía «Cambios sin
 * aplicar», pero para TODO lo copiado por id, no solo lo abierto.
 */
export function pendientesDePublicar(x: {
  estilo: EstadoEstilo;
  copiados: Readonly<Record<string, Copiado>>;
  /** Lo publicado de cada widget (su config). */
  publicadas: Readonly<Record<string, { config: ConfigConstructor }>>;
  /** La config de ahora de cada pieza copiada, sin huérfanos. */
  configs: Readonly<Record<string, ConfigConstructor>>;
  nombre: (id: string) => string;
}): Pendientes {
  const piezas: PiezaPendiente[] = [];
  for (const [id, copia] of Object.entries(x.copiados)) {
    const publicada = x.publicadas[id];
    const ahora = x.configs[id];
    if (!copia.pieza || !publicada || !ahora) continue;
    const grupos = gruposSinAplicar(publicada.config, ahora);
    if (grupos.length) piezas.push({ id, nombre: x.nombre(id), grupos });
  }
  const bloqueo = x.estilo.relectura === 'releyendo'
    ? 'Leyendo lo que hay ahora en tu web…'
    : x.estilo.relectura === 'fallo'
      ? 'No hemos podido leer el estilo que hay ahora en tu web. Vuelve a leerlo antes de publicar.'
      : x.estilo.pendiente && x.estilo.errores.length > 0
        ? x.estilo.errores[0].mensaje
        : null;
  return { estilo: x.estilo.pendiente, bloqueo, piezas };
}

/** Hay algo que publicar. */
export const hayPendientes = (p: Pendientes) => p.estilo || p.piezas.length > 0;

/**
 * La frase de la barra: «Sin publicar en tu web: el estilo y qué clases salen
 * de «Tu horario»». `null` sin nada pendiente.
 */
export function textoPendiente(p: Pendientes): string | null {
  const partes = [
    ...(p.estilo ? ['el estilo'] : []),
    ...p.piezas.map(x => `${unirGrupos(x.grupos)} de «${x.nombre}»`),
  ];
  return partes.length ? `Sin publicar en tu web: ${unirGrupos(partes)}` : null;
}

export type QuePublica = { tipo: 'estilo' } | { tipo: 'pieza'; id: string; nombre: string };

export type ResultadoPublicacion =
  | { que: QuePublica; ok: true }
  | { que: QuePublica; ok: false; error: string; motivo?: string };

export interface Resumen {
  tono: 'ok' | 'parcial' | 'error';
  texto: string;
}

const nombreDe = (q: QuePublica) => (q.tipo === 'estilo' ? 'el estilo' : `«${q.nombre}»`);

/**
 * Por qué no se publicó una cosa. Un 409 (otra pestaña publicó entretanto) se
 * dice como lo que es: lo de su web se vuelve a leer y el siguiente intento va
 * contra eso (no se reintenta solo).
 */
function motivoDe(r: Extract<ResultadoPublicacion, { ok: false }>): string {
  if (r.motivo !== 'cambiado') return r.error;
  return r.que.tipo === 'estilo'
    ? 'el estilo de tus widgets acaba de cambiar desde otra pestaña. Hemos vuelto a leer lo que hay en tu web: revísalo y vuelve a publicar.'
    : `${nombreDe(r.que)} acaba de cambiar desde otra pestaña. Hemos vuelto a leer lo que hay en tu web: revísalo y vuelve a publicar.`;
}

const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const conPunto = (t: string) => (/[.…!?]$/.test(t) ? t : `${t}.`);

/**
 * UNA frase con lo que salió. «Publicado» solo con TODO bien (y con la caché
 * de su web, «en unos minutos» es verdad); a medias, qué sí y qué no; todo mal,
 * el motivo del servidor. Sin resultados (no se mandó nada), `null`.
 */
export function resumenPublicacion(resultados: readonly ResultadoPublicacion[]): Resumen | null {
  if (!resultados.length) return null;
  const bien = resultados.filter(r => r.ok);
  const mal = resultados.filter((r): r is Extract<ResultadoPublicacion, { ok: false }> => !r.ok);
  if (!mal.length) return { tono: 'ok', texto: 'Publicado. Tu web lo enseñará en unos minutos.' };
  const motivo = conPunto(mayuscula(motivoDe(mal[0])));
  if (!bien.length) return { tono: 'error', texto: motivo };
  const fallan = unirGrupos(mal.map(r => nombreDe(r.que)));
  return {
    tono: 'parcial',
    texto: `Publicado ${unirGrupos(bien.map(r => nombreDe(r.que)))}. ${mayuscula(fallan)} no se ${mal.length > 1 ? 'han' : 'ha'} podido publicar: ${conPunto(motivoDe(mal[0]))}`,
  };
}

/**
 * «Descartar» de una pieza: lo de ahora vuelve a lo publicado SOLO en lo que
 * llega al publicar. Lo que va en el HTML (ancho, carga, botón) no se toca: eso
 * ya no es «sin publicar», es lo que dirá la fila al copiar el código nuevo.
 */
export function descartarContenido(ahora: ConfigConstructor, publicada: ConfigConstructor): ConfigConstructor {
  const siguiente: Record<string, unknown> = { ...ahora };
  for (const g of GRUPOS) {
    if (GRUPOS_EN_EL_HTML.has(g.nombre)) continue;
    for (const k of g.campos) siguiente[k] = publicada[k];
  }
  return siguiente as unknown as ConfigConstructor;
}
