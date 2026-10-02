import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_LINEAS, estadoHttpDeResultado, parsearColumnas, parsearEstados, parsearPeticionResolver, parsearPeticionTabla,
  plantillaDeCabeceras,
} from './peticiones.ts';

test('resolver: cada acción con lo suyo; nada más viaja a un filtro', () => {
  assert.deepEqual(parsearPeticionResolver({ accion: 'confirmar', movimientoId: 'cex-1', reciboId: 'rec-1' }),
    { ok: true, peticion: { accion: 'confirmar', movimientoId: 'cex-1', reciboId: 'rec-1', avisarSocia: false, aunqueDuplicado: false } });
  assert.equal(parsearPeticionResolver({ accion: 'confirmar', movimientoId: 'cex-1', reciboId: 'rec-1', avisarSocia: 'si' }).ok, false);
  assert.equal(parsearPeticionResolver({ accion: 'descartar', movimientoId: 'cex-1', motivo: 'NO_ES_DE_UNA_ALUMNA' }).ok, true);
  assert.equal(parsearPeticionResolver({ accion: 'descartar', movimientoId: 'cex-1', motivo: 'PORQUE_SI' }).ok, false);
  assert.equal(parsearPeticionResolver({ accion: 'reabrir', movimientoId: 'cex-1' }).ok, true);
  assert.equal(parsearPeticionResolver({ accion: 'borrar', movimientoId: 'cex-1' }).ok, false);
  // Ids con algo que no sea letras, dígitos, guion o guion bajo: fuera.
  assert.equal(parsearPeticionResolver({ accion: 'enlazar', movimientoId: 'cex-1', reciboId: 'rec-1,id.neq.x' }).ok, false);
  assert.equal(parsearPeticionResolver({ accion: 'reabrir', movimientoId: 'cex 1' }).ok, false);
  // Un recibo cuyo `fac-ext-<id>` no cabría en el sellado (64): fuera.
  assert.equal(parsearPeticionResolver({ accion: 'confirmar', movimientoId: 'cex-1', reciboId: 'r'.repeat(57) }).ok, false);
  assert.equal(parsearPeticionResolver({ accion: 'confirmar', movimientoId: 'cex-1', reciboId: 'r'.repeat(56) }).ok, true);
  assert.equal(parsearPeticionResolver(null).ok, false);
});

test('tabla: cabeceras y filas con forma, y un tope de filas', () => {
  const base = { formato: 'excel', cabeceras: ['Fecha', 'Importe'], filas: [['01/10/2026', '59,00']] };
  const ok = parsearPeticionTabla(base);
  assert.ok(ok.ok);
  assert.equal(ok.ok && ok.peticion.columnas, null, 'sin columnas: la ruta propone y el estudio elige');
  assert.equal(parsearPeticionTabla({ ...base, formato: 'pdf' }).ok, false);
  assert.equal(parsearPeticionTabla({ ...base, filas: Array.from({ length: MAX_LINEAS + 1 }, () => ['01/10/2026', '1']) }).ok, false);
  assert.equal(parsearPeticionTabla({ ...base, filas: [['x'.repeat(501)]] }).ok, false);
  assert.equal(parsearPeticionTabla({ ...base, columnas: { fecha: 0, importe: 1 } }).ok, true);
  assert.equal(parsearPeticionTabla({ ...base, columnas: { fecha: -1 } }).ok, false);
});

test('columnas: índices enteros no negativos; el concepto, hasta 5', () => {
  assert.deepEqual(parsearColumnas({ fecha: 0, importe: 2, concepto: [3, 4] }), {
    fecha: 0, importe: 2, abono: null, hora: null, pagador: null, tarjeta: null, referencia: null, idOperacion: null, concepto: [3, 4],
  });
  assert.equal(parsearColumnas({ fecha: 0, importe: 1.5 }), null);
  assert.equal(parsearColumnas({ importe: 1 }), null);
  assert.equal(parsearColumnas({ fecha: 0, concepto: [1, 2, 3, 4, 5, 6] }), null);
});

test('la plantilla sale de las cabeceras: el mismo informe da la misma, se llame como se llame', () => {
  assert.equal(plantillaDeCabeceras(['Fecha', 'Importe']), plantillaDeCabeceras([' fecha ', 'IMPORTE']));
  assert.notEqual(plantillaDeCabeceras(['Fecha', 'Importe']), plantillaDeCabeceras(['Fecha', 'Abono']));
});

test('estados del listado y códigos HTTP', () => {
  assert.deepEqual(parsearEstados(null), ['POR_REVISAR', 'DOBLE_COBRO', 'CONFIRMANDO']);
  assert.deepEqual(parsearEstados('CONFIRMADO,ENLAZADO'), ['CONFIRMADO', 'ENLAZADO']);
  assert.equal(parsearEstados('CONFIRMADO,OTRA_COSA'), null);
  assert.equal(estadoHttpDeResultado('POSIBLE_DUPLICADO'), 409);
  assert.equal(estadoHttpDeResultado('NO_ENCONTRADO'), 404);
  assert.equal(estadoHttpDeResultado('DATOS'), 422);
});
