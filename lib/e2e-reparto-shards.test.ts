import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error — script en JS plano, sin tipos; se importa por su comportamiento
import { repartir, specsEnDisco, duracionesConocidas } from '../scripts/shard-e2e-by-duration.js';

// ─────────────────────────────────────────────────────────────────────────────
// Guardián del reparto de E2E en shards.
//
// La primera versión de esto commiteaba la asignación en `.github/e2e-shards.json`
// con la lista de specs DENTRO. Ese fichero se quedó con 30 nombres —28 de ellos
// de specs ya borrados— mientras el repo crecía a 150+: cablearlo tal cual habría
// dejado ~149 specs sin ejecutar, con la CI en verde. Nunca llegó a pasar solo
// porque ningún workflow lo leía; el commit que decía cablearlo no lo cableó.
//
// Ahora la lista sale de globear `e2e/`, así que un spec nuevo entra solo. Estos
// tests protegen esa propiedad y el determinismo, que es lo que permite que los
// 12 jobs de CI calculen el reparto por separado y coincidan.
// ─────────────────────────────────────────────────────────────────────────────

const N = 12;

test('todo spec de e2e/ cae en exactamente un shard', () => {
  const specs = specsEnDisco();
  assert.ok(specs.length > 100, `esperaba el corpus real de e2e, encontré ${specs.length}`);

  const shards = repartir({ specs, duraciones: duracionesConocidas(), nShards: N });
  const asignados = shards.flatMap((s: { files: string[] }) => s.files);

  assert.equal(asignados.length, specs.length, 'hay specs sin asignar o duplicados');
  assert.deepEqual([...asignados].sort(), [...specs].sort());
});

test('el reparto es determinista (los 12 jobs de CI deben coincidir)', () => {
  const specs = specsEnDisco();
  const duraciones = duracionesConocidas();
  const a = repartir({ specs, duraciones, nShards: N });
  const b = repartir({ specs: [...specs].reverse(), duraciones, nShards: N });
  assert.deepEqual(
    a.map((s: { files: string[] }) => s.files),
    b.map((s: { files: string[] }) => s.files),
    'el orden de entrada cambia el reparto: dos shards podrían correr el mismo spec y otro ninguno',
  );
});

test('un spec nuevo sin medir no se pierde: se le asume la mediana', () => {
  const shards = repartir({
    specs: ['a.spec.ts', 'b.spec.ts', 'recien-creado.spec.ts'],
    duraciones: { 'a.spec.ts': 60_000, 'b.spec.ts': 20_000 },
    nShards: 2,
  });
  const todos = shards.flatMap((s: { files: string[] }) => s.files);
  assert.ok(todos.includes('recien-creado.spec.ts'), 'un spec sin duración conocida se quedó fuera');
  assert.equal(todos.length, 3);
});

test('sin perfil de duraciones sigue repartiendo (nunca deja specs fuera)', () => {
  const specs = ['x.spec.ts', 'y.spec.ts', 'z.spec.ts'];
  const shards = repartir({ specs, duraciones: {}, nShards: 2 });
  assert.deepEqual(shards.flatMap((s: { files: string[] }) => s.files).sort(), specs);
});

test('un perfil con specs fantasma no rompe ni los cuela', () => {
  // Exactamente el estado en el que estaba el fichero real: nombres que ya no
  // existen. No deben aparecer en ningún shard.
  const shards = repartir({
    specs: ['vivo.spec.ts'],
    duraciones: { 'borrado-hace-meses.spec.ts': 90_000, 'vivo.spec.ts': 10_000 },
    nShards: 3,
  });
  const todos = shards.flatMap((s: { files: string[] }) => s.files);
  assert.deepEqual(todos, ['vivo.spec.ts']);
});

test('nShards inválido falla en vez de repartir a medias', () => {
  assert.throws(() => repartir({ specs: ['a.spec.ts'], nShards: 0 }), /nShards/);
});
