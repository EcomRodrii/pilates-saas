import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { VARIABLES_APP } from '../../components/student/ui/variables-app.ts';

// La vista previa del panel pinta las piezas de la app con estos valores: si `student.css`
// cambia uno y aquí no, la vista previa dejaría de parecerse a la app.
test('las variables de la vista previa son las de serie de student.css', () => {
  const css = readFileSync(join(import.meta.dirname, '../../app/portal/[slug]/student.css'), 'utf8');
  for (const [nombre, valor] of Object.entries(VARIABLES_APP)) {
    const m = css.match(new RegExp(`^\\s*${nombre}:\\s*([^;]+);`, 'm'));
    assert.ok(m, `${nombre} no está en student.css`);
    assert.equal(m![1].replace(/\s*\/\*.*\*\/\s*$/, '').trim().toLowerCase(), valor.toLowerCase(), nombre);
  }
});
