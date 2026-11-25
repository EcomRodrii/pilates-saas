// Quien está en Founding Studio gratis lo tiene todo; al pagar Founding, el
// Centro de Control, las sustituciones automáticas y la IA van aparte. Ningún
// aviso que le ofrezca pagar puede decirle que se queda igual.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AL_PAGAR_FOUNDING } from '../landing/founding-gratis.ts';
import { ADDONS, LISTA_ADDONS } from './entitlements.ts';

const AVISOS = [
  'components/billing/plan-gratis.tsx',
  'components/billing/felicidades-crecimiento.tsx',
  'components/billing/suscripcion-vista.tsx',
];

test('la frase de antes de pagar nombra los tres complementos con su precio', () => {
  for (const a of LISTA_ADDONS) assert.ok(AL_PAGAR_FOUNDING.includes(`(${ADDONS[a].precioMes} €/mes)`), a);
});

test('ningún aviso de pago promete que todo sigue igual', () => {
  for (const f of AVISOS) {
    assert.doesNotMatch(readFileSync(f, 'utf8'), /todo igual|igual que ahora|lo mismo que ya usas/i, f);
  }
});

test('el aviso del margen, el de panel cerrado y la felicitación llevan la frase', () => {
  const veces = (f: string) => readFileSync(f, 'utf8').split(/\$?\{AL_PAGAR_FOUNDING\}/).length - 1;
  assert.equal(veces('components/billing/plan-gratis.tsx'), 2);
  assert.equal(veces('components/billing/felicidades-crecimiento.tsx'), 1);
});

test('antes de pagar se ven las dos listas: en el margen, con el panel cerrado y en la felicitación', () => {
  const aviso = readFileSync('components/billing/plan-gratis.tsx', 'utf8');
  assert.match(aviso, /\(gratis\.fase === 'MARGEN' \|\| gratis\.fase === 'CERRADO'\) && <QueCambia/);
  assert.match(readFileSync('components/billing/felicidades-crecimiento.tsx', 'utf8'), /<QueCambia compacta \/>/);
});
