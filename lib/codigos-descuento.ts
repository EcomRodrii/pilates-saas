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

/** Código de reactivación (win-back). Determinista por `semilla` → idempotente. */
export function generarCodigoReactivacion(semilla: string): string {
  return `VUELVE-${sufijoCodigo(semilla)}`;
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
