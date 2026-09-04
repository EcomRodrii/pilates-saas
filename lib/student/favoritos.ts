'use client';

import { portalAuthHeader } from '@/lib/api-client';
import { catalogo, invalidarCatalogo } from '@/lib/student/catalogo';
import { proyectarFavoritos } from '@/lib/student/mapeo';

// Favoritos de la alumna: tipos de clase marcados con el corazón.
//
// El backend ya existía entero (`favoritos_clase`, único por socia+tipo, y
// `POST /api/public/favoritos` que deriva la socia del JWT); solo faltaba la
// pantalla. Sale del mismo payload que todo lo demás y se escribe contra la
// ruta existente. No hay un segundo sistema.

export async function getFavoritos(slug: string): Promise<Set<string>> {
  const d = await catalogo(slug);
  return d ? proyectarFavoritos(d) : new Set();
}

/** Marca o quita. `false` si el servidor no lo ha guardado. */
export async function alternarFavorito(slug: string, studioId: string, tipoClaseId: string, marcar: boolean): Promise<boolean> {
  try {
    const auth = await portalAuthHeader();
    const res = await fetch('/api/public/favoritos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ studioId, tipoClaseId, accion: marcar ? 'marcar' : 'desmarcar' }),
    });
    if (!res.ok) return false;
    // El payload compartido cambia: quien lo vuelva a pedir debe verlo.
    invalidarCatalogo(slug);
    return true;
  } catch {
    return false;
  }
}
