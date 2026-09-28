// La huella de un texto: FNV-1a de 32 bits en base 36.
//
// Vive sola, sin imports, porque la usan dos firmas que no deben arrastrarse
// la una a la otra: `firmaCodigo` (./integracion.ts, lo que se copió) y
// `firmaDeUrl` (./firma-contenido.ts, lo que ve la página). /reservar carga la
// segunda y no tiene por qué cargar el generador de código entero.
//
// ⚠️ No se toca. Cambiar un solo operador cambia TODAS las huellas: lo copiado
// que hay guardado saldría como «Lo cambiaste después de copiarlo» sin que
// nadie haya cambiado nada, y lo visto en su web como «una versión distinta».

/** FNV-1a de 32 bits en base 36: corta, estable y sin dependencias. */
export function huella(texto: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}
