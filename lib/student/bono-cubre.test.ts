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

// ⚠️ ESTA REGLA CAMBIÓ DOS VECES, y conviene saber por qué.
//
// 1) Antes la app prefería el bono ACOTADO y el servidor ordenaba solo por caducidad: con un
//    general que caducaba antes, el servidor descontaba el general y la app había anunciado el
//    acotado. Se alineó la app con quien mueve el dinero.
// 2) El 2-oct-2026 producto decidió que de verdad hay que «gastar antes el acotado» (el comodín
//    se guarda para lo que el acotado no cubre). Se llevó a `elegirBono` y a
//    `elegir_bono_consumible` (SQL, migr 20261002150000) y la app lo hereda: hay UNA regla.
test('con dos bonos que sirven, manda el ACOTADO aunque el general caduque antes', () => {
  const soloMat = bono({ id: 'b-mat', tiposClaseIds: ['tc-mat'], expiraEn: '2026-12-31' });
  const general = bono({ id: 'b-gen', expiraEn: '2026-09-08' });
  assert.equal(bonoParaClase([general, soloMat], 'tc-mat'), soloMat);
  // En una clase que el acotado no cubre, solo vale el general.
  assert.equal(bonoParaClase([general, soloMat], 'tc-reformer'), general);
});

test('entre bonos igual de específicos manda la caducidad, y después el id', () => {
  const a = bono({ id: 'b-a', tiposClaseIds: ['tc-mat'], expiraEn: '2026-12-31' });
  const b = bono({ id: 'b-b', tiposClaseIds: ['tc-mat', 'tc-reformer'], expiraEn: '2026-09-08' });
  assert.equal(bonoParaClase([a, b], 'tc-mat'), b);
  const c = bono({ id: 'b-c', expiraEn: '2026-10-01' });
  const d = bono({ id: 'b-d', expiraEn: '2026-10-01' });
  assert.equal(bonoParaClase([d, c], 'tc-mat'), c);
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

test('la app elige el mismo bono que el servidor: el acotado primero; entre iguales, el que caduca antes', () => {
  const bonos = [
    { id: 'b-acotado', estado: 'activo', creditosUsados: 0, creditosTotales: 10,
      tiposClaseIds: ['tc-1'], expiraEn: '2026-12-31' },
    { id: 'b-general', estado: 'activo', creditosUsados: 0, creditosTotales: 10,
      expiraEn: '2026-09-08' },
  ];
  assert.equal(bonoParaClase(bonos, 'tc-1')?.id, 'b-acotado',
    'El servidor gasta primero el acotado (elegir_bono_consumible); la app tiene que decir lo mismo.');
  const generales = [
    { id: 'b-tarde', estado: 'activo', creditosUsados: 0, creditosTotales: 10, expiraEn: '2026-12-31' },
    { id: 'b-pronto', estado: 'activo', creditosUsados: 0, creditosTotales: 10, expiraEn: '2026-09-08' },
  ];
  assert.equal(bonoParaClase(generales, 'tc-1')?.id, 'b-pronto');
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

// Estructural: si alguien cambia el orden en el servidor (TypeScript o SQL), esto avisa de que hay
// que cambiarlo también aquí. Las reglas no pueden vivir separadas en silencio — es exactamente
// cómo divergieron.
test('el comparador es copia del que usa el servidor, en TypeScript y en SQL', () => {
  const raiz = join(import.meta.dirname, '..', '..');
  const servidor = readFileSync(join(raiz, 'lib/bono-logic.ts'), 'utf8');
  assert.match(servidor, /'9999-12-31'/,
    'El servidor ordena con el centinela 9999-12-31; si cambia, hay que replicarlo en bono-cubre.ts.');
  assert.match(servidor, /fa !== fb \? \(fa < fb \? -1 : 1\)/,
    'El orden del servidor cambió: revisa compararPorElegibilidad en lib/student/bono-cubre.ts.');
  assert.match(servidor, /\(planDe\(s\)\?\.tiposClaseIds\?\.length \?\? 0\) > 0 \? 0 : 1/,
    'La especificidad del servidor cambió: revisa compararPorElegibilidad en lib/student/bono-cubre.ts.');
  const sql = readFileSync(join(raiz, 'supabase/migrations/20261002150000_reglas_derechos_noshow_y_especificidad.sql'), 'utf8');
  const orden = sql.slice(sql.indexOf('order by case when exists ('));
  assert.ok(orden.indexOf('plan_tipos_clase') < orden.indexOf("coalesce(s.fecha_fin, '9999-12-31'::date)"),
    'En SQL el bono acotado tiene que ir ANTES que la caducidad, como en TypeScript.');
  assert.ok(orden.indexOf("coalesce(s.fecha_fin, '9999-12-31'::date)") < orden.indexOf('s.id collate "C"'));
});
