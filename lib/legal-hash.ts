import { createHash } from 'node:crypto';

// La huella de un texto legal, para poder decir QUÉ aceptó la clienta en una
// compra concreta sin repetir el texto en cada fila.
//
// Sin `@/` en los imports, para que `node --test` pueda cargarlo (el runner no
// resuelve el alias y varios tests de este repo dejaron de ejecutarse en
// silencio por eso).

/**
 * SHA-256 en hexadecimal, de los 64 caracteres completos.
 *
 * ⚠️ Sin truncar, y no por purismo: esto es la única prueba de qué texto firmó
 * la clienta. Un prefijo corto ahorra bytes en una columna que ya es pequeña y
 * a cambio abre la puerta a que dos textos distintos compartan huella — que es
 * exactamente lo que un documento de prueba no puede permitirse.
 *
 * El texto se normaliza primero (ver `normalizarTextoLegal`): dos versiones que
 * solo difieren en saltos de línea o espacios finales son el MISMO documento, y
 * generar una versión nueva por eso llenaría la tabla de duplicados sin que
 * nadie hubiera cambiado una condición.
 */
export function hashTextoLegal(texto: string): string {
  return createHash('sha256').update(normalizarTextoLegal(texto), 'utf8').digest('hex');
}

/**
 * Lo que se considera «el mismo documento».
 *
 * Se unifican los finales de línea y se recortan los espacios al final de cada
 * línea y del texto entero. NO se tocan mayúsculas, acentos ni puntuación: eso
 * sí cambia lo que dice el documento.
 */
export function normalizarTextoLegal(texto: string): string {
  return texto
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/[ \t]+$/, ''))
    .join('\n')
    .trim();
}
