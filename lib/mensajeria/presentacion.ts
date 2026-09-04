// Community & Messaging OS — la lógica PURA de presentación de un hilo.
//
// Existe porque las tres pantallas de mensajería (pestaña del panel, lista del
// portal, hilo del portal) necesitaban exactamente las mismas decisiones
// —agrupar por día, agrupar mensajes seguidos de la misma persona, decidir si
// hay algo sin leer, formatear un sello temporal— y cada una las improvisaba a
// su manera: había DOS `timeAgo`/`etiquetaDia` distintos, uno por fichero, ya
// divergiendo en los umbrales. Aquí no hay React ni fetch a propósito: son
// datos que entran y datos que salen, comprobables sin levantar nada.
//
// Imports relativos con extensión `.ts` explícita — `lib/**` corre bajo
// `node --test --experimental-strip-types` y sin ella pasa en local y rompe en
// CI (convención del repo).

import type { RowConversaciones } from '../db-types.ts';

// ── Lo que la lista necesita y la tabla `conversaciones` no trae ─────────────
//
// ⚠️ CAMBIO DE API, deliberado y mínimo (ver cabecera de los dos GET de
// conversaciones). Una bandeja sin previsualización del último mensaje y sin
// marca de no leído no es una bandeja: es un índice. Esos tres datos ya viven
// en la base (`mensajes.cuerpo`, `conversacion_participantes.leido_hasta`), no
// hay columna ni tabla nueva — solo dejan de quedarse en el servidor.
export interface ResumenConversacion {
  /** Hasta dónde ha leído QUIEN pregunta. `null` = sin fila de participante. */
  leido_hasta: string | null;
  /** Hasta dónde ha leído la OTRA parte — el doble check de "lo ha leído". */
  leido_hasta_otros: string | null;
  ultimo_cuerpo: string | null;
  ultimo_remitente_auth_user_id: string | null;
}

export type ConversacionConResumen = RowConversaciones & ResumenConversacion;

// ── Nombre y color de una persona ───────────────────────────────────────────

export function iniciales(nombre: string, apellidos?: string): string {
  const limpio = `${nombre ?? ''} ${apellidos ?? ''}`.trim();
  if (!limpio) return '?';
  const partes = limpio.split(/\s+/).slice(0, 2);
  return partes.map(p => p[0]).join('').toUpperCase();
}

/**
 * Color estable por persona, tomado de la paleta CATEGÓRICA del panel
 * (`--cat-1..9`, app/globals.css). No es color de marca: aquí el color
 * DISTINGUE a una socia de otra en una lista, que es exactamente para lo que
 * esa paleta existe (y por lo que tiene su propio test de contraste y de
 * separación entre tonos). La marca sigue siendo `--brand`, y no se toca.
 *
 * Determinista: la misma clave da siempre el mismo tono, en cualquier sesión y
 * dispositivo — un avatar que cambia de color al recargar es peor que uno gris.
 */
export function colorPersona(clave: string): string {
  let h = 0;
  for (let i = 0; i < clave.length; i++) h = (h * 31 + clave.charCodeAt(i)) | 0;
  return `var(--cat-${(Math.abs(h) % 9) + 1})`;
}

// ── Tiempo ──────────────────────────────────────────────────────────────────

const MESES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIAS_CORTO = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

