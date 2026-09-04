'use client';

// La firma del contrato, entre la pantalla que la recoge y la que la persiste.
//
// Por qué hace falta un intermedio: la alumna acepta en `/acceso/registro`,
// pero en ese momento TODAVÍA NO tiene sesión —gotrue exige confirmar el email
// antes de emitirla— y la ficha de socia solo se puede crear con un JWT
// verificado. Entre las dos cosas hay un correo de por medio.
//
// Se guarda en `sessionStorage` y no en `localStorage` a propósito: es un dato
// de un trámite en curso, no una preferencia. Si la alumna cierra la pestaña,
// vuelve a aceptar — que es lo correcto: un consentimiento de hace tres días
// guardado en el disco no prueba gran cosa.
//
// ⚠️ Lo que se guarda es la FIRMA, no el permiso. El servidor no da nada por
// bueno por venir de aquí: fija él mismo `aceptacion_origen = 'PORTAL'`
// (app/api/public/socio/route.ts) y jamás acepta ese campo del cliente.

import { firmaCompleta } from './consentimiento-regla';

export interface FirmaContrato {
  /** ISO del instante exacto en que se pulsó aceptar. */
  fecha: string;
  /** El nombre TECLEADO al aceptar — es la firma, no el nombre de la ficha. */
  firma: string;
  /** El texto legal completo vigente en ese momento, no un número de versión. */
  versionTexto: string;
  /** El teléfono, si lo dio: viaja con el alta, no con la firma. */
  telefono?: string;
}

const clave = (slug: string) => `st_firma_${slug}`;

export function guardarFirma(slug: string, firma: FirmaContrato): void {
  try {
    sessionStorage.setItem(clave(slug), JSON.stringify(firma));
  } catch {
    // Modo privado o almacenamiento lleno. No es fatal: la pantalla de
    // verificación vuelve a pedir la aceptación si no la encuentra.
  }
}

export function leerFirma(slug: string): FirmaContrato | null {
  try {
    const raw = sessionStorage.getItem(clave(slug));
    if (!raw) return null;
    const f = JSON.parse(raw) as FirmaContrato;
    // Se valida la forma: un `sessionStorage` manipulado no puede colar una
    // firma vacía que luego el servidor guarde como consentimiento válido.
    return firmaCompleta(f) ? f : null;
  } catch {
    return null;
  }
}

export function olvidarFirma(slug: string): void {
  try { sessionStorage.removeItem(clave(slug)); } catch { /* da igual */ }
}
