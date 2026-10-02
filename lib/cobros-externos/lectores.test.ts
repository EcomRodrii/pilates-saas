import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extracto, cabecera, movimiento, FIN } from './fixtures/norma43.ts';
import { decodificarExtracto, esNorma43, leerNorma43 } from './norma43.ts';
import { detectarFormato, leerFicheroNorma43 } from './lectores.ts';
import { clasificarAbono, pagadorDe } from './clasificar.ts';
import { huellaDeLote } from './idempotencia.ts';
import { coincidenciaNombre, conceptoGuardable, sinNumerosDeTarjeta } from './texto.ts';
import { importeACentimos, leerTabla, sugerirColumnas, ultimos4De, validarColumnas } from './tabla.ts';

// Todo lo de aquí es INVENTADO: cuentas, nombres y conceptos ficticios.

const DOS_DIAS = extracto({
  desde: '260929', hasta: '260930',
  movs: [
    { fechaOp: '260929', abono: true, centimos: 5900, comun: '04', conceptos: ['TRANSFERENCIA DE MARIA GARCIA LOPEZ', 'CONCEPTO CUOTA OCTUBRE'] },
    { fechaOp: '260929', abono: false, centimos: 12000, comun: '03', conceptos: ['RECIBO LUZ'] },
    { fechaOp: '260930', abono: true, centimos: 4500, comun: '99', conceptos: ['BIZUM DE LAURA PEREZ RUIZ CONCEPTO BONO'] },
    { fechaOp: '260930', abono: true, centimos: 41200, comun: '12', conceptos: ['LIQ. TPV 01/10'] },
    { fechaOp: '260930', abono: true, centimos: 38000, comun: '04', conceptos: ['STRIPE PAYMENTS EUROPE LTD'] },
  ],
});

// ── Norma 43 ─────────────────────────────────────────────────────────────────

test('Norma 43: lee dos días, con conceptos complementarios, y cuenta los cargos sin guardarlos', () => {
  assert.equal(esNorma43(DOS_DIAS), true);
  assert.equal(detectarFormato(DOS_DIAS), 'norma43');
  const r = leerFicheroNorma43(DOS_DIAS);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.lectura.movimientos.length, 4, 'solo los abonos');
  assert.equal(r.lectura.cargos, 1);
  assert.equal(r.lectura.cuentaFinal, '1234', 'solo los 4 últimos dígitos');
  assert.equal(r.lectura.periodoDesde, '2026-09-29');
  const [transf, bizum, tpv, stripe] = r.lectura.movimientos;
  assert.deepEqual([transf.tipo, transf.metodo, transf.importeCentimos, transf.fechaOperacion], ['COBRO', 'TRANSFERENCIA', 5900, '2026-09-29']);
  assert.equal(transf.concepto, 'TRANSFERENCIA DE MARIA GARCIA LOPEZ CONCEPTO CUOTA OCTUBRE');
  assert.equal(transf.pagadorNombre, 'maria garcia lopez');
  assert.deepEqual([bizum.tipo, bizum.metodo, bizum.pagadorNombre], ['COBRO', 'BIZUM', 'laura perez ruiz']);
  assert.deepEqual([tpv.tipo, tpv.metodo], ['LIQUIDACION', 'TARJETA'], 'el abono del datáfono es del día entero');
  assert.equal(stripe.tipo, 'NO_ALUMNA', 'el pago de Stripe al estudio no es de una alumna');
  assert.equal(stripe.pagadorNombre, null);
});

test('Norma 43: si el total del registro 33 no cuadra, el fichero se rechaza entero', () => {
  const malo = extracto({ desde: '260929', hasta: '260930', trucarHaber: 100, movs: [{ fechaOp: '260929', abono: true, centimos: 5900 }] });
  const r = leerFicheroNorma43(malo);
  assert.equal(r.ok, false);
  assert.ok(!r.ok && r.errores.some(e => e.codigo === 'TOTALES_NO_CUADRAN'));
});

test('Norma 43: cortado (sin cierre ni fin) → rechazado', () => {
  const cortado = [cabecera({ desde: '260929', hasta: '260930' }), movimiento({ fechaOp: '260929', abono: true, centimos: 5900 })].join('\n');
  const r = leerNorma43(cortado);
  assert.equal(r.ok, false);
  assert.deepEqual(r.movimientos, []);
});

