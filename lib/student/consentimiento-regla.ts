// La regla de «¿esta firma prueba algo?», en un módulo sin `'use client'` a
// propósito: la comparten la pantalla que recoge la firma
// (lib/student/consentimiento.ts) y la ruta de servidor que la persiste
// (app/api/public/socio/route.ts). Si cada lado tuviera su propia versión,
// bastaría con que una divergiera para que el servidor guardara una traza que
// el cliente ya consideraba inválida, o al revés.
//
// Está aquí y no dentro de `consentimiento.ts` porque ese fichero es de
// cliente (usa `sessionStorage`) y un route handler no puede importarlo.
//
// ⚠️ Esto valida la FORMA, no la autoridad. Quién consintió y por qué vía lo
// decide el servidor: `aceptacion_origen` se fija a 'PORTAL' en la ruta y nunca
// se acepta del cliente. La migración 0109 puso un CHECK
// ('PORTAL','MOSTRADOR') citando el art. 7.1 del RGPD — hay que poder
// demostrar quién dio el consentimiento—, y una fila con el origen a NULL es
// exactamente el estado que esa migración existe para eliminar.

/** Los tres campos que hacen demostrable un consentimiento. */
export interface FirmaMinima {
  /** ISO del instante exacto en que se pulsó aceptar. */
  fecha?: unknown;
  /** El nombre TECLEADO al aceptar. Es la firma, no el nombre de la ficha. */
  firma?: unknown;
  /** El texto legal completo vigente entonces, no un número de versión. */
  versionTexto?: unknown;
}

/** Una firma que ya ha pasado la comprobación: los tres campos son cadenas. */
export interface FirmaValida { fecha: string; firma: string; versionTexto: string }

/**
 * `true` solo si los tres campos vienen y son cadenas con contenido real.
 *
 * Es un type predicate y no un booleano suelto a propósito: quien la llama
 * necesita que TypeScript ESTRECHE el tipo después. Con un `boolean` normal,
 * la ruta seguía viendo `fecha?: string | undefined` tras comprobarla y había
 * que forzar el tipo — un `as` ahí es justo lo que deja pasar una firma
 * incompleta el día que alguien mueva la comprobación.
 *
 * Se exige `trim()` porque una firma de espacios pasa cualquier comprobación
 * de «no vacío» y no identifica a nadie: es la forma más fácil de acabar con
 * una traza legal que parece completa en la base de datos y no prueba nada.
 */
export function firmaCompleta<T extends FirmaMinima>(f: T | null | undefined): f is T & FirmaValida {
  if (!f) return false;
  const cadena = (v: unknown) => typeof v === 'string' && v.trim().length > 0;
  return cadena(f.fecha) && cadena(f.firma) && cadena(f.versionTexto);
}
