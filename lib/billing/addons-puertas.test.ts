// Las puertas de los complementos (Centro de Control, sustituciones automáticas,
// IA) tienen que LEER los complementos del estudio. `tieneFeature` con un
// objeto a mano `{ plan, subscriptionStatus }` cae en el Founding completo
// (`regimenAddons` ausente): regalaría el complemento a quien no lo paga. Se
// construye con `planDeFila(fila)` (columnas `COLUMNAS_PLAN`) o con el `Studio`
// entero del panel, que ya las trae.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const RAIZ = new URL('../../', import.meta.url).pathname;
const FEATURES = ['decisiones', 'sustitucionesAutonomas', 'ia'];

function ficheros(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    if (n === 'node_modules' || n === '.next') return [];
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return ficheros(p);
    return /\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : [];
  });
}

test('ninguna puerta de un complemento decide con { plan, subscriptionStatus } a mano', () => {
  const malas: string[] = [];
  for (const p of ['app', 'lib', 'components'].flatMap((d) => ficheros(join(RAIZ, d)))) {
    const src = readFileSync(p, 'utf8');
    for (const m of src.matchAll(/(tieneFeature|entitlementsDe)\(\s*\{\s*plan\s*:[^)]*\)/g)) {
      const resto = src.slice(m.index!, m.index! + 300);
      if (FEATURES.some((f) => new RegExp(`['"]${f}['"]|features\\.${f}\\b`).test(resto))) malas.push(relative(RAIZ, p));
    }
  }
  assert.deepEqual(malas, [], 'Usa planDeFila(fila) con COLUMNAS_PLAN (lib/billing/entitlements.ts).');
});

test('quien decide un complemento no lee el plan sin las columnas de complementos', () => {
  // Un `select('plan, subscription_status')` en el mismo fichero que la puerta
  // deja `regimen_addons` fuera y el estudio pasa por Founding completo.
  const malas: string[] = [];
  for (const p of ['app', 'lib'].flatMap((d) => ficheros(join(RAIZ, d)))) {
    const src = readFileSync(p, 'utf8');
    const decide = /bloqueoDelPlan\(/.test(src) || FEATURES.some((f) => new RegExp(`tieneFeature\\([^;]*['"]${f}['"]`).test(src));
    if (decide && /select\(['"`][^'"`]*\bplan, subscription_status\b(?![^'"`]*regimen_addons)/.test(src)) malas.push(relative(RAIZ, p));
  }
  assert.deepEqual(malas, [], 'Lee el plan con COLUMNAS_PLAN (lib/billing/entitlements.ts).');
});
