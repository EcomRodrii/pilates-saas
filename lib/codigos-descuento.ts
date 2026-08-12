// ─────────────────────────────────────────────────────────────────────────────
// Códigos de descuento: generación determinista y validación de canje. PURO
// (sin red ni imports de servidor) — lo usan el ejecutor del Decision OS
// (servidor) y el POS (navegador). Ver codigos-descuento.test.ts.
//
// Hasta ahora `codigos_descuento` era un catálogo de solo-gestión: se creaban en
// Marketing pero NADA los canjeaba (el POS tenía un descuento manual que no
// miraba la tabla). Aquí vive la lógica que cierra ese circuito.
// ─────────────────────────────────────────────────────────────────────────────

import type { CodigoDescuento } from './types.ts';

// Alfabeto sin caracteres ambiguos (sin O/0, I/1) — los códigos se dictan por
// teléfono y se teclean en el mostrador.
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// Hash determinista (FNV-1a 32 bits). Mismo id → mismo código, así que reintentar
// el envío no crea un código nuevo cada vez.
function hash32(texto: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Sufijo corto y legible derivado de una semilla estable (p.ej. el id de la recomendación). */
export function sufijoCodigo(semilla: string, longitud = 4): string {
  let h = hash32(semilla);
  let out = '';
  for (let i = 0; i < longitud; i++) {
    out += ALFABETO[h % ALFABETO.length];
    h = Math.floor(h / ALFABETO.length) + 7;
  }
  return out;
}

// Prefijo de los códigos que crea el Decision OS al enviar una reactivación. Es
// el identificador con el que el Centro de Control los distingue del resto del
// catálogo (más robusto que filtrar por el texto de la descripción).
export const PREFIJO_CODIGO_REACTIVACION = 'VUELVE-';

/** Código de reactivación (win-back). Determinista por `semilla` → idempotente. */
export function generarCodigoReactivacion(semilla: string): string {
  return `${PREFIJO_CODIGO_REACTIVACION}${sufijoCodigo(semilla)}`;
}

/** ¿Lo generó el Decision OS (win-back) o lo creó una persona a mano? */
export function esCodigoReactivacion(codigo: { codigo: string }): boolean {
  return codigo.codigo.trim().toUpperCase().startsWith(PREFIJO_CODIGO_REACTIVACION);
}

export type ResultadoCanje =
  | { ok: true; descuento: number }
  | { ok: false; motivo: string };

/** Descuento en euros que aplica un código a un subtotal (nunca supera el subtotal). */
export function calcularDescuento(codigo: CodigoDescuento, subtotal: number): number {
  const bruto = codigo.tipo === 'PORCENTAJE' ? (subtotal * codigo.valor) / 100 : codigo.valor;
  return Math.max(0, Math.min(subtotal, Math.round(bruto * 100) / 100));
}

/**
 * ¿Se puede canjear este código sobre este subtotal, hoy? Devuelve el descuento
 * o el motivo del rechazo (para enseñárselo a quien cobra).
 */
export function validarCodigoCanjeable(
  codigo: CodigoDescuento | null | undefined,
  opts: { hoyISO: string; subtotal: number },
): ResultadoCanje {
  if (!codigo) return { ok: false, motivo: 'Ese código no existe' };
  if (!codigo.activo) return { ok: false, motivo: 'Ese código está desactivado' };
  if (codigo.expira && codigo.expira < opts.hoyISO.slice(0, 10)) {
    return { ok: false, motivo: 'Ese código ya ha caducado' };
  }
  if (codigo.usosMax != null && codigo.usos >= codigo.usosMax) {
    return { ok: false, motivo: 'Ese código ya se ha usado' };
  }
  if (codigo.minImporte != null && opts.subtotal < codigo.minImporte) {
    return { ok: false, motivo: `Requiere un mínimo de ${codigo.minImporte}€` };
  }
  const descuento = calcularDescuento(codigo, opts.subtotal);
  if (descuento <= 0) return { ok: false, motivo: 'Ese código no aplica descuento aquí' };
  return { ok: true, descuento };
}

/** Busca un código por texto (sin distinguir mayúsculas ni espacios sobrantes). */
export function buscarCodigo(codigos: CodigoDescuento[], texto: string): CodigoDescuento | null {
  const t = texto.trim().toUpperCase();
  if (!t) return null;
  return codigos.find(c => c.codigo.trim().toUpperCase() === t) ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilización de los códigos con límite, para la cabecera de Marketing.
//
// ⚠️ Existe porque la pantalla enseñaba la MEDIA SIN PONDERAR de los
// porcentajes de cada código: un código de 1 uso con su único uso gastado
// (100 %) y otro de 1000 con 5 canjes (0,5 %) daban «Utilización media 50 %».
// No describía nada — ni la capacidad emitida ni la consumida. Es el mismo
// patrón que ya costó el «Compatibilidad 87 %» de sustituciones: una cifra con
// pinta de calculada que quien la lee se cree.
//
// Se pondera: usos totales sobre límite total. Eso sí responde a la pregunta
// que hace la etiqueta — cuánto se ha gastado de lo que se puso a disposición.
// ─────────────────────────────────────────────────────────────────────────────

export interface UsoCodigo {
  usos?: number | null;
  usosMax?: number | null;
}

export interface Utilizacion {
  /** `null` = no hay ningún código con límite. NUNCA 0. */
  pct: number | null;
  /** Los números que sostienen el porcentaje. Se pintan junto a él. */
  usos: number;
  limite: number;
  codigos: number;
}

/**
 * ⚠️ **Sin códigos con límite devuelve `null`, no 0.** Un 0 % se lee como «los
 * emitiste y no los usó nadie», que es una afirmación sobre el negocio; la
 * verdad es que no hay nada que medir. Misma regla que la probabilidad de
 * aceptación de una instructora sin historial (`lib/sustituciones/encaje.ts`).
 */
export function utilizacionCodigos(codigos: readonly UsoCodigo[]): Utilizacion {
  const conLimite = codigos.filter((c) => (c.usosMax ?? 0) > 0);
  const limite = conLimite.reduce((acc, c) => acc + (c.usosMax as number), 0);
  // Se acota cada código a su propio límite ANTES de sumar: un código con más
  // canjes que su tope (una carrera al validar, o un tope bajado después de
  // emitirlo) no puede inflar el total ajeno.
  const usos = conLimite.reduce(
    (acc, c) => acc + Math.min(c.usos ?? 0, c.usosMax as number), 0,
  );
  if (conLimite.length === 0 || limite === 0) {
    return { pct: null, usos: 0, limite: 0, codigos: 0 };
  }
  return {
    pct: Math.round((usos / limite) * 100),
    usos, limite, codigos: conLimite.length,
  };
}
