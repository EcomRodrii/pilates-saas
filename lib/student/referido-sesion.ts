'use client';

// El referidor, entre el enlace que se abre y el alta que se firma.
//
// Mismo problema y misma solución que la firma del contrato
// (`consentimiento.ts`): quien abre el enlace todavía NO tiene sesión, y entre
// abrirlo y crear la ficha hay un correo o una vuelta por Google. El dato tiene
// que sobrevivir a ese viaje.
//
// `sessionStorage`, no `localStorage`, por lo mismo que la firma: es un dato de
// un trámite en curso. Si cierra la pestaña se pierde, y perderlo solo cuesta
// la atribución — nunca el alta.

import { referidorUtilizable } from './referido.ts';

const clave = (slug: string) => `st_ref_${slug}`;

/** Guarda el referidor si tiene forma de serlo. Devuelve si se guardó. */
export function guardarReferidor(slug: string, ref: string | null | undefined): boolean {
  if (!referidorUtilizable(ref, null)) return false;
  try {
    sessionStorage.setItem(clave(slug), (ref as string).trim());
    return true;
  } catch {
    // Modo privado o almacenamiento lleno. No es fatal: se pierde la
    // atribución, no el alta.
    return false;
  }
}

export function leerReferidor(slug: string): string | null {
  try {
    const v = sessionStorage.getItem(clave(slug));
    // Se revalida al leer: un `sessionStorage` manipulado no puede colar aquí
    // algo que luego haga fallar el INSERT por la clave foránea.
    return referidorUtilizable(v, null) ? (v as string).trim() : null;
  } catch {
    return null;
  }
}

export function olvidarReferidor(slug: string): void {
  try { sessionStorage.removeItem(clave(slug)); } catch { /* da igual */ }
}
