import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { MENSAJE_RESERVA_RPC, mensajeDeErrorReserva } from './errores-rpc.ts';

// ⚠️ El test que de verdad importa es el ESTRUCTURAL de abajo.
//
// Traducir códigos de uno en uno no cierra nada: `dbReservarPlaza` traducía dos
// de catorce y llevaba al lado un comentario diciendo «sin esto, a recepción le
// salía literalmente NECESITA_AUTORIZACION» — o sea que el patrón se conocía y
// aun así los otros doce seguían saliendo crudos. Un test por código nombrado
// habría pasado en verde exactamente igual.
//
// Mismo idioma que lib/student/cadena-rechazo-reserva.test.ts, que cerró esta
// misma familia en el lado de la alumna.

const raiz = join(import.meta.dirname, '..', '..');

test('cada código que lanza la RPC de reservar tiene traducción', () => {
  const dir = join(raiz, 'supabase', 'migrations');
  // La definición viva es la de la migración MÁS RECIENTE que la reescribe.
  const fichero = readdirSync(dir)
    .filter(f => f.endsWith('.sql'))
    .filter(f => readFileSync(join(dir, f), 'utf8').includes('function public.reservar_plaza'))
    .sort().pop();
  assert.ok(fichero, 'no se encontró ninguna migración que defina reservar_plaza');

  const sql = readFileSync(join(dir, fichero!), 'utf8');
  const cuerpo = sql.slice(sql.indexOf('function public.reservar_plaza'));
  const codigos = [...cuerpo.matchAll(/raise exception '([A-Z_]+)'/g)].map(m => m[1]);
  assert.ok(codigos.length >= 10, `esperaba la familia entera, encontré ${codigos.length}`);

  for (const codigo of new Set(codigos)) {
    assert.ok(
      MENSAJE_RESERVA_RPC[codigo],
      `'${codigo}' lo lanza la RPC y no tiene traducción: saldría CRUDO en pantalla `
      + `del mostrador. Añádelo a lib/reservas/errores-rpc.ts.`,
    );
  }
});

test('ninguna traducción deja escapar el código técnico', () => {
  for (const [codigo, texto] of Object.entries(MENSAJE_RESERVA_RPC)) {
    assert.doesNotMatch(texto, /[A-Z]{4,}_[A-Z]/, `El mensaje de '${codigo}' contiene el código.`);
  }
});

test('reconoce el código aunque venga envuelto por Postgres', () => {
  // supabase-js entrega el mensaje con contexto alrededor.
  assert.equal(
    mensajeDeErrorReserva('PL/pgSQL function reservar_plaza(...) line 56 at RAISE: YA_RESERVADA'),
    MENSAJE_RESERVA_RPC.YA_RESERVADA,
  );
});

test('lo que no reconoce devuelve null, no el mensaje crudo', () => {
  assert.equal(mensajeDeErrorReserva('connection reset by peer'), null);
  assert.equal(mensajeDeErrorReserva(null), null);
});
