'use client';

// En qué pantalla del alta nueva se quedó, en ESTE navegador (por estudio). Sin
// columna nueva en `studios` (decisión C3 del plan): lo escrito ya está en la
// base de datos, esto solo dice dónde seguir. Sin almacenamiento (modo privado,
// datos del sitio bloqueados) se empieza por la primera y no pasa nada más.

import { clavePantallaAlta, leerAltaGuardada, pantallaParaGuardar, type PantallaAlta } from '@/lib/alta/bienvenida-nueva';

/** La pantalla y, en «¡Listo!», el nombre de la clase publicada. */
export function leerAlta(studioId: string): { pantalla: PantallaAlta; clase: string | null } {
  try {
    return leerAltaGuardada(window.localStorage.getItem(clavePantallaAlta(studioId)));
  } catch {
    return { pantalla: 'estudio', clase: null };
  }
}

export function leerPantalla(studioId: string): PantallaAlta {
  return leerAlta(studioId).pantalla;
}

export function guardarPantalla(studioId: string, p: PantallaAlta, clase?: string | null): void {
  try { window.localStorage.setItem(clavePantallaAlta(studioId), pantallaParaGuardar(p, clase)); } catch { /* sin almacenamiento */ }
}

export function olvidarPantalla(studioId: string): void {
  try { window.localStorage.removeItem(clavePantallaAlta(studioId)); } catch { /* nada que borrar */ }
}
