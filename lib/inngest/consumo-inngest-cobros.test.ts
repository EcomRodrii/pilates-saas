// ─────────────────────────────────────────────────────────────────────────────
// Consumo de Inngest en los flujos de dinero (septiembre 2026).
//
// Cada run y cada step es una ejecución facturable, haya trabajo o no. En
// renovaciones y dunning se juntaron los steps que solo leen o que se pueden
// repetir sin efecto. Estas guardias impiden que vuelvan, y fijan a la vez lo
// que NO se puede juntar: el cobro de cada recibo, la conciliación SEPA de cada
// recibo atascado y el seguimiento de la penalización siguen en su propio step.
//
// Se comprueba sobre el FUENTE, mismo idioma que crons-cadencia.test.ts: estos
// ficheros arrastran Supabase y Stripe.
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = join(import.meta.dirname, '../..');
const leer = (rel: string) => readFileSync(join(RAIZ, rel), 'utf8');
const soloCodigo = (s: string) => s.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

/** El cuerpo de la función de Inngest con ese id. */
function funcion(fuente: string, id: string): string {
  const bloque = soloCodigo(fuente).split('inngest.createFunction').slice(1)
    .find(b => new RegExp(`id:\\s*'${id}'`).test(b));
  assert.ok(bloque, `no encuentro la función '${id}'`);
  return bloque.split('\n);')[0];
}
const pasos = (cuerpo: string) => cuerpo.match(/step\.run\(/g)?.length ?? 0;

test('renovaciones y dunning: la hora no gasta un step propio en el dispatcher', () => {
  for (const [rel, id] of [
    ['lib/inngest/renovaciones.ts', 'renovaciones-dispatcher'],
    ['lib/inngest/dunning.ts', 'dunning-dispatcher'],
  ]) {
    assert.ok(!funcion(leer(rel), id).includes("step.run('now'"), `${id}: la hora va dentro del step que lee la lista`);
  }
});

test('dispatchers: el step de la lista cambió de forma, así que cambió de id', () => {
  // Con el id viejo, una ejecución a medias durante un despliegue recuperaría el
  // array guardado por el código anterior y el fan-out fallaría para todos.
  for (const [rel, id] of [
    ['lib/inngest/renovaciones.ts', 'renovaciones-dispatcher'],
    ['lib/inngest/dunning.ts', 'dunning-dispatcher'],
  ]) {
    const cuerpo = funcion(leer(rel), id);
    assert.ok(!cuerpo.includes("step.run('list-studios'"), `${id}: el id 'list-studios' era de la forma vieja`);
    assert.ok(cuerpo.includes("step.run('list-studios-con-hora'"), `${id}: falta el step 'list-studios-con-hora'`);
  }
});

test('dunning-estudio: una lectura secundaria que falla no tumba los cobros del día', () => {
  const cuerpo = funcion(leer('lib/inngest/dunning.ts'), 'dunning-estudio');
  const lecturas = cuerpo.slice(cuerpo.indexOf("step.run('lecturas'"), cuerpo.indexOf('for (let i = 0; i < recibos.length'));
  assert.ok((lecturas.match(/\btry \{/g)?.length ?? 0) >= 2, 'SEPA atascados y tarjetas sin caducidad van en su propio try');
});

test('renovaciones-estudio: un solo step', () => {
  assert.equal(pasos(funcion(leer('lib/inngest/renovaciones.ts'), 'renovaciones-estudio')), 1,
    'adoptar y generar son idempotentes: juntos en un step no duplican nada y ahorran dos ejecuciones por estudio al día');
});

test('renovaciones-dispatcher: solo abre evento a estudios con cuotas vencidas o recibos por adoptar', () => {
  const cuerpo = funcion(leer('lib/inngest/renovaciones.ts'), 'renovaciones-dispatcher');
  // Las dos condiciones del worker, sin estrecharlas: si una de estas se pierde,
  // un estudio con trabajo se quedaría sin renovar.
  assert.match(cuerpo, /from\('suscripciones'\)[\s\S]*?\.eq\('estado', 'ACTIVA'\)[\s\S]*?\.lt\('fecha_fin', hoy\)/);
  assert.match(cuerpo, /from\('recibos'\)[\s\S]*?\.eq\('estado', 'PENDIENTE'\)[\s\S]*?\.is\('proximo_reintento', null\)[\s\S]*?\.eq\('es_renovacion', true\)/);
  assert.ok((cuerpo.match(/\.range\(/g)?.length ?? 0) >= 2, 'las dos lecturas globales van paginadas');
});

test('dunning-estudio: lecturas fijas y relleno de caducidades en un step cada uno; el cobro sigue por recibo', () => {
  const cuerpo = funcion(leer('lib/inngest/dunning.ts'), 'dunning-estudio');
  for (const id of ['candidatos', 'sepa-atascado-candidatos', 'tarjetas-sin-caducidad']) {
    assert.ok(!cuerpo.includes(`step.run('${id}'`), `step '${id}' suelto: va dentro de 'lecturas'`);
  }
  assert.ok(!cuerpo.includes('step.run(`caducidad-'), 'un step por tarjeta: el relleno va en un solo step');
  // Lo que NO se junta, a propósito.
  assert.ok(cuerpo.includes('step.run(`dunning-${'), 'el cobro de cada recibo sigue en su propio step');
  assert.ok(cuerpo.includes('step.run(`dunning-penalizacion-${'),
    'el seguimiento de la penalización sigue aparte: junto al cobro, un reintento tras registrarFalloCobro cobraría con una clave nueva');
  assert.ok(cuerpo.includes('step.run(`sepa-reconciliar-${'), 'la conciliación SEPA de cada recibo sigue en su propio step');
});
