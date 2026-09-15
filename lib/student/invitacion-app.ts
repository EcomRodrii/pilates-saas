'use client';

import {
  invitacionParaCuenta, invitacionVigente, serializarInvitacion, tokenConForma,
} from '@/lib/student/invitacion-app-regla';

// El enlace de invitación de una instructora mientras entra en la app. Por qué
// en `localStorage`, por qué caduca en 24 h y por qué se ata a una cuenta:
// `invitacion-app-regla.ts`.

const clave = (slug: string) => `st_invitacion_equipo:${slug}`;

export function guardarInvitacionApp(slug: string, token: string): boolean {
  if (!tokenConForma(token)) return false;
  try {
    localStorage.setItem(clave(slug), serializarInvitacion(token, Date.now()));
    return true;
  } catch {
    return false;
  }
}

/** Solo para pintar: no ata ni descarta. Lo que decide es `invitacionDeLaCuenta`. */
export function invitacionApp(slug: string): string | null {
  try {
    return invitacionVigente(localStorage.getItem(clave(slug)), Date.now());
  } catch {
    return null;
  }
}

/** La invitación para la cuenta que ha entrado: la ata a ella o la descarta. */
export function invitacionDeLaCuenta(slug: string, cuenta: string): string | null {
  try {
    const r = invitacionParaCuenta(localStorage.getItem(clave(slug)), Date.now(), cuenta);
    if (r.borrar) localStorage.removeItem(clave(slug));
    if (r.guardar) localStorage.setItem(clave(slug), r.guardar);
    return r.token;
  } catch {
    return null;
  }
}

export function olvidarInvitacionApp(slug: string): void {
  try { localStorage.removeItem(clave(slug)); } catch { /* modo privado */ }
}
