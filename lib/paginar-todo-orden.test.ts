// Guardia estática: toda llamada a `fetchAllRows` (y a `leerEnLotes`, su
// envoltorio por lotes de bonos-inactivas-cron) declara un `.order(...)`.
//
// Paginar con `.range()` sin orden total y estable repite u omite filas si
// hay escrituras entre dos páginas (y ahora las páginas van en paralelo, así
// que depende aún más del orden). El orden tiene que ser TOTAL: la PK, o una
// columna con duplicados MÁS la PK como desempate.
//
// Esta guardia solo ve que haya un `.order(`; que sea total es cosa de quien
// lo escribe. Las funciones que reciben `fetchAllRows` inyectado (p. ej.
// `leerTodas` en recordatorio-clase) no se ven desde aquí: su llamador es el
// que pasa la consulta.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = path.resolve(import.meta.dirname, '..');
const ENVOLTORIOS = ['fetchAllRows', 'leerEnLotes'];

function ficheros(dir: string, salida: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) ficheros(p, salida);
    else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name)) salida.push(p);
  }
  return salida;
}

/** Llamadas `nombre(...)` / `nombre<T>(...)` con su texto completo. */
export function llamadas(src: string, nombre: string): Array<{ linea: number; texto: string }> {
  const out: Array<{ linea: number; texto: string }> = [];
  let i = 0;
  while ((i = src.indexOf(nombre, i)) >= 0) {
    const j = i + nombre.length;
    const antes = src[i - 1];
    i = j;
    if (antes && /[\w.]/.test(antes)) continue; // otro identificador
    if (!/[<(]/.test(src[j] ?? '')) continue;
    // `async function fetchAllRows<T>(` es la definición, no una llamada.
    if (/function\s+$/.test(src.slice(Math.max(0, j - nombre.length - 20), j - nombre.length))) continue;
    const p = src.indexOf('(', j);
    let d = 0;
    let k = p;
    for (; k < src.length; k++) {
      if (src[k] === '(') d++;
      else if (src[k] === ')' && --d === 0) break;
    }
    out.push({ linea: src.slice(0, j).split('\n').length, texto: src.slice(p, k + 1) });
  }
  return out;
}

test('toda llamada a fetchAllRows / leerEnLotes declara su .order()', () => {
  const sinOrden: string[] = [];
  let vistas = 0;
  for (const d of ['lib', 'app', 'components']) {
    for (const f of ficheros(path.join(RAIZ, d))) {
      const src = fs.readFileSync(f, 'utf8');
      for (const nombre of ENVOLTORIOS) {
        for (const c of llamadas(src, nombre)) {
          // Definiciones de tipo / parámetros (`pagina: (from: number…`).
          if (/^\(\s*studioId: string,\s*tabla: string/.test(c.texto)) continue;
          if (/^\(\s*\n?\s*studioId: string,\s*tabla: string/.test(c.texto)) continue;
          // Delegación por lotes: el orden lo declara cada llamador de leerEnLotes.
          if (/consulta\(lote,/.test(c.texto)) continue;
          vistas++;
          if (!/\.order\(/.test(c.texto)) sinOrden.push(`${path.relative(RAIZ, f)}:${c.linea}`);
        }
      }
    }
  }
  assert.ok(vistas > 50, `la guardia solo ha visto ${vistas} llamadas: ¿cambió la forma de buscarlas?`);
  assert.deepEqual(
    sinOrden,
    [],
    'Paginar sin orden total repite u omite filas. Añade `.order(\'id\')` (o columna + id) antes de `.range(...)`.',
  );
});
