// Veri*Factu — lo que el alta deduce para que la propietaria no tenga que escribirlo.
//
// El alta pedía nueve datos para un trámite que, para una autónoma, se reduce a
// pegar el CSV que le da la AEAT: el tipo de emisor sale de la primera letra del
// NIF, y si factura como persona física, quien otorga el poder es ella misma
// (el servidor lo exige así: `erroresAutorizacion`). Solo se le pregunta lo que
// no se puede saber. Lógica pura: la usa la pantalla del alta.

import type { TipoEmisor } from './apoderamiento.ts';

/**
 * El tipo de emisor que dice el NIF. Un DNI (empieza por número) o un NIE
 * (X, Y, Z) es una persona física, igual que los NIF K, L y M. A, B, C, D y F
 * son sociedades (anónima, limitada, colectiva, comanditaria, cooperativa); el
 * resto de letras, otras entidades (comunidad de bienes, sociedad civil…).
 * Es una propuesta: la propietaria la puede corregir.
 */
export function tipoEmisorPorNif(nif: string | null | undefined): TipoEmisor {
  const primera = (nif ?? '').trim().toUpperCase().charAt(0);
  if (/^[0-9XYZKLM]$/.test(primera)) return 'persona_fisica';
  if (/^[ABCDF]$/.test(primera)) return 'sociedad';
  return 'otra';
}

/**
 * Quién otorgó el poder, cuando se puede saber sin preguntar: si factura como
 * persona física, es la titular, con su nombre fiscal y su NIF. En una sociedad
 * u otra entidad lo firma otra persona y hay que preguntarlo (`null`).
 */
export function otorganteDeducido(p: { tipoEmisor: TipoEmisor; nombreFiscal: string; nif: string }):
  { nombre: string; nif: string; cargo: 'titular' } | null {
  if (p.tipoEmisor !== 'persona_fisica') return null;
  return { nombre: p.nombreFiscal.trim(), nif: p.nif.trim().toUpperCase(), cargo: 'titular' };
}
