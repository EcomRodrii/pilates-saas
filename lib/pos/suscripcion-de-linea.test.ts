import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { filaSuscripcionDeLinea, type PlanDeLinea } from './suscripcion-de-linea.ts';

const ids = { suscripcionId: 'sus-pos-l1', studioId: 'studio-1', socioId: 'soc-1', hoy: '2026-09-14' };
const plan = (over: Partial<PlanDeLinea>): PlanDeLinea => ({
  id: 'p-1', tipo: 'MENSUAL', sesiones: null, validez_dias: null, periodicidad_meses: null, ...over,
});

test('⚠️ una cuota mensual vendida en el TPV nace CON fecha de fin, a un mes', () => {
  // Antes: `calcularFechaFinBono(hoy, null)` → NULL → el cron de renovaciones
  // (que filtra `fecha_fin is not null`) no la veía nunca: cobrada una vez y
  // gratis para siempre.
  const fila = filaSuscripcionDeLinea(plan({}), ids);
  assert.equal(fila.fecha_fin, '2026-10-14');
  assert.equal(fila.fecha_inicio, '2026-09-14');
  assert.equal(fila.estado, 'ACTIVA');
});

test('trimestral y anual: la fecha de fin respeta `periodicidad_meses`', () => {
  assert.equal(filaSuscripcionDeLinea(plan({ periodicidad_meses: 3 }), ids).fecha_fin, '2026-12-14');
  assert.equal(filaSuscripcionDeLinea(plan({ periodicidad_meses: 12 }), ids).fecha_fin, '2027-09-14');
});

test('un bono sigue caducando por sus días de validez y nace con sus sesiones', () => {
  const fila = filaSuscripcionDeLinea(plan({ tipo: 'BONO', sesiones: 10, validez_dias: 30 }), ids);
  assert.equal(fila.fecha_fin, '2026-10-14');
  assert.equal(fila.sesiones_restantes, 10);
});

test('un bono sin validez no caduca por fecha (eso sí es a propósito)', () => {
  assert.equal(filaSuscripcionDeLinea(plan({ tipo: 'BONO', sesiones: 5, validez_dias: null }), ids).fecha_fin, null);
});

test('la fila lleva los ids que se le pasan, sin inventar ninguno', () => {
  const fila = filaSuscripcionDeLinea(plan({ id: 'p-9' }), ids);
  assert.deepEqual(
    { id: fila.id, studio_id: fila.studio_id, socio_id: fila.socio_id, plan_id: fila.plan_id, stripe_subscription_id: fila.stripe_subscription_id },
    { id: 'sus-pos-l1', studio_id: 'studio-1', socio_id: 'soc-1', plan_id: 'p-9', stripe_subscription_id: null },
  );
});

test('guardia: fuera de bono-logic nadie calcula el ciclo de un alta con `calcularFechaFinBono`', () => {
  // Los caminos de alta lo hacían «sin mirar el tipo» y dejaban las cuotas sin
  // fecha de fin (bono-logic.ts, `cicloInicialDe`). Se arregló en cuatro y el
  // TPV se quedó fuera. Un camino nuevo que vuelva a llamarla se ve aquí.
  // Se quitan los comentarios antes de buscar: nombrarla en un comentario no
  // es llamarla.
  const raiz = join(import.meta.dirname, '..', '..');
  const culpables: string[] = [];
  for (const base of ['lib', 'app', 'components']) {
    for (const rel of readdirSync(join(raiz, base), { recursive: true }) as string[]) {
      if (!/\.tsx?$/.test(rel) || /\.test\.tsx?$/.test(rel)) continue;
      const ruta = join(base, rel);
      if (ruta === join('lib', 'bono-logic.ts')) continue;
      const codigo = readFileSync(join(raiz, ruta), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');
      if (/\bcalcularFechaFinBono\s*\(/.test(codigo)) culpables.push(ruta);
    }
  }
  assert.deepEqual(culpables, [], 'usa `cicloInicialDe`, que mira el tipo de plan');
});
