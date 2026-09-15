// ─────────────────────────────────────────────────────────────────────────────
// Qué puede cambiar la instructora de su ficha desde la app del estudio.
//
// Solo tres campos de SU fila de `instructores` en esta sede: nombre,
// descripción (`bio`) y teléfono. La foto va por su propia ruta
// (`/api/portal/instructora/foto`). Nada más: ni el email (es con lo que entra
// en la app; cambiarlo va en otra fase), ni rol, color, activo o tipo de
// contrato, que los decide el estudio.
//
// El servidor escribe SOLO lo que devuelve `leerCambiosPerfil`, nunca el cuerpo
// de la petición tal cual: una clave de más en el JSON no llega a la base.
//
// Puro y sin dependencias: se prueba con `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

export const MAX_NOMBRE = 80;
export const MAX_BIO = 600;

const RE_TELEFONO = /^\+?[0-9\s().-]+$/;

export interface CambiosPerfil {
  nombre?: string;
  bio?: string | null;
  telefono?: string | null;
}

export type CampoPerfil = 'nombre' | 'bio' | 'telefono' | 'general';

export type LecturaCambios =
  | { ok: true; cambios: CambiosPerfil }
  | { ok: false; error: string; campo: CampoPerfil };

/** Los cambios válidos que pide, ya limpios, o por qué no valen (dicho para ella). */
export function leerCambiosPerfil(cuerpo: unknown): LecturaCambios {
  if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) {
    return { ok: false, error: 'No hay nada que guardar.', campo: 'general' };
  }
  const b = cuerpo as Record<string, unknown>;
  const cambios: CambiosPerfil = {};

  if ('nombre' in b) {
    if (typeof b.nombre !== 'string' || !b.nombre.trim()) {
      return { ok: false, error: 'Escribe tu nombre.', campo: 'nombre' };
    }
    const nombre = b.nombre.trim().replace(/\s+/g, ' ');
    if (nombre.length > MAX_NOMBRE) {
      return { ok: false, error: `El nombre no puede pasar de ${MAX_NOMBRE} caracteres.`, campo: 'nombre' };
    }
    cambios.nombre = nombre;
  }

  if ('bio' in b) {
    if (b.bio !== null && typeof b.bio !== 'string') {
      return { ok: false, error: 'La descripción no es válida.', campo: 'bio' };
    }
    const bio = typeof b.bio === 'string' ? b.bio.trim() : '';
    if (bio.length > MAX_BIO) {
      return { ok: false, error: `La descripción no puede pasar de ${MAX_BIO} caracteres.`, campo: 'bio' };
    }
    // Vacía = sin descripción, no una cadena en blanco que la ficha pintaría.
    cambios.bio = bio || null;
  }

  if ('telefono' in b) {
    if (b.telefono !== null && typeof b.telefono !== 'string') {
      return { ok: false, error: 'Ese teléfono no parece válido.', campo: 'telefono' };
    }
    const telefono = typeof b.telefono === 'string' ? b.telefono.trim() : '';
    if (telefono) {
      const digitos = telefono.replace(/\D/g, '').length;
      if (!RE_TELEFONO.test(telefono) || telefono.length > 25 || digitos < 6 || digitos > 15) {
        return { ok: false, error: 'Ese teléfono no parece válido.', campo: 'telefono' };
      }
    }
    cambios.telefono = telefono || null;
  }

  if (Object.keys(cambios).length === 0) {
    return { ok: false, error: 'No hay nada que guardar.', campo: 'general' };
  }
  return { ok: true, cambios };
}
