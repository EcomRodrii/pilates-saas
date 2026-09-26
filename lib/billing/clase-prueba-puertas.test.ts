import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// Las puertas de la «clase de prueba» (lib/billing/clase-prueba.ts), vigiladas
// sobre el código fuente: las rutas arrastran Stripe y el cliente admin y no se
// pueden importar aquí (mismo patrón que matricula-solo-una-vez.test.ts).
//
// El fallo recurrente de este repo es arreglar UNO de los dos checkouts gemelos
// y no el otro. Aquí se exige en los dos.
// ─────────────────────────────────────────────────────────────────────────────

const RAIZ = new URL('../../', import.meta.url).pathname;
const fuente = (ruta: string) => readFileSync(join(RAIZ, ruta), 'utf8');
const CHECKOUTS = ['app/api/public/checkout-embebido/route.ts', 'app/api/stripe/checkout/route.ts'];

for (const ruta of CHECKOUTS) {
  test(`⚠️ ${ruta}: lee es_prueba y llama a rechazoCompraPrueba ANTES de cobrar`, () => {
    const s = fuente(ruta);
    assert.match(s, /select\('[^']*\bes_prueba\b[^']*'\)/, 'el select del plan no trae es_prueba');
    const i = s.indexOf('rechazoCompraPrueba(admin');
    assert.ok(i > 0, 'no llama a rechazoCompraPrueba');
    // La LLAMADA real al cobro (no una mención en un comentario).
    const cobros = [...s.matchAll(/\.(paymentIntents|checkout\.sessions)\.create\(/g)]
      .filter(m => !s.slice(s.lastIndexOf('\n', m.index!), m.index!).includes('//'));
    assert.ok(cobros.length > 0, 'no encuentro la llamada de cobro');
    for (const m of cobros) assert.ok(i < m.index!, `rechazoCompraPrueba va DESPUÉS de ${m[0]}`);
  });

  test(`⚠️ ${ruta}: ningún código de descuento se apila sobre una prueba`, () => {
    assert.match(fuente(ruta), /body\.codigoDescuento && plan\.es_prueba !== true/);
  });
}

test('⚠️ renovar-plan rechaza una prueba (se volvería a vender a precio de prueba)', () => {
  const s = fuente('app/api/public/renovar-plan/route.ts');
  assert.match(s, /select\('[^']*\bes_prueba\b[^']*'\)/);
  assert.match(s, /plan\.es_prueba === true/);
});

test('⚠️ la reserva gratis concede la prueba ANTES de crear la reserva', () => {
  const s = fuente('app/api/public/reserva/route.ts');
  const i = s.indexOf('concederClasePruebaGratis(admin');
  const j = s.indexOf('crearReservaPublica({');
  assert.ok(i > 0 && j > 0 && i < j);
});

test('⚠️ el precio de la clase suelta sale de la fuente única, nunca de un `.find` en línea', () => {
  const culpables: string[] = [];
  const recorrer = (dir: string) => {
    for (const e of readdirSync(join(RAIZ, dir))) {
      const rel = `${dir}/${e}`;
      if (statSync(join(RAIZ, rel)).isDirectory()) { recorrer(rel); continue; }
      if (!/\.tsx?$/.test(e) || e.endsWith('.test.ts')) continue;
      if (/tipo === 'PUNTUAL' && p\.activo\)\?\.precio/.test(fuente(rel))) culpables.push(rel);
    }
  };
  recorrer('app/reservar');
  recorrer('lib/reservar');
  assert.deepEqual(culpables, [], 'un `.find(PUNTUAL && activo)` en línea tomaría el precio de la prueba');
});

test('⚠️ la lista de planes del widget nativo no ofrece la prueba', () => {
  assert.match(fuente('components/checkout-widget/lista-planes.tsx'), /p\.activo && p\.esPrueba !== true/);
});

test('⚠️ una segunda prueba pagada se entrega (dinero cobrado) pero se AVISA, en los dos eventos del webhook', () => {
  const entrega = fuente('lib/billing/entregar-plan-comprado.ts');
  assert.match(entrega, /select\('[^']*\bes_prueba\b[^']*'\)/);
  assert.match(entrega, /pruebaRepetida/);
  const webhook = fuente('app/api/stripe/webhook/route.ts');
  assert.equal((webhook.match(/entrega\.ok && entrega\.pruebaRepetida/g) ?? []).length, 2);
});
