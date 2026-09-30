import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// `recibos.fecha_cobro` es `date`, no `timestamptz`, y la fecha de la factura
// sale de ella. Con un ISO en UTC un cobro a la 01:30 de Madrid se fechaba el
// día anterior (y a caballo de un trimestre, el trimestre equivocado). Lo
// corrigió P-9 en `marcarCobrado` y en el servidor (`confirmarCobro`), pero el
// cobro en lote llevaba su propia copia con `new Date().toISOString()`.
//
// Es un test sobre el texto de `studio-context.tsx` (mismo recurso que
// `email-recibo-numero.test.ts`): esa función vive dentro de un contexto de
// React que `node --test` no puede montar. Deja de hacer falta cuando el cobro
// manual pase por el servidor (`confirmarCobro`, origen `manual`).
const ctx = readFileSync(new URL('../studio-context.tsx', import.meta.url), 'utf8');

/** Cuerpo de una función del contexto, sin sus comentarios. */
function cuerpoDe(nombre: string): string {
  const i = ctx.indexOf(`async function ${nombre}(`);
  assert.ok(i > 0, `no se encontró ${nombre}`);
  return ctx.slice(i, ctx.indexOf('\n  }\n', i))
    .split('\n')
    .filter(l => !l.trim().startsWith('//'))
    .join('\n');
}

for (const nombre of ['marcarCobrado', 'cobrarTodosPendientes']) {
  test(`${nombre} fecha el cobro con el día del estudio, no con un ISO en UTC`, () => {
    const cuerpo = cuerpoDe(nombre);
    assert.match(cuerpo, /const fechaCobro = hoyEnEstudio\(\)/,
      `${nombre} tiene que usar hoyEnEstudio(): fecha_cobro es \`date\`.`);
    assert.doesNotMatch(cuerpo, /const fechaCobro = new Date\(/,
      `${nombre} fecha el cobro con un instante en UTC: a la 01:30 de Madrid sale el día anterior.`);
  });
}
