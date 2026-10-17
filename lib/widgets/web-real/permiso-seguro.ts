import { firmarPermisoWebReal, verificarPermisoWebReal, type PermisoWebReal } from './token.ts';

// El permiso firmado de la vista previa de su web, SIN que un fallo de
// configuración (falta el secreto de firma) deje una respuesta rota.
//
// `token.ts` lanza si no hay secreto: es lo correcto ahí (sin secreto no se firma
// ni se verifica nada). Pero una ruta que deja subir esa excepción responde un
// 500 vacío, sin las cabeceras de marco y sin capturar. Estas dos funciones lo
// convierten en un resultado, y la ruta decide qué contestar (siempre sin enseñar
// nada) y lo manda a Sentry con `errorInterno`, sin el secreto.

export type LecturaPermiso = { permiso: PermisoWebReal | null; fallo?: unknown };

/** Verifica el permiso. Un permiso malo es `permiso: null`; una excepción (sin secreto) también, y trae su `fallo`. */
export function leerPermisoSinRomper(
  token: string | null | undefined,
  verificar: typeof verificarPermisoWebReal = verificarPermisoWebReal,
): LecturaPermiso {
  try {
    return { permiso: verificar(token) };
  } catch (fallo) {
    return { permiso: null, fallo };
  }
}

export type Firma = { ok: true; permiso: string } | { ok: false; fallo: unknown };

/** Firma el permiso. Sin secreto, `ok: false` con su `fallo` (nunca se entrega un permiso). */
export function firmarSinRomper(
  p: PermisoWebReal,
  firmar: typeof firmarPermisoWebReal = firmarPermisoWebReal,
): Firma {
  try {
    return { ok: true, permiso: firmar(p) };
  } catch (fallo) {
    return { ok: false, fallo };
  }
}
