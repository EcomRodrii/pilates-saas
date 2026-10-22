'use client';

// En qué pantalla del alta nueva se quedó, en ESTE navegador (por estudio). Sin
// columna nueva en `studios` (decisión C3 del plan): lo escrito ya está en la
// base de datos, esto solo dice dónde seguir. Sin almacenamiento (modo privado,
// datos del sitio bloqueados) se empieza por la primera y no pasa nada más.

import { clavePantallaAlta, leerPantallaGuardada, pantallaParaGuardar, type PantallaAlta } from '@/lib/alta/bienvenida-nueva';

export function leerPantalla(studioId: string): PantallaAlta {
  try {
    return leerPantallaGuardada(window.localStorage.getItem(clavePantallaAlta(studioId)));
  } catch {
    return 'estudio';
  }
}

export function guardarPantalla(studioId: string, p: PantallaAlta): void {
  try { window.localStorage.setItem(clavePantallaAlta(studioId), pantallaParaGuardar(p)); } catch { /* sin almacenamiento */ }
}

export function olvidarPantalla(studioId: string): void {
  try { window.localStorage.removeItem(clavePantallaAlta(studioId)); } catch { /* nada que borrar */ }
}