export function mismoDia(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function horaCorta(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

/**
 * El sello de una fila de la bandeja, con el criterio de cualquier app de
 * mensajería: hoy la hora, ayer "Ayer", esta semana el día, antes la fecha.
 * Sustituye a los dos `timeAgo`/`selloTemporal` que decían "hace 3d" — un
 * "hace 3d" obliga a hacer la cuenta mentalmente para saber si fue el lunes.
 */
export function selloLista(iso: string, ahora: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  if (mismoDia(d, ahora)) {
    const minutos = Math.floor((ahora.getTime() - d.getTime()) / 60000);
    return minutos < 1 ? 'ahora' : horaCorta(iso);
  }
  const ayer = new Date(ahora);
  ayer.setDate(ayer.getDate() - 1);
  if (mismoDia(d, ayer)) return 'Ayer';
  const dias = Math.floor((ahora.getTime() - d.getTime()) / 86_400_000);
  if (dias < 7) return DIAS_CORTO[d.getDay()];
  const anio = d.getFullYear() !== ahora.getFullYear() ? `/${String(d.getFullYear()).slice(2)}` : '';
  return `${d.getDate()} ${MESES_CORTO[d.getMonth()]}${anio}`;
}

/** El separador que va ENTRE bloques de días distintos dentro del hilo. */
export function etiquetaDia(iso: string, ahora: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  if (mismoDia(d, ahora)) return 'Hoy';
  const ayer = new Date(ahora);
  ayer.setDate(ayer.getDate() - 1);
  if (mismoDia(d, ayer)) return 'Ayer';
  const anio = d.getFullYear() !== ahora.getFullYear() ? ` de ${d.getFullYear()}` : '';
  return `${d.getDate()} de ${MESES_CORTO[d.getMonth()]}${anio}`;
}

// ── Agrupación del hilo ─────────────────────────────────────────────────────

/** Dos mensajes seguidos de la misma persona separados por más de esto abren
 *  bloque nuevo: si no, un "buenos días" de hoy se pega a un mensaje de hace
 *  seis horas como si fueran la misma parrafada. */
const MINUTOS_MISMO_BLOQUE = 15;

export interface MensajeAgrupable {
  id: string;
  creado_en: string;
  remitente_auth_user_id: string;
}

export interface BloqueMensajes<T extends MensajeAgrupable> {
  remitenteAuthUserId: string;
  items: T[];
}

export interface DiaMensajes<T extends MensajeAgrupable> {
  etiqueta: string;
  bloques: BloqueMensajes<T>[];
}

/**
 * Día → bloques por remitente. Es la estructura que permite pintar el avatar y
 * la hora UNA vez por bloque en vez de repetirlos en cada burbuja, que es lo
 * que hacía que el hilo pareciera un log y no una conversación.
 */
export function agruparHilo<T extends MensajeAgrupable>(
  mensajes: T[], ahora: Date = new Date(),
): DiaMensajes<T>[] {
  const dias: DiaMensajes<T>[] = [];
  for (const m of mensajes) {
    const etiqueta = etiquetaDia(m.creado_en, ahora);
    let dia = dias[dias.length - 1];
    if (!dia || dia.etiqueta !== etiqueta) {
      dia = { etiqueta, bloques: [] };
      dias.push(dia);
    }
    const bloque = dia.bloques[dia.bloques.length - 1];
    const anterior = bloque?.items[bloque.items.length - 1];
    const seguido = Boolean(
      bloque
      && bloque.remitenteAuthUserId === m.remitente_auth_user_id
      && anterior
      && (new Date(m.creado_en).getTime() - new Date(anterior.creado_en).getTime()) < MINUTOS_MISMO_BLOQUE * 60_000,
    );
    if (seguido && bloque) bloque.items.push(m);
    else dia.bloques.push({ remitenteAuthUserId: m.remitente_auth_user_id, items: [m] });
  }
  return dias;
}

// ── Estado de lectura ───────────────────────────────────────────────────────

/**
 * Hay algo sin leer si el último mensaje llegó después de mi `leido_hasta` Y no
 * lo escribí yo. Lo segundo importa: sin ello, tu propio mensaje te marca la
 * conversación como no leída en cuanto lo envías desde otro dispositivo.
 *
 * F-15 (auditoría 20ª pasada): `ALUMNA_MOSTRADOR` no tiene fila STAFF
 * individual (decisión de diseño ya cerrada — el mostrador se resuelve
 * dinámicamente, no por una foto fija de quién atendía al abrirlo), así que
 * `leido_hasta` (personal) es SIEMPRE `null` ahí. Antes eso devolvía `false`
 * sin más: el badge del mostrador no se encendía JAMÁS, para nadie, aunque
 * fuera el canal principal socia→estudio. Se usa `mostrador_leido_hasta`
 * (compartido, en la propia conversación) solo para ese tipo; el resto sigue
 * con la marca personal de siempre.
 */
export function tieneSinLeer(c: ConversacionConResumen, miAuthUserId: string | null): boolean {
  if (c.ultimo_remitente_auth_user_id && c.ultimo_remitente_auth_user_id === miAuthUserId) return false;
  const leidoHasta = c.tipo === 'ALUMNA_MOSTRADOR' ? c.mostrador_leido_hasta : c.leido_hasta;
  if (!leidoHasta) return c.tipo === 'ALUMNA_MOSTRADOR' ? true : false;
  return new Date(leidoHasta).getTime() < new Date(c.ultimo_mensaje_en).getTime();
}

/** ✓ enviado / ✓✓ leído para el ÚLTIMO mensaje propio del hilo. */
export function estadoEntrega(
  creadoEn: string, leidoHastaOtros: string | null | undefined,
): 'enviado' | 'leido' {
  if (!leidoHastaOtros) return 'enviado';
  return new Date(leidoHastaOtros).getTime() >= new Date(creadoEn).getTime() ? 'leido' : 'enviado';
}

// ── Texto ───────────────────────────────────────────────────────────────────

/** Previsualización de una línea: sin saltos de línea, sin cola de espacios. */
export function unaLinea(texto: string | null | undefined, max = 120): string {
  if (!texto) return '';
  const plano = texto.replace(/\s+/g, ' ').trim();
  return plano.length > max ? `${plano.slice(0, max - 1)}…` : plano;
}