test('Norma 43: sin saltos de línea (bloques de 80) y con espacios finales recortados', () => {
  const movs = [{ fechaOp: '260929', abono: true, centimos: 5900, conceptos: ['BIZUM DE ANA RUIZ SOTO'] }];
  const continuo = extracto({ desde: '260929', hasta: '260929', movs, separador: '' });
  assert.equal(leerFicheroNorma43(continuo).ok, true);
  const recortado = extracto({ desde: '260929', hasta: '260929', movs }).split('\r\n').map(l => l.trimEnd()).join('\n');
  const r = leerFicheroNorma43(recortado);
  assert.ok(r.ok && r.lectura.movimientos.length === 1);
});

test('Norma 43: una fecha imposible no se cuela', () => {
  const f = [cabecera({ desde: '260201', hasta: '260228' }), movimiento({ fechaOp: '260231', abono: true, centimos: 100 }), FIN].join('\n');
  const r = leerNorma43(f);
  assert.ok(r.errores.some(e => e.codigo === 'MOVIMIENTO_ILEGIBLE'));
});

test('Latin-1: las tildes y las Ñ de los conceptos se leen bien', () => {
  const bytes = new Uint8Array([0x4e, 0xd3, 0x4d, 0x49, 0x4e, 0x41, 0x20, 0xd1]); // «NÓMINA Ñ» en Latin-1
  assert.equal(decodificarExtracto(bytes), 'NÓMINA Ñ');
  assert.equal(decodificarExtracto(new TextEncoder().encode('Peña')), 'Peña');
});

// ── Clasificación ────────────────────────────────────────────────────────────

test('clasificar: lo dudoso se queda como COBRO (esconder un pago es peor que descartarlo)', () => {
  assert.equal(clasificarAbono({ texto: 'ABONO VARIOS 123' }).tipo, 'COBRO');
  assert.equal(clasificarAbono({ texto: 'INGRESO EN EFECTIVO' }).tipo, 'NO_ALUMNA');
  assert.equal(clasificarAbono({ conceptoComun: '17', texto: 'LIQUIDACION' }).tipo, 'NO_ALUMNA');
  assert.equal(clasificarAbono({ texto: 'Traspaso de LOPEZ' }).metodo, 'TRANSFERENCIA');
  assert.equal(pagadorDe('Transferencia de JUAN'), null, 'un solo nombre no basta para decir quién paga');
});

// ── Privacidad ───────────────────────────────────────────────────────────────

test('un número de tarjeta completo en un concepto se queda en sus 4 últimos dígitos', () => {
  assert.equal(sinNumerosDeTarjeta('PAGO 4548 8100 1234 5678 OK'), 'PAGO ···5678 OK');
  assert.equal(sinNumerosDeTarjeta('PAGO 4548810012345678'), 'PAGO ···5678');
  assert.equal(sinNumerosDeTarjeta('REF 20260929'), 'REF 20260929', 'una fecha no es una tarjeta');
  assert.equal(conceptoGuardable('x'.repeat(300))?.length, 140);
});

test('nombre: sin importar orden ni acentos; el apellido solo no basta si hay segundo', () => {
  assert.equal(coincidenciaNombre('GARCIA LOPEZ MARIA', 'María', 'García López'), 'COMPLETA');
  assert.equal(coincidenciaNombre('transf de garcia lopez', 'María', 'García López'), 'APELLIDO');
  assert.equal(coincidenciaNombre('transf de garcia', 'María', 'García López'), 'NINGUNA');
  assert.equal(coincidenciaNombre('pago de pilar', 'María', 'García López'), 'NINGUNA');
});

// ── CSV / Excel ──────────────────────────────────────────────────────────────

test('importes a la española y a la inglesa', () => {
  assert.equal(importeACentimos('1.234,56'), 123456);
  assert.equal(importeACentimos('59,00 €'), 5900);
  assert.equal(importeACentimos('59.00'), 5900);
  assert.equal(importeACentimos('-59,00'), -5900);
  assert.equal(importeACentimos('(59,00)'), -5900);
  assert.equal(importeACentimos('1,234.56'), 123456);
  assert.equal(importeACentimos('59'), 5900);
  assert.equal(importeACentimos('cincuenta'), null);
  assert.equal(ultimos4De('**** **** **** 1234'), '1234');
});

