// «Contenido de tu app» v2 (decisiones 10–13 de «Mi app y mi web», 15-oct-2026):
// lo que el editor dice de cada tarjeta, sin React, para probarlo con `node --test`.
//
// La regla de si una tarjeta sale NO vive aquí: es `tarjetasEnLaApp`
// (lib/student/descubre.ts), la misma que aplica la app. `estadoTarjeta` solo pone
// en palabras POR QUÉ sale o no, y un test ata las dos.
//
// Puro, sin `@/`.

import { resolverHrefBloque } from '../theme/enlaces.ts';
import { esUrlImagenValida } from '../imagen-url.ts';
import { tarjetasEnLaApp, type BannerDelEstudio } from '../student/descubre.ts';

/** Lo que el editor necesita de un banner (`BannerPortal`, lib/types.ts). */
export interface TarjetaEditable extends BannerDelEstudio {
  linkTipo: 'interno' | 'externo' | 'ninguno';
  linkValor: string;
  orden: number;
}

/**
 * Las pantallas de su app a las que puede llevar una tarjeta, por su NOMBRE
 * (decisión 13: antes se tecleaba la ruta, «/bonos»). Solo las que existen para
 * todas las alumnas de todos los estudios: «Regalo» no (es canjear una tarjeta
 * regalo, que la mayoría no vende), y Logros sí, con su nombre, porque la dueña
 * sabe si usa los retos. El nombre es el que lleva cada pantalla en su app.
 */
export const PANTALLAS_APP = [
  { ruta: '/reservar', nombre: 'Reservar clase (el horario)' },
  { ruta: '/comprar', nombre: 'Comprar bonos y cuotas (la tienda)' },
  { ruta: '/bonos', nombre: 'Mi plan (su bono o su cuota)' },
  { ruta: '/mis-reservas', nombre: 'Mis clases (sus reservas)' },
  { ruta: '/instructoras', nombre: 'Instructoras' },
  { ruta: '/comunidad', nombre: 'Comunidad' },
  { ruta: '/mensajes', nombre: 'Mensajes (escribir al estudio)' },
  { ruta: '/logros', nombre: 'Logros y recompensas' },
] as const;

/** La pantalla de una tarjeta nueva que pasa a «Una pantalla de su app». */
export const PANTALLA_POR_DEFECTO = '/reservar';

/** El nombre corto de una pantalla (sin la aclaración entre paréntesis), o `null` si no es de la lista. */
export function nombrePantalla(ruta: string): string | null {
  const p = PANTALLAS_APP.find(x => x.ruta === ruta.trim());
  return p ? p.nombre.replace(/\s*\(.*\)$/, '') : null;
}

export type ModoEnlace = 'nada' | 'app' | 'web';

/** Qué opción de «Al tocarla, lleva a» está elegida. */
export function modoEnlace(t: Pick<TarjetaEditable, 'linkTipo' | 'linkValor'>): ModoEnlace {
  if (t.linkTipo === 'ninguno' || !t.linkValor.trim()) return 'nada';
  return t.linkTipo === 'externo' ? 'web' : 'app';
}

/**
 * Una web que se puede guardar: la base exige `http(s)://` (CHECK
 * `contenido_portal_banners_link_valor_forma`) y la app la vuelve a sanear al
 * pintar (`resolverHrefBloque`). Aquí, además, con un punto en el nombre: «https://hola»
 * pasaría las dos y no lleva a ninguna parte.
 */
export function webValida(url: string): boolean {
  const v = url.trim();
  const r = resolverHrefBloque(v);
  if (!r || r.interno) return false;
  try {
    return new URL(v).hostname.includes('.');
  } catch {
    return false;
  }
}

/** «Lleva a: …» de la lista. */
export function llevaA(t: Pick<TarjetaEditable, 'linkTipo' | 'linkValor'>): string {
  const modo = modoEnlace(t);
  if (modo === 'nada') return 'No lleva a ningún sitio';
  if (modo === 'app') return `Lleva a: ${nombrePantalla(t.linkValor) ?? t.linkValor.trim()}`;
  // La app descarta la web que no pueda abrir: decirlo, no prometer el enlace.
  if (!resolverHrefBloque(t.linkValor)) return 'La web no es válida: no lleva a ningún sitio';
  return `Lleva a: ${t.linkValor.trim().replace(/^https?:\/\//, '').replace(/\/$/, '')}`;
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];

