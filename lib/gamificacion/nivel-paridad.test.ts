import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calcularNivel } from '../engines/level-engine.ts';
import { nivelDe } from '../student/gamificacion.ts';
import { escala, nivelDeTotal, quienBajaria, vistaDeNivel } from './ritmo-niveles.ts';

// Paridad panel / app / servidor: el mismo total ha de dar el mismo nivel en las tres.
// Si falla, no se relaja: alguien ha vuelto a ordenar por su cuenta (G-04).

const fila = (id: string, orden: number, umbral: number, activo = true) => ({
  id, studioId: 'e', nombre: id, orden, umbralCreditos: umbral, color: '#000', icono: '·', beneficios: null, activo, creadoEn: '2026-01-01',
});
// La escala anómala real: el nivel de umbral 60 lleva `orden` 5.
const anomala = [fila('L0', 0, 0), fila('L200', 1, 200), fila('L500', 2, 500), fila('L1000', 3, 1000), fila('L2000', 4, 2000), fila('L60', 5, 60)];
const limpia = [fila('A', 0, 0), fila('B', 1, 100), fila('C', 2, 300)];
const conInactivo = [fila('A', 0, 0), fila('B', 1, 100, false), fila('C', 2, 300)];

const totales = [0, 1, 59, 60, 150, 199, 200, 499, 500, 999, 1000, 1999, 2000, 2500, 1e6];

for (const [nombre, niveles] of [['anómala', anomala], ['limpia', limpia], ['con inactivo', conInactivo]] as const) {
  test(`paridad panel/app/servidor, escala ${nombre}`, () => {
    for (const t of totales) {
      const servidor = nivelDeTotal(t, escala(niveles))?.id ?? null;
      const panel = calcularNivel(niveles, t);
      // La app recibe solo los activos (mapeo.ts los filtra antes).
      const app = nivelDe(t, niveles.filter((n) => n.activo));
      assert.equal(panel.actual?.id ?? null, servidor, `panel con ${t}`);
      assert.equal(app.actual?.id ?? null, servidor, `app con ${t}`);
      assert.equal(panel.siguiente?.id ?? null, app.siguiente?.id ?? null, `siguiente con ${t}`);
      assert.equal(panel.progreso, app.progreso, `progreso con ${t}`);
      assert.equal(panel.creditosParaSiguiente, app.faltan, `faltan con ${t}`);
    }
  });
}

test('la escala anómala: el nivel de umbral 60 es válido y el segundo', () => {
  assert.deepEqual(escala(anomala).map((n) => n.id), ['L0', 'L60', 'L200', 'L500', 'L1000', 'L2000']);
  for (const [t, id] of [[0, 'L0'], [59, 'L0'], [60, 'L60'], [150, 'L60'], [199, 'L60'], [200, 'L200'], [2500, 'L2000']] as const) {
    assert.equal(calcularNivel(anomala, t).actual?.id, id, `panel con ${t}`);
    assert.equal(nivelDe(t, anomala).actual?.id, id, `app con ${t}`);
  }
});

test('un nivel sin `activo` en el payload de la app cuenta como activo', () => {
  const v = vistaDeNivel(150, [{ id: 'a', umbralCreditos: 0 }, { id: 'b', umbralCreditos: 100 }]);
  assert.equal(v.actual?.id, 'b');
});

test('sin niveles, ninguna de las dos se rompe', () => {
  assert.equal(calcularNivel([], 50).actual, null);
  assert.equal(nivelDe(50, []).actual, null);
});

test('nadie baja: subir el umbral o quitar el nivel de umbral 60 bajaría a quien está ahí', () => {
  const quitado = anomala.filter((n) => n.id !== 'L60');
  const subido = anomala.map((n) => (n.id === 'L60' ? { ...n, umbralCreditos: 250 } : n));
  assert.equal(quienBajaria([60, 150, 199], anomala, quitado), 3);
  assert.equal(quienBajaria([60, 150, 199], anomala, subido), 3);
  assert.equal(quienBajaria([60, 150, 199], anomala, anomala), 0);
});

const fuente = (r: string) => readFileSync(new URL(r, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('nadie vuelve a ordenar niveles por su cuenta: panel y app solo envuelven vistaDeNivel', () => {
  for (const f of ['../engines/level-engine.ts', '../student/gamificacion.ts']) {
    const s = fuente(f);
    assert.match(s, /vistaDeNivel\(/, f);
    assert.doesNotMatch(s, /\.sort\([^)]*(umbralCreditos|orden)/, `${f} ordena por su cuenta`);
  }
});

test('el editor antiguo comprueba «nadie baja» en las tres escrituras de niveles', () => {
  const s = fuente('../studio-context.tsx');
  for (const fn of ['addLevelDefinition', 'updateLevelDefinition', 'deleteLevelDefinition']) {
    const i = s.indexOf(`async function ${fn}(`);
    assert.ok(i > 0, fn);
    const cuerpo = s.slice(i, s.indexOf('\n  }\n', i));
    const c = cuerpo.indexOf('nivelesBajarian(');
    assert.ok(c > 0 && c < cuerpo.indexOf('await db'), `${fn}: comprobar antes de escribir`);
  }
});
