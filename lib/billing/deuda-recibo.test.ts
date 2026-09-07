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

/** La migración VIGENTE de `socio_tiene_impago`: la de versión más alta. */
function sqlVigenteDeImpago(): string {
  const dir = join(import.meta.dirname, '..', '..', 'supabase', 'migrations');
  const ficheros = readdirSync(dir)
    .filter(f => f.endsWith('.sql'))
    .sort()
    .filter(f => /create or replace function public\.socio_tiene_impago/.test(readFileSync(join(dir, f), 'utf8')));
  assert.ok(ficheros.length > 0, 'no se encuentra ninguna migración que defina socio_tiene_impago');
  return readFileSync(join(dir, ficheros[ficheros.length - 1]), 'utf8');
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
  const sql = sqlVigenteDeImpago();
  // No se compara el texto: se comprueba que las tres señales de «el dinero va
  // de vuelta» que usa el TS están de verdad en el SQL.
  for (const senal of ['importe_devuelto', 'reembolso_stripe_id', 'reembolso_solicitado_en']) {
    assert.match(sql, new RegExp(senal), `el SQL ya no mira \`${senal}\`: las dos mitades han divergido`);
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
