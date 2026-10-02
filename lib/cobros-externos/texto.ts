// ─────────────────────────────────────────────────────────────────────────────
// Texto de un movimiento: limpiarlo antes de guardarlo y compararlo con nombres.
// Puro.
// ─────────────────────────────────────────────────────────────────────────────

import { MAX_CONCEPTO } from './tipos.ts';

/**
 * Recorta a sus 4 últimos dígitos cualquier número que pueda ser una tarjeta
 * completa (13 a 19 dígitos, con o sin espacios o guiones entre grupos). Va
 * ANTES de guardar nada: un concepto puede traer el número entero y no debe
 * quedarse en ningún sitio.
 */
export function sinNumerosDeTarjeta(texto: string): string {
  return texto.replace(/\b(?:\d[ -]?){12,18}\d\b/g, (m) => {
    const digitos = m.replace(/\D/g, '');
    return digitos.length >= 13 && digitos.length <= 19 ? `···${digitos.slice(-4)}` : m;
  });
}

/**
 * Enmascara cualquier IBAN (el del pagador en el concepto de una transferencia, el de
 * la cuenta en el nombre del fichero): dos letras, dos dígitos de control y 11 a 30
 * caracteres, con o sin espacios. Quedan el país y los 4 últimos. Para no tocar
 * palabras normales, el cuerpo tiene que ser sobre todo cifras (10 o más).
 */
export function sinIban(texto: string): string {
  // Seguido (ES91…) o en grupos de 4 separados por un espacio. Sin `\b`: en un nombre
  // de fichero va pegado a un guion bajo, que para `\b` es parte de la palabra.
  return texto.replace(/(?<![A-Za-z0-9])[A-Z]{2}\d{2}(?:[A-Z0-9]{11,30}|(?: [A-Z0-9]{1,4}){3,8})(?![A-Za-z0-9])/gi, (m) => {
    // En grupos, la palabra que viene detrás («… 1332 CUOTA») no es del IBAN.
    const trozos = m.split(' ');
    let resto = '';
    while (trozos.length > 1 && !/\d/.test(trozos[trozos.length - 1])) resto = ` ${trozos.pop()}${resto}`;
    const c = trozos.join('');
    return (c.slice(4).match(/\d/g)?.length ?? 0) >= 10 ? `${c.slice(0, 2).toUpperCase()}··${c.slice(-4)}${resto}` : m;
  });
}

/**
 * Lo que se guarda de cualquier texto libre del fichero (concepto, referencia, id de
 * la operación): sin tarjetas ni IBAN, sin espacios de más y truncado. Va ANTES de
 * guardar nada y antes de emparejar: lo que no se guarda tampoco se usa.
 */
export function datoGuardable(texto: string | null | undefined, max: number): string | null {
  const limpio = sinIban(sinNumerosDeTarjeta(texto ?? '')).replace(/\s+/g, ' ').trim();
  return limpio ? limpio.slice(0, max) : null;
}

/** Lo que se guarda de un concepto. */
export function conceptoGuardable(texto: string | null | undefined): string | null {
  return datoGuardable(texto, MAX_CONCEPTO);
}

/**
 * La referencia del movimiento. Si es el id de un recibo de Tentare (`rec-…`, lo que
 * pone en el concepto quien paga desde el enlace de pago) se guarda tal cual: es
 * nuestro, no de nadie, y algunos llevan 13 cifras seguidas que parecerían una tarjeta.
 */
export function referenciaGuardable(texto: string | null | undefined): string | null {
  const t = (texto ?? '').trim();
  if (/^rec-[A-Za-z0-9_-]{1,76}$/.test(t)) return t;
  return datoGuardable(t, 80);
}

/** El nombre de quien paga: solo letras. Un número ahí es una cuenta o un documento. */
export function pagadorGuardable(texto: string | null | undefined): string | null {
  const t = normalizar(texto ?? '').replace(/[0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, 80) : null;
}

/** El nombre del fichero subido: sin IBAN ni tiradas de 8 cifras o más (el número de cuenta). */
export function nombreFicheroGuardable(nombre: string | null | undefined): string | null {
  const t = sinIban(nombre ?? '').replace(/\d{8,}/g, '···').replace(/[^\p{L}\p{N} ._()·-]/gu, '').trim();
  return t ? t.slice(0, 120) : null;
}

/** Minúsculas, sin acentos ni signos: para comparar nombres. */
export function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9ñ ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Las palabras de un texto normalizado (2 letras o más). */
export function palabras(texto: string): string[] {
  return normalizar(texto).split(' ').filter(p => p.length >= 2);
}

export type CoincidenciaNombre = 'COMPLETA' | 'APELLIDO' | 'NINGUNA';

/**
 * ¿Aparece la alumna en este texto (pagador o concepto)? Sin importar el orden
 * ni los acentos, porque cada banco lo escribe a su manera («GARCIA LOPEZ MARIA»,
 * «Transf. de María García»).
 *  · `COMPLETA`: el nombre y el primer apellido.
 *  · `APELLIDO`: el primer apellido (de 3 letras o más) y, si lo tiene, el segundo.
 */
export function coincidenciaNombre(texto: string | null | undefined, nombre: string, apellidos: string): CoincidenciaNombre {
  if (!texto) return 'NINGUNA';
  const delTexto = new Set(palabras(texto));
  const nombres = palabras(nombre);
  const aps = palabras(apellidos);
  const primerApellido = aps[0];
  if (!primerApellido || primerApellido.length < 3 || !delTexto.has(primerApellido)) return 'NINGUNA';
  if (nombres.length > 0 && delTexto.has(nombres[0])) return 'COMPLETA';
  const segundo = aps[1];
  if (segundo && !delTexto.has(segundo)) return 'NINGUNA';
  return 'APELLIDO';
}
