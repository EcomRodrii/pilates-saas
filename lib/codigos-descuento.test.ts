import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  generarCodigoReactivacion, sufijoCodigo, calcularDescuento,
  validarCodigoCanjeable, buscarCodigo, esCodigoReactivacion, PREFIJO_CODIGO_REACTIVACION,
  utilizacionCodigos, caducidadCodigoReactivacion, DIAS_VIGENCIA_CODIGO_REACTIVACION,
} from './codigos-descuento.ts';
import type { CodigoDescuento } from './types.ts';

function cod(over: Partial<CodigoDescuento> = {}): CodigoDescuento {
  return {
    id: 'c1', studioId: 's1', codigo: 'VUELVE-A3F2', descripcion: 'Reactivación',
    tipo: 'PORCENTAJE', valor: 15, usos: 0, usosMax: 1, expira: '2026-12-31',
    activo: true, creadoEn: '2026-07-20T00:00:00Z', minImporte: null, soloNuevas: false,
    ...over,
  };
}
const HOY = '2026-07-20T10:00:00Z';

test('generarCodigoReactivacion es determinista (misma semilla → mismo código)', () => {
  const a = generarCodigoReactivacion('rec-123');
  const b = generarCodigoReactivacion('rec-123');
  assert.equal(a, b);
  assert.match(a, /^VUELVE-[A-Z2-9]{4}$/);
});

test('semillas distintas dan códigos distintos', () => {
  assert.notEqual(generarCodigoReactivacion('rec-1'), generarCodigoReactivacion('rec-2'));
});

test('el sufijo no usa caracteres ambiguos (O, 0, I, 1)', () => {
  for (const semilla of ['a', 'b', 'rec-xyz', 'zzz', '12345', 'ñ']) {
    assert.doesNotMatch(sufijoCodigo(semilla, 8), /[O0I1]/);
  }
});

test('calcularDescuento: porcentaje e importe fijo, nunca supera el subtotal', () => {
  assert.equal(calcularDescuento(cod({ tipo: 'PORCENTAJE', valor: 15 }), 100), 15);
  assert.equal(calcularDescuento(cod({ tipo: 'IMPORTE_FIJO', valor: 20 }), 100), 20);
  // Un fijo mayor que el ticket no puede dejar el total en negativo.
  assert.equal(calcularDescuento(cod({ tipo: 'IMPORTE_FIJO', valor: 200 }), 50), 50);
});

test('canje válido devuelve el descuento', () => {
  const r = validarCodigoCanjeable(cod(), { hoyISO: HOY, subtotal: 80 });
  assert.deepEqual(r, { ok: true, descuento: 12 }); // 15% de 80
});

test('rechaza código inexistente', () => {
  assert.deepEqual(validarCodigoCanjeable(null, { hoyISO: HOY, subtotal: 50 }), { ok: false, motivo: 'Ese código no existe' });
});

test('rechaza desactivado, caducado y agotado', () => {
  assert.equal(validarCodigoCanjeable(cod({ activo: false }), { hoyISO: HOY, subtotal: 50 }).ok, false);
  assert.equal(validarCodigoCanjeable(cod({ expira: '2026-07-19' }), { hoyISO: HOY, subtotal: 50 }).ok, false);
  assert.equal(validarCodigoCanjeable(cod({ usos: 1, usosMax: 1 }), { hoyISO: HOY, subtotal: 50 }).ok, false);
});

test('caduca el día siguiente, no el mismo día', () => {
  // expira hoy → todavía vale
  assert.equal(validarCodigoCanjeable(cod({ expira: '2026-07-20' }), { hoyISO: HOY, subtotal: 50 }).ok, true);
});

test('respeta el importe mínimo', () => {
  const r = validarCodigoCanjeable(cod({ minImporte: 60 }), { hoyISO: HOY, subtotal: 50 });
  assert.equal(r.ok, false);
  assert.match((r as { motivo: string }).motivo, /mínimo de 60/);
});

test('sin usosMax se puede canjear siempre', () => {
  assert.equal(validarCodigoCanjeable(cod({ usosMax: null, usos: 99 }), { hoyISO: HOY, subtotal: 50 }).ok, true);
});