/** «25 oct», y con el año solo si no es el de hoy. */
export function fechaCorta(iso: string, hoy: string): string {
  const [y, m, d] = iso.split('-');
  return `${Number(d)} ${MESES[Number(m) - 1]}${y !== hoy.slice(0, 4) ? ` ${y}` : ''}`;
}

export type TonoEstado = 'sale' | 'futura' | 'apagada' | 'aviso';

export interface EstadoTarjeta {
  /** ¿La ve hoy una alumna? Es `tarjetasEnLaApp`, no otra cuenta. */
  sale: boolean;
  tono: TonoEstado;
  /** La etiqueta de la lista. */
  texto: string;
  /** La frase de la ficha, junto a «Guardado». */
  frase: string;
}

/**
 * Por qué una tarjeta sale hoy o no, en el orden en que lo arreglaría la dueña:
 * primero la foto (sin ella no hay tarjeta), luego si está publicada, y luego las
 * fechas.
 */
export function estadoTarjeta(t: TarjetaEditable, hoy: string): EstadoTarjeta {
  const sale = tarjetasEnLaApp([t], hoy).length > 0;
  if (!esUrlImagenValida(t.imagenUrl)) {
    return { sale, tono: 'aviso', texto: 'Sin foto: no sale', frase: 'sin foto no sale en su app' };
  }
  if (!t.activo) return { sale, tono: 'apagada', texto: 'Oculta', frase: 'oculta: solo la ves tú' };
  if (!(t.ubicacion ?? ['home']).includes('home')) {
    return { sale, tono: 'apagada', texto: 'No sale en el inicio', frase: 'no sale en el inicio de su app' };
  }
  if (t.fechaInicio && t.fechaInicio > hoy) {
    const f = fechaCorta(t.fechaInicio, hoy);
    return { sale, tono: 'futura', texto: `Sale desde el ${f}`, frase: `sale desde el ${f}` };
  }
  if (t.fechaFin && t.fechaFin < hoy) {
    const f = fechaCorta(t.fechaFin, hoy);
    return { sale, tono: 'apagada', texto: `Terminó el ${f}`, frase: `terminó el ${f}: ya no sale` };
  }
  const hasta = t.fechaFin ? ` · hasta el ${fechaCorta(t.fechaFin, hoy)}` : '';
  return { sale, tono: 'sale', texto: `Se ve en la app${hasta}`, frase: `se ve en la app${hasta}` };
}

/** En el orden de la app: `orden` y, a igualdad, el id (como `tarjetasDescubre`). */
export function enOrden<T extends { id: string; orden: number }>(tarjetas: readonly T[]): T[] {
  return [...tarjetas].sort((a, b) => a.orden - b.orden || a.id.localeCompare(b.id));
}

/**
 * Subir (-1) o bajar (+1) una tarjeta: qué `orden` hay que escribir. Se renumera
 * la lista entera (0, 1, 2…) y solo salen las que cambian: los datos de antes
 * pueden traer órdenes repetidos, y con uno repetido «intercambiar los dos
 * números» no movería nada.
 */
export function moverTarjeta<T extends { id: string; orden: number }>(tarjetas: readonly T[], id: string, delta: -1 | 1): { id: string; orden: number }[] {
  const lista = enOrden(tarjetas);
  const i = lista.findIndex(t => t.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= lista.length) return [];
  [lista[i], lista[j]] = [lista[j], lista[i]];
  return lista.flatMap((t, k) => (t.orden === k ? [] : [{ id: t.id, orden: k }]));
}

/** El tope de la columna (CHECK `contenido_portal_mensaje_destacado_longitud`). */
export const MAX_MENSAJE = 280;

/**
 * Un aviso de los de antes, como mensaje destacado (decisión 12). Va al editor,
 * no se guarda solo: la dueña lo lee y lo guarda ella. Si no cabe, se corta con
 * «…» y se ve antes de guardar.
 */
export function avisoComoMensaje(aviso: { titulo: string; texto: string | null }): string {
  const titulo = aviso.titulo.trim();
  const texto = (aviso.texto ?? '').trim();
  const junto = texto ? `${titulo}${/[.!?:…]$/.test(titulo) ? '' : '.'} ${texto}` : titulo;
  return junto.length <= MAX_MENSAJE ? junto : `${junto.slice(0, MAX_MENSAJE - 1).trimEnd()}…`;
}
