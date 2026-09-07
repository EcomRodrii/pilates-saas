import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ESTADOS_COBRABLES, esReciboCobrable, esReciboImpagado } from './deuda-recibo.ts';

// ─────────────────────────────────────────────────────────────────────────────
// El guardián de A-1 (auditoría 26ª pasada).
//
// El fallo que cierra no fue un bug de lógica: fue que la regla vive en DOS
// sitios —la RPC `socio_tiene_impago`, que BLOQUEA, y `/api/stripe/checkout`,
// que COBRA— y solo se actualizó uno. Un test que repita a mano la lista de
// estados no protege de nada, porque volvería a haber dos listas.
//
// Así que este test DERIVA la regla del SQL vigente en `supabase/migrations` y
// exige que la mitad de TypeScript la cubra. Si alguien añade un estado de
// impago a la migración y no lo cablea aquí, esto se pone rojo. Es la misma
// receta que cerró la familia del `codigo` de rechazo.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * El CUERPO de la `socio_tiene_impago` vigente: la migración de versión más
 * alta que la redefine, recortada a lo que hay entre `as $$` y `$$`.
 *
 * ⚠️ Las dos precauciones son correcciones de la revisión independiente de esta
 * misma pasada, y las dos son fallos que este repo ya ha cometido:
 *
 *  1. **Recortar al cuerpo.** La primera versión leía el fichero ENTERO, y la
 *     cabecera de comentarios de esta migración nombra las tres columnas del
 *     discriminante. Borrar las tres cláusulas del SQL y dejar el comentario
 *     dejaba el test en verde con la socia reembolsada bloqueada otra vez: el
 *     guardián validaba la explicación, no el código.
 *  2. **Detectar la función con laxitud.** El filtro exigía `public.` y la
 *     firma en una línea; una migración futura escrita de otra forma se
 *     quedaba fuera y el test derivaba del fichero VIEJO, en verde, mientras
 *     las dos mitades divergían — la familia que dice cerrar.
 */
function sqlVigenteDeImpago(): string {
  const dir = join(import.meta.dirname, '..', '..', 'supabase', 'migrations');
  const define = /create\s+or\s+replace\s+function\s+(public\.)?socio_tiene_impago\b/i;
  const ficheros = readdirSync(dir)
    .filter(f => f.endsWith('.sql'))
    .sort()
    .filter(f => define.test(readFileSync(join(dir, f), 'utf8')));
  assert.ok(ficheros.length > 0, 'no se encuentra ninguna migración que defina socio_tiene_impago');
  const fuente = readFileSync(join(dir, ficheros[ficheros.length - 1]), 'utf8');
  const desde = fuente.search(define);
  const abre = fuente.indexOf('as $$', desde);
  const cierra = fuente.indexOf('$$', abre + 5);
  assert.ok(abre > 0 && cierra > abre, 'no se encuentra el cuerpo `as $$ … $$` de socio_tiene_impago');
  return fuente.slice(abre + 5, cierra);
}

test('los estados que el SQL trata como impago son todos cobrables desde el portal', () => {
  const sql = sqlVigenteDeImpago();
  const m = sql.match(/r\.estado\s+in\s*\(([^)]*)\)/i);
  assert.ok(m, 'la migración vigente ya no filtra por `r.estado in (...)`: revisa este test');
  const estadosSql = [...m![1].matchAll(/'([A-Z_]+)'/g)].map(x => x[1]);
  assert.ok(estadosSql.length >= 2, `esperaba al menos 2 estados, leí ${JSON.stringify(estadosSql)}`);

  // La invariante: lo que bloquea por deuda tiene que poder pagarse. Si no, la
  // socia queda sin reservar y sin vía de pago — el callejón que se arregla.
  for (const estado of estadosSql) {
    assert.ok(
      ESTADOS_COBRABLES.includes(estado as never),
      `la RPC bloquea por «${estado}» y /api/stripe/checkout no lo deja pagar`,
    );
  }
});

test('el SQL y el TS excluyen los MISMOS reembolsos', () => {
  const cuerpo = sqlVigenteDeImpago();
  // Se buscan las CLÁUSULAS, no las palabras: nombrar una columna en un
  // comentario no es mirarla, y el cuerpo es lo único que se ejecuta.
  const clausulas: [string, RegExp][] = [
    ['importe devuelto por debajo del importe',
      /coalesce\s*\(\s*r\.importe_devuelto[^)]*\)\s*<\s*r\.importe/i],
    ['reembolso ya creado en Stripe', /r\.reembolso_stripe_id\s+is\s+null/i],
    ['reembolso ya solicitado', /r\.reembolso_solicitado_en\s+is\s+null/i],
  ];
  for (const [que, re] of clausulas) {
    assert.match(cuerpo, re,
      `el cuerpo del SQL ya no comprueba «${que}»: un recibo reembolsado vuelve a bloquear la reserva, `
      + 'y esta mitad (esReciboCobrable) diría que no. Las dos mitades han divergido.');
  }
});

// ── Comportamiento, con filas con la forma real de producción ────────────────

const base = { importe: '70.00', importe_devuelto: '0.00', reembolso_stripe_id: null, reembolso_solicitado_en: null };

test('recibo devuelto POR EL BANCO: es deuda y se puede pagar', () => {
  // `rec-6` en producción: cobrado el 10-jul, devuelto el 12-jul, sin un euro
  // de vuelta a la socia. Deuda de verdad.
  const r = { ...base, estado: 'DEVUELTO', importe: '36.00', importe_devuelto: '0.00' };
  assert.equal(esReciboCobrable(r), true);
  assert.equal(esReciboImpagado(r), true);
});

test('recibo REEMBOLSADO íntegro: ni bloquea ni se le vuelve a cobrar', () => {
  // `rec-web-a1ePvXflC7jvEEm5B6esEc7z`: 1,00 € cobrados y 1,00 € devueltos.
  // Este es el que tenía a una socia real bloqueada desde el 5 de septiembre.
  const r = { ...base, estado: 'DEVUELTO', importe: '1.00', importe_devuelto: '1.00' };
  assert.equal(esReciboCobrable(r), false);
  assert.equal(esReciboImpagado(r), false);
});

test('reembolso pedido a Stripe pero aún sin cuadrar: tampoco bloquea', () => {
  const r = { ...base, estado: 'DEVUELTO', reembolso_solicitado_en: '2026-09-07T10:00:00Z' };
  assert.equal(esReciboImpagado(r), false);
});

test('reembolso PARCIAL: sigue debiendo el resto', () => {
  const r = { ...base, estado: 'FALLIDO', importe: '70.00', importe_devuelto: '20.00' };
  assert.equal(esReciboImpagado(r), true);
});

test('PENDIENTE se cobra pero NO cuenta como impago (puede estar en plazo)', () => {
  const r = { ...base, estado: 'PENDIENTE' };
  assert.equal(esReciboCobrable(r), true);
  assert.equal(esReciboImpagado(r), false);
});

test('COBRADO y EN_CURSO no se vuelven a cobrar', () => {
  // EN_CURSO fuera a propósito: hay un cobro en vuelo y abrir un segundo
  // checkout sobre él es la puerta al doble cobro (migr 20260817214500).
  assert.equal(esReciboCobrable({ ...base, estado: 'COBRADO' }), false);
  assert.equal(esReciboCobrable({ ...base, estado: 'EN_CURSO' }), false);
});