// ── P-5 (auditoría 26ª pasada): una vez por socia, aunque no haya usosMax ───

test('P-5: yaUsadoPorEstaSocia rechaza incluso SIN usosMax', () => {
  const r = validarCodigoCanjeable(cod({ usosMax: null, usos: 0 }), {
    hoyISO: HOY, subtotal: 50, yaUsadoPorEstaSocia: true,
  });
  assert.equal(r.ok, false);
  assert.match((r as { motivo: string }).motivo, /ya has usado/i);
});

test('P-5: sin marcar yaUsadoPorEstaSocia, se comporta como siempre', () => {
  assert.equal(validarCodigoCanjeable(cod(), { hoyISO: HOY, subtotal: 50 }).ok, true);
  assert.equal(validarCodigoCanjeable(cod(), { hoyISO: HOY, subtotal: 50, yaUsadoPorEstaSocia: false }).ok, true);
});

test('buscarCodigo ignora mayúsculas y espacios', () => {
  const lista = [cod({ codigo: 'VUELVE-A3F2' })];
  assert.ok(buscarCodigo(lista, '  vuelve-a3f2 '));
  assert.equal(buscarCodigo(lista, 'OTRO'), null);
  assert.equal(buscarCodigo(lista, '   '), null);
});

test('esCodigoReactivacion distingue los del Decision OS de los creados a mano', () => {
  assert.equal(esCodigoReactivacion(cod({ codigo: 'VUELVE-A3F2' })), true);
  assert.equal(esCodigoReactivacion(cod({ codigo: '  vuelve-a3f2 ' })), true); // tolera caja y espacios
  assert.equal(esCodigoReactivacion(cod({ codigo: 'VERANO25' })), false);
  assert.equal(esCodigoReactivacion(cod({ codigo: 'BIENVENIDA' })), false);
});

test('generarCodigoReactivacion siempre lleva el prefijo reconocible', () => {
  const c = generarCodigoReactivacion('rec-abc');
  assert.ok(c.startsWith(PREFIJO_CODIGO_REACTIVACION));
  assert.equal(esCodigoReactivacion({ codigo: c }), true);
});

// ── Utilización de códigos con límite ───────────────────────────────────────

test('⚠️ pondera: no es la media de los porcentajes de cada código', () => {
  // El bug que motivó la función. Sin ponderar, un 1/1 y un 5/1000 daban
  // «50 %». Ponderado son 6 usos de 1001 emitidos: 1 %.
  const r = utilizacionCodigos([
    { usos: 1, usosMax: 1 },
    { usos: 5, usosMax: 1000 },
  ]);
  assert.equal(r.pct, 1);
  assert.equal(r.usos, 6);
  assert.equal(r.limite, 1001);
});

test('⚠️ sin códigos con límite devuelve null, NUNCA 0', () => {
  // Un 0 % se lee como «los emitiste y no los usó nadie» — una afirmación
  // sobre el negocio. La verdad es que no hay nada que medir.
  assert.equal(utilizacionCodigos([]).pct, null);
  assert.equal(utilizacionCodigos([{ usos: 12, usosMax: null }]).pct, null);
  assert.equal(utilizacionCodigos([{ usos: 3, usosMax: 0 }]).pct, null);
});

test('los códigos SIN límite no cuentan, ni arriba ni abajo', () => {
  // Un código ilimitado no tiene capacidad que gastar: meterlo hundiría el
  // porcentaje sin que nada haya ido peor.
  const r = utilizacionCodigos([
    { usos: 5, usosMax: 10 },
    { usos: 900, usosMax: null },
  ]);
  assert.equal(r.pct, 50);
  assert.equal(r.codigos, 1);
});

test('un código pasado de su tope no infla el total de los demás', () => {
  // Puede pasar por una carrera al validar o por bajar el tope después de
  // emitirlo. Se acota cada uno a lo suyo antes de sumar.
  const r = utilizacionCodigos([
    { usos: 50, usosMax: 10 },
    { usos: 0, usosMax: 90 },
  ]);
  assert.equal(r.usos, 10);
  assert.equal(r.pct, 10);
});

