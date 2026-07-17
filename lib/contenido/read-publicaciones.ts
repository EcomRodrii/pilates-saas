'use client'

// Lector puntual de las publicaciones del módulo Contenido (localStorage).
// Se usa fuera del ContenidoProvider (p. ej. en Marketing) para asociar
// publicaciones a una campaña sin acoplar ambos módulos.

import type { Publicacion } from './types'

const STORAGE_KEY = 'contenido-store-v1'

export function leerPublicacionesContenido(): Publicacion[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const s = JSON.parse(raw) as { publicaciones?: Publicacion[] }
    return Array.isArray(s.publicaciones) ? s.publicaciones : []
  } catch {
    return []
  }
}
