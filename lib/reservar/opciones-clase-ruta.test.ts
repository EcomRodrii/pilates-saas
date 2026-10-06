import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// P06 · Fase A: contrato de POST /api/public/opciones-clase, leyendo el fuente.
// Es SOLO LECTURA (no crea ni cobra nada), pero decide qué se le ofrece pagar, así
// que mira lo mismo que el cobro y en el mismo orden.

const raiz = join(import.meta.dirname, '..', '..');
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const f = sinComentarios(readFileSync(join(raiz, 'app/api/public/opciones-clase/route.ts'), 'utf8'));
const pos = (s: string) => {
  const i = f.indexOf(s);
  assert.ok(i >= 0, `falta «${s}»`);
  return i;
};

test('límite por IP primero, luego la sesión (con su segundo paso) y la socia de ESE estudio, luego su límite', () => {
  assert.ok(pos("enforceRateLimit(req, 'opciones-clase'") < pos('usuarioSupabaseConPaso(req)'));
  assert.ok(pos('usuarioSupabaseConPaso(req)') < pos("r.paso === 'doble_factor'"));
  assert.ok(pos("r.paso === 'doble_factor'") < pos('socioAutenticado(r.usuario.userId, studioId)'));
  assert.ok(pos('socioAutenticado(r.usuario.userId, studioId)') < pos('`opciones-clase-socia:${socioId}`'));
  assert.ok(pos('`opciones-clase-socia:${socioId}`') < pos('paginaCerradaParaPeticion(req, studioId)'));
  assert.doesNotMatch(f, /body\.socioId/, 'la socia sale del token, nunca del cuerpo');
});

test('lo que el cobro mira, aquí también: modo de Stripe, suscripción del estudio, preguntas, ventana y plaza', () => {
  for (const s of ['comprobarModoStripe()', 'bloqueoPorSuscripcion(studioId)', "bloqueoPorPreguntasAlta(studioId, socioId, 'comprar')",
    'comprobarVentanaReserva(admin', 'comprobarPlazaAntesDeCobrar(admin', 'opcionesDeClase(']) pos(s);
  // Un pago suyo ya cobrado de esta clase se confirma; no se le ofrece pagar otra vez.
  assert.ok(pos(".eq('estado', 'PAGADO')") < pos('comprobarPlazaAntesDeCobrar(admin'));
});

test('sin plaza o sin pagos online, ninguna opción de pago', () => {
  assert.match(f, /opciones: plaza\.ok && pagosOnline \? opciones : \[\]/);
});

test('solo lectura: ni Stripe, ni escrituras', () => {
  assert.doesNotMatch(f, /new Stripe\(|stripe\./);
  assert.doesNotMatch(f, /\.(insert|update|upsert|delete)\(/);
  assert.doesNotMatch(f, /\.rpc\(/);
});