test('todo gastado es 100, y nada gastado es 0 — con límite SÍ es un 0 real', () => {
  assert.equal(utilizacionCodigos([{ usos: 10, usosMax: 10 }]).pct, 100);
  // Aquí el 0 sí significa algo: hay 10 emitidos y no se ha usado ninguno.
  assert.equal(utilizacionCodigos([{ usos: 0, usosMax: 10 }]).pct, 0);
});

// ── Caducidad del código de reactivación: 30 días del ESTUDIO ───────────────
// Con `Date.now() + 30 días` en UTC, uno creado entre las 00:00 y las 02:00 de Madrid
// caducaba un día antes de lo prometido. (Se corre también con TZ=UTC.)

test('creado a las 00:30 de Madrid del 17-nov, caduca el 17-dic (en UTC salía el 16)', () => {
  const ahora = new Date('2026-11-16T23:30:00Z'); // invierno, +01:00
  assert.equal(DIAS_VIGENCIA_CODIGO_REACTIVACION, 30);
  assert.equal(caducidadCodigoReactivacion(ahora), '2026-12-17');
  assert.equal(new Date(ahora.getTime() + 30 * 86_400_000).toISOString().slice(0, 10), '2026-12-16', 'lo de antes');
});

test('en verano la franja es de dos horas: a las 01:30 de Madrid ya cuenta el día nuevo', () => {
  assert.equal(caducidadCodigoReactivacion(new Date('2026-07-15T23:30:00Z')), '2026-08-15');
  assert.equal(caducidadCodigoReactivacion(new Date('2026-07-15T21:59:00Z')), '2026-08-14', 'a las 23:59 aún es el 15');
});

test('cruzar el cambio de hora no le quita ni le da un día', () => {
  // 00:30 del 25-oct-2026 en Madrid (aún +02:00; a las 03:00 pasa a +01:00).
  assert.equal(caducidadCodigoReactivacion(new Date('2026-10-24T22:30:00Z')), '2026-11-24');
});

test('el día en que caduca todavía se canjea; el siguiente, no', () => {
  const expira = caducidadCodigoReactivacion(new Date('2026-11-16T23:30:00Z'));
  const c = cod({ expira });
  assert.equal(validarCodigoCanjeable(c, { hoyISO: '2026-12-17', subtotal: 50 }).ok, true);
  assert.equal(validarCodigoCanjeable(c, { hoyISO: '2026-12-18', subtotal: 50 }).ok, false);
});

// ── Canje: el día que cuenta es el del ESTUDIO ──────────────────────────────
// El TPV y los tres checkouts pasan `new Date().toISOString()`. Con `.slice(0, 10)`
// salía el día UTC: entre las 00:00 y las 02:00 de Madrid un código caducado ayer
// se seguía canjeando. (Se corre también con TZ=UTC.)

test('a las 00:30 de Madrid (23:30Z del día antes), un código que caducó ayer ya no se canjea', () => {
  const ahora = '2026-11-16T23:30:00.000Z'; // 00:30 del 17 en Madrid (+01:00)
  const r = validarCodigoCanjeable(cod({ expira: '2026-11-16' }), { hoyISO: ahora, subtotal: 50 });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.motivo, 'Ese código ya ha caducado');
  assert.equal(validarCodigoCanjeable(cod({ expira: '2026-11-17' }), { hoyISO: ahora, subtotal: 50 }).ok, true, 'el que caduca hoy, sí');
});

test('en verano el corte es a las 22:00 UTC', () => {
  const c = cod({ expira: '2026-07-15' });
  assert.equal(validarCodigoCanjeable(c, { hoyISO: '2026-07-15T21:59:00.000Z', subtotal: 50 }).ok, true, '23:59 del 15');
  assert.equal(validarCodigoCanjeable(c, { hoyISO: '2026-07-15T22:00:00.000Z', subtotal: 50 }).ok, false, '00:00 del 16');
});

test('si ya llega el día, se usa tal cual (no se corre a otro día)', () => {
  const c = cod({ expira: '2026-11-16' });
  assert.equal(validarCodigoCanjeable(c, { hoyISO: '2026-11-16', subtotal: 50 }).ok, true);
  assert.equal(validarCodigoCanjeable(c, { hoyISO: '2026-11-17', subtotal: 50 }).ok, false);
});

