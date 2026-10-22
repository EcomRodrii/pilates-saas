import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LEGAL, VERSION_TEXTOS_LEGALES } from './legal-info.ts';

// La versión de los textos legales que se guarda como aceptada en cada alta
// (`altas_estudio.condiciones_version`) tiene que ser la fecha que enseñan
// /terminos y /privacidad. Si alguien cambia esa fecha (porque cambió el texto)
// y se olvida de la versión, el alta seguiría guardando que se aceptó la
// anterior: justo lo que no se puede reconstruir después.

const RAIZ = join(import.meta.dirname, '..');
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** «6 de octubre de 2026» → «2026-10-06». */
function iso(fecha: string): string | null {
  const m = /^(\d{1,2}) de ([a-z]+) de (\d{4})$/.exec(fecha.trim().toLowerCase());
  if (!m) return null;
  const mes = MESES.indexOf(m[2]) + 1;
  if (mes === 0) return null;
  return `${m[3]}-${String(mes).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

test('la versión aceptada en el alta es la fecha que enseñan /terminos y /privacidad', () => {
  assert.equal(iso(LEGAL.actualizado), VERSION_TEXTOS_LEGALES,
    'LEGAL.actualizado cambió: si cambió el texto legal, cambia también VERSION_TEXTOS_LEGALES');
});

test('la versión tiene el formato que acepta la base de datos', () => {
  // El trigger de auth.users descarta cualquier otra forma (migración de las condiciones).
  assert.match(VERSION_TEXTOS_LEGALES, /^\d{4}-\d{2}-\d{2}$/);
});

test('las dos páginas sacan su fecha del mismo sitio', () => {
  // /terminos y /privacidad no escriben su fecha: la pinta el layout de (legal)
  // con LEGAL.actualizado. Si una página empezara a llevar la suya, este test
  // ya no estaría comparando con lo que se enseña.
  const layout = readFileSync(join(RAIZ, 'app/(legal)/layout.tsx'), 'utf8');
  assert.match(layout, /Última actualización: \{LEGAL\.actualizado\}/);
  for (const pagina of ['app/(legal)/terminos/page.tsx', 'app/(legal)/privacidad/page.tsx']) {
    const src = readFileSync(join(RAIZ, pagina), 'utf8');
    assert.doesNotMatch(src, /Última actualización/i, `${pagina} no debería llevar una fecha propia`);
  }
});