test('tabla del datáfono (cobro a cobro): fecha, hora, tarjeta; columnas en otro orden y una desconocida', () => {
  const cab = ['Importe', 'Tarjeta', 'Columna rara', 'Fecha operación', 'Hora', 'Nº operación'];
  const filas = [
    ['59,00', 'VISA ****1234', 'x', '01/10/2026', '18:32', 'OP-1'],
    ['-59,00', 'VISA ****1234', 'x', '02/10/2026', '10:00', 'OP-2'],
    ['45,00', '************9876', 'x', '13/10/2026', '09:05:12', 'OP-3'],
  ];
  const sug = sugerirColumnas(cab);
  assert.equal(sug.fecha, 3);
  assert.equal(sug.importe, 0);
  assert.equal(sug.tarjeta, 1);
  const columnas = { fecha: 3, importe: 0, tarjeta: 1, hora: 4, idOperacion: 5 };
  assert.deepEqual(validarColumnas(columnas, cab.length), { ok: true });
  const r = leerTabla({ fuente: 'excel', plantilla: 'p1', filas, columnas });
  assert.equal(r.movimientos.length, 2);
  assert.equal(r.cargos, 1, 'la devolución (importe negativo) es un cargo');
  const [a, b] = r.movimientos;
  assert.deepEqual([a.metodo, a.tipo, a.tarjetaUltimos4, a.tarjetaMarca, a.horaOperacion, a.fechaOperacion], ['TARJETA', 'COBRO', '1234', 'visa', '18:32', '2026-10-01']);
  assert.equal(b.horaOperacion, '09:05');
  assert.equal(b.fechaOperacion, '2026-10-13', 'el 13 obliga a leer día/mes');
});

test('tabla: sin columna de importe → error claro; filas ilegibles → error por línea, sin el contenido', () => {
  assert.equal(validarColumnas({ fecha: 0 }, 3).ok, false);
  assert.equal(validarColumnas({ fecha: 9, importe: 0 }, 3).ok, false);
  const r = leerTabla({ fuente: 'csv', plantilla: 'p', columnas: { fecha: 0, importe: 1 }, filas: [['no es fecha', '1'], ['01/10/2026', 'abc']] });
  assert.deepEqual(r.errores, [{ linea: 2, codigo: 'FECHA_ILEGIBLE' }, { linea: 3, codigo: 'IMPORTE_ILEGIBLE' }]);
});

test('tabla con columna solo de abonos: lo vacío es un cargo, no un error', () => {
  const r = leerTabla({
    fuente: 'csv', plantilla: 'p', columnas: { fecha: 0, abono: 1, concepto: [2] },
    filas: [['2026-10-01', '59,00', 'Bizum de Ana Ruiz'], ['2026-10-01', '', 'Compra']],
  });
  assert.equal(r.movimientos.length, 1);
  assert.equal(r.cargos, 1);
  assert.equal(r.movimientos[0].metodo, 'BIZUM');
});

// ── Idempotencia ─────────────────────────────────────────────────────────────

test('el mismo fichero dos veces: mismas claves y misma huella', () => {
  const a = leerFicheroNorma43(DOS_DIAS);
  const b = leerFicheroNorma43(DOS_DIAS.replace(/\r\n/g, '\n'));
  assert.ok(a.ok && b.ok);
  if (!a.ok || !b.ok) return;
  assert.deepEqual(a.lectura.movimientos.map(m => m.claveIdempotencia), b.lectura.movimientos.map(m => m.claveIdempotencia));
  const huella = (l: typeof a.lectura) => huellaDeLote({ fuente: 'norma43', cuentaFinal: l.cuentaFinal, periodoDesde: l.periodoDesde, periodoHasta: l.periodoHasta, claves: l.movimientos.map(m => m.claveIdempotencia) });
  assert.equal(huella(a.lectura), huella(b.lectura));
});

test('dos cobros idénticos el mismo día entran los dos (#1 y #2), y un fichero que solapa no repite', () => {
  const bizum = { fechaOp: '260929', abono: true, centimos: 4500, comun: '99', conceptos: ['BIZUM DE ANA RUIZ SOTO'] };
  const otro = { fechaOp: '260930', abono: true, centimos: 5900, comun: '04', conceptos: ['TRANSFERENCIA DE PEPA SANZ MORA'] };
  const primero = leerFicheroNorma43(extracto({ desde: '260929', hasta: '260929', movs: [bizum, bizum] }));
  const solapa = leerFicheroNorma43(extracto({ desde: '260929', hasta: '260930', movs: [bizum, bizum, otro] }));
  assert.ok(primero.ok && solapa.ok);
  if (!primero.ok || !solapa.ok) return;
  const c1 = primero.lectura.movimientos.map(m => m.claveIdempotencia);
  const c2 = solapa.lectura.movimientos.map(m => m.claveIdempotencia);
  assert.notEqual(c1[0], c1[1], 'dos pagos, dos claves');
  assert.ok(c1[0].endsWith('#1') && c1[1].endsWith('#2'));
  assert.equal(c2.filter(c => !c1.includes(c)).length, 1, 'del solapado solo entra lo nuevo');
});
