import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bonoParaClase, cubreTipo, tieneBonoQueNoCubre } from './bono-cubre.ts';

const bono = (o: Partial<Parameters<typeof cubreTipo>[0]> = {}) => ({ estado: 'activo', creditosUsados: 0, creditosTotales: 10, ...o });

test('sin tipos declarados, el bono vale para cualquier clase', () => {
  assert.equal(cubreTipo(bono(), 'tc-reformer'), true);
  assert.equal(cubreTipo(bono({ tiposClaseIds: [] }), 'tc-reformer'), true);
});

test('acotado a Mat NO cubre un Reformer', () => {
  assert.equal(cubreTipo(bono({ tiposClaseIds: ['tc-mat'] }), 'tc-reformer'), false);
  assert.equal(cubreTipo(bono({ tiposClaseIds: ['tc-mat'] }), 'tc-mat'), true);
});

test('elige el bono que cubre, no el primero con saldo', () => {
  const soloMat = bono({ tiposClaseIds: ['tc-mat'] });
  const general = bono({ creditosUsados: 2 });
  // El de Mat va primero en la lista, pero la clase es Reformer.
  assert.equal(bonoParaClase([soloMat, general], 'tc-reformer'), general);
});

// ⚠️ ESTE TEST CAMBIÓ DE SIGNO, y conviene saber por qué.
//
// Antes fijaba que la app prefiriera el bono ACOTADO cuando los dos servían
// («no gastar el general en balde»). Es buena idea de producto — pero el
// SERVIDOR no la aplica: `elegirBono` (lib/bono-logic.ts) ordena solo por
// caducidad. Con un general que caduca antes, el servidor descontaba el general
// y la app había anunciado el acotado.
//
// Se alinea la app con quien mueve el dinero, no al revés: cambiar el orden de
// consumo del servidor es una decisión de producto con consecuencias
// económicas, y no se toma desde la capa de presentación.
//
// PENDIENTE DE PRODUCTO: si se quiere de verdad «gastar antes el acotado», hay
// que llevarlo a `elegirBono` y que la app lo herede — no reintroducirlo aquí.
test('con la MISMA caducidad da igual acotado o general: manda el desempate por id', () => {
  const soloMat = bono({ id: 'b-1', tiposClaseIds: ['tc-mat'], expiraEn: '2026-10-01' });
  const general = bono({ id: 'b-2', expiraEn: '2026-10-01' });
  assert.equal(bonoParaClase([general, soloMat], 'tc-mat'), soloMat);
});

test('si el GENERAL caduca antes, se elige el general — como hace el servidor', () => {
  const soloMat = bono({ id: 'b-mat', tiposClaseIds: ['tc-mat'], expiraEn: '2026-12-31' });
  const general = bono({ id: 'b-gen', expiraEn: '2026-09-08' });
  assert.equal(bonoParaClase([soloMat, general], 'tc-mat'), general);
});

test('sin bono que cubra, null — aunque tenga otros bonos', () => {
  assert.equal(bonoParaClase([bono({ tiposClaseIds: ['tc-mat'] })], 'tc-reformer'), null);
});

test('un bono agotado o caducado no cuenta; el ilimitado (totales 0) sí', () => {
  assert.equal(bonoParaClase([bono({ creditosUsados: 10, creditosTotales: 10 })], 'tc-x'), null);
  assert.equal(bonoParaClase([bono({ estado: 'caducado' })], 'tc-x'), null);
  assert.ok(bonoParaClase([bono({ creditosTotales: 0, creditosUsados: 99 })], 'tc-x'));
});

test('«tienes bono pero no vale aquí» se distingue de «no tienes bono»', () => {
  assert.equal(tieneBonoQueNoCubre([bono({ tiposClaseIds: ['tc-mat'] })], 'tc-reformer'), true);
  assert.equal(tieneBonoQueNoCubre([], 'tc-reformer'), false, 'sin bonos no es «no cubre»');
  assert.equal(tieneBonoQueNoCubre([bono()], 'tc-reformer'), false, 'con bono general sí cubre');
});

// ── Paridad con el servidor ───────────────────────────────────────────────────
// El bug: `bonoParaClase` prefería el bono ACOTADO y el servidor ordena por
// CADUCIDAD. Con un general que caduca mañana y un acotado que caduca el mes que
// viene, el servidor gastaba el general y la app enseñaba el acotado.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test('la app elige el mismo bono que el servidor: el que caduca antes', () => {
  const bonos = [
    { id: 'b-acotado', estado: 'activo', creditosUsados: 0, creditosTotales: 10,
      tiposClaseIds: ['tc-1'], expiraEn: '2026-12-31' },
    { id: 'b-general', estado: 'activo', creditosUsados: 0, creditosTotales: 10,
      expiraEn: '2026-09-08' },
  ];
  assert.equal(bonoParaClase(bonos, 'tc-1')?.id, 'b-general',
    'El servidor gasta el que caduca antes; la app tiene que decir lo mismo.');
});

test('sin caducidad va al final, como en el servidor', () => {
  const bonos = [
    { id: 'b-sin-fecha', estado: 'activo', creditosUsados: 0, creditosTotales: 5, expiraEn: null },
    { id: 'b-con-fecha', estado: 'activo', creditosUsados: 0, creditosTotales: 5, expiraEn: '2027-01-31' },
  ];
  assert.equal(bonoParaClase(bonos, null)?.id, 'b-con-fecha');
});

test('misma caducidad: desempate por id, igual que el servidor', () => {
  const bonos = [
    { id: 'b-zzz', estado: 'activo', creditosUsados: 0, creditosTotales: 5, expiraEn: '2026-10-01' },
    { id: 'b-aaa', estado: 'activo', creditosUsados: 0, creditosTotales: 5, expiraEn: '2026-10-01' },
  ];
  assert.equal(bonoParaClase(bonos, null)?.id, 'b-aaa');
});

// Estructural: si alguien cambia el orden en el servidor, esto avisa de que hay
// que cambiarlo también aquí. Las dos reglas no pueden vivir separadas en
// silencio — es exactamente cómo divergieron.
test('el comparador es copia literal del que usa el servidor', () => {
  const raiz = join(import.meta.dirname, '..', '..');
  const servidor = readFileSync(join(raiz, 'lib/bono-logic.ts'), 'utf8');
  assert.match(servidor, /'9999-12-31'/,
    'El servidor ordena con el centinela 9999-12-31; si cambia, hay que replicarlo en bono-cubre.ts.');
  assert.match(servidor, /fa !== fb \? \(fa < fb \? -1 : 1\)/,
    'El orden del servidor cambió: revisa compararPorCaducidad en lib/student/bono-cubre.ts.');
});
