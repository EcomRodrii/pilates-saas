import test from 'node:test';
import assert from 'node:assert/strict';

import { FECHA_SALIDA_PORTAL_REACT, LO_QUE_SE_RETIRA, haCaducado } from './caducidad.ts';

// ── El plazo ────────────────────────────────────────────────────────────────
// Este es el único test del repo que puede ponerse rojo sin que nadie toque
// una línea de código, y es a propósito: es lo que hace que la fecha de salida
// del portal en React sea un plazo y no una buena intención en un comentario.

test('⚠️ el portal en React tiene que haberse retirado ya', () => {
  const hoy = new Date();
  assert.ok(
    !haCaducado(hoy),
    [
      '',
      `Pasó la fecha de salida del portal en React (${FECHA_SALIDA_PORTAL_REACT}).`,
      '',
      'Esto NO es un test roto: es el plazo que se puso al montar el flag por',
      'estudio, para que no se quedara para siempre y acabáramos manteniendo',
      'dos portales. Hay dos salidas honestas, y poner la CI en verde no es',
      'ninguna de las dos:',
      '',
      '  (a) Retirarlo. Lo que se borra:',
      ...LO_QUE_SE_RETIRA.map((x) => `      · ${x}`),
      '',
      '  (b) Mover FECHA_SALIDA_PORTAL_REACT en lib/portal-tema/caducidad.ts,',
      '      dejando escrito POR QUÉ hace falta más tiempo. Es legítimo; lo que',
      '      no lo es es moverla en silencio.',
      '',
      'Contexto: themes/RETOMAR.md, puntos 6 y 8.',
      '',
    ].join('\n'),
  );
});

// ── La comparación ──────────────────────────────────────────────────────────

test('haCaducado compara en UTC y por día, no por hora', () => {
  // El día de la fecha NO ha caducado todavía: se tiene hasta el final.
  assert.equal(haCaducado(new Date('2026-10-15T00:00:00Z'), '2026-10-15'), false);
  assert.equal(haCaducado(new Date('2026-10-15T23:59:59Z'), '2026-10-15'), false);
  assert.equal(haCaducado(new Date('2026-10-16T00:00:00Z'), '2026-10-15'), true);
  assert.equal(haCaducado(new Date('2026-10-14T23:59:59Z'), '2026-10-15'), false);
});

test('la fecha es un día ISO, no una frase', () => {
  // Sin esto, un `'octubre de 2026'` pasaría el `>` de forma silenciosa y
  // convertiría el plazo en decoración.
  assert.match(FECHA_SALIDA_PORTAL_REACT, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(
    new Date(`${FECHA_SALIDA_PORTAL_REACT}T00:00:00Z`).toISOString().slice(0, 10),
    FECHA_SALIDA_PORTAL_REACT,
  );
});
