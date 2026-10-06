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

test('sin plaza, ninguna opción; sin pagos online, solo la prueba gratis', () => {
  assert.match(f, /opciones: plaza\.ok \? \[\.\.\.opcionPrueba, \.\.\.\(pagosOnline \? opciones : \[\]\)\] : \[\]/);
  assert.match(f, /\(prueba\.gratis \|\| pagosOnline\)/);
});

test('P07: la prueba sale del mismo dueño que el cobro y solo si cubre el tipo', () => {
  assert.ok(pos('pruebaParaSocia(admin, studioId, socioId)') > pos('comprobarPlazaAntesDeCobrar(admin'));
  pos('pruebaCubreTipo(prueba, tipoClaseId)');
});

test('solo lectura: ni Stripe, ni escrituras', () => {
  assert.doesNotMatch(f, /new Stripe\(|stripe\./);
  assert.doesNotMatch(f, /\.(insert|update|upsert|delete)\(/);
  assert.doesNotMatch(f, /\.rpc\(/);
});

test('P07 · GET /api/public/prueba: límite, sesión con su segundo paso, la socia del token, y solo lectura', () => {
  const g = sinComentarios(readFileSync(join(raiz, 'app/api/public/prueba/route.ts'), 'utf8'));
  const p = (x: string) => {
    const i = g.indexOf(x);
    assert.ok(i >= 0, `falta «${x}»`);
    return i;
  };
  assert.ok(p("enforceRateLimit(req, 'prueba-app'") < p('usuarioSupabaseConPaso(req)'));
  assert.ok(p("r.paso === 'doble_factor'") < p('socioAutenticado(r.usuario.userId, studioId)'));
  assert.ok(p('socioAutenticado(r.usuario.userId, studioId)') < p('pruebaParaSocia(admin, studioId, socioId)'));
  assert.doesNotMatch(g, /\.(insert|update|upsert|delete|rpc)\(/);
  assert.match(g, /catch \{\s*return json\(\{ disponible: false \}\)/, 'fail-closed');
});
