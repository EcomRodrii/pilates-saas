import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  avisoBono, esBonoDeSesiones, etiquetaPagos, masParaCuota, reservadasConBono, textoCaducidadHeroe, textoPrecioPorClase,
  textoReservadas, textoSirvePara, textoUltimoRecibo, textoVigencia,
} from './bonos-vista.ts';
import { precioPorClaseDe, proyectarBonos, proyectarReservas, type PayloadMin } from './mapeo.ts';
import type { Bono, Pago } from './tipos.ts';
import type { ProductoTienda } from './tienda.ts';

// Sin `@/`: con el alias este test dejaría de ejecutarse sin avisar.

const HOY = '2026-10-07'; // miércoles
const bono = (extra: Partial<Bono> = {}): Bono => ({
  id: 'b1', nombre: 'Bono 8 sesiones', creditosTotales: 8, creditosUsados: 5, compradoEn: '2026-10-01', expiraEn: '2026-10-31',
  estado: 'activo', precio: 96, tipoPlan: 'BONO', sesionesDelPlan: 8, ...extra,
});
const cuota = (extra: Partial<Bono> = {}): Bono => bono({ id: 'q1', nombre: 'Mensual', creditosTotales: Infinity, creditosUsados: 0, tipoPlan: 'MENSUAL', ...extra });

test('esBonoDeSesiones: solo un bono vivo de sesiones, nunca la cuota ni uno caducado', () => {
  assert.equal(esBonoDeSesiones(bono()), true);
  assert.equal(esBonoDeSesiones(cuota()), false);
  assert.equal(esBonoDeSesiones(bono({ estado: 'expirado' })), false);
});

const clase = (id: string, fecha: string, hora: string) => ({ id, fecha, hora, inicio: `${fecha}T${hora}:00+02:00`, fin: `${fecha}T${hora}:50+02:00` });

test('reservadasConBono: solo las confirmadas, de ESTE bono y sin terminar', () => {
  const clases = [clase('c1', '2026-10-08', '10:00'), clase('c2', '2026-10-09', '10:00'), clase('c3', '2026-10-06', '10:00'), clase('c4', '2026-10-10', '10:00')];
  const reservas = [
    { id: 'r1', claseId: 'c1', estado: 'confirmada' as const, bonoId: 'b1' },
    { id: 'r2', claseId: 'c2', estado: 'confirmada' as const, bonoId: 'otro' },
    { id: 'r3', claseId: 'c3', estado: 'confirmada' as const, bonoId: 'b1' }, // ya pasó
    { id: 'r4', claseId: 'c4', estado: 'cancelada' as const, bonoId: 'b1' },
    { id: 'r5', claseId: 'c2', estado: 'confirmada' as const, bonoId: null }, // no se sabe: no se atribuye
  ];
  const r = reservadasConBono(reservas, clases, 'b1', Date.parse('2026-10-07T08:00:00Z'), HOY);
  assert.deepEqual(r.map((c) => c.id), ['c1']);
});

test('textoReservadas: una, dos y más', () => {
  assert.equal(textoReservadas([]), null);
  assert.equal(textoReservadas([{ fecha: '2026-10-08' }]), 'Ya reservada con este bono: jue 8');
  assert.equal(textoReservadas([{ fecha: '2026-10-08' }, { fecha: '2026-10-09' }]), 'Ya reservadas con este bono: jue 8 y vie 9');
  assert.equal(textoReservadas([{ fecha: '2026-10-08' }, { fecha: '2026-10-09' }, { fecha: '2026-10-12' }, { fecha: '2026-10-13' }]), 'Ya reservadas con este bono: jue 8, vie 9 y 2 más');
});

test('textoSirvePara: sin tipos es cualquier clase; con tipos, sus nombres', () => {
  assert.equal(textoSirvePara({ tiposClaseIds: [] }, {}), 'Sirve para cualquier clase');
  assert.equal(textoSirvePara({ tiposClaseIds: ['r', 'm', 'b'] }, { r: 'Reformer', m: 'Mat', b: 'Barre' }), 'Sirve para Reformer, Mat y Barre');
  assert.equal(textoSirvePara({ tiposClaseIds: ['x'] }, {}), 'Sirve para algunas clases');
});

test('textoCaducidadHeroe', () => {
  assert.equal(textoCaducidadHeroe({ expiraEn: '2026-10-31' }, HOY), 'Caduca el 31 oct · en 24 días');
  assert.equal(textoCaducidadHeroe({ expiraEn: HOY }, HOY), 'Caduca hoy');
  assert.equal(textoCaducidadHeroe({ expiraEn: '2026-10-08' }, HOY), 'Caduca mañana');
  assert.equal(textoCaducidadHeroe({ expiraEn: null }, HOY), 'Sin caducidad');
});

test('avisoBono: caduca pronto o le queda poco, sumando sus bonos; nunca «Renueva» ni «Te quedan»', () => {
  assert.equal(avisoBono([bono()], bono(), HOY), null);
  const pocas = bono({ creditosUsados: 7 });
  assert.equal(avisoBono([pocas], pocas, HOY), 'Una sesión más y se acaba tu bono.');
  // Con otro bono con saldo, no le queda poco.
  assert.equal(avisoBono([pocas, bono({ id: 'b2', creditosUsados: 2 })], pocas, HOY), null);
  const caduca = bono({ expiraEn: '2026-10-10' });
  assert.equal(avisoBono([caduca], caduca, HOY), 'Tu bono caduca en 3 días: las sesiones que no uses se pierden.');
  for (const t of [avisoBono([pocas], pocas, HOY), avisoBono([caduca], caduca, HOY)]) {
    assert.ok(!/Renueva|Te quedan/.test(t ?? ''));
  }
  assert.equal(avisoBono([], null, HOY), null);
});

const pago = (extra: Partial<Pago>): Pago => ({ id: 'p', concepto: 'Mensual', importe: 69, fecha: '2026-10-01', estado: 'success', metodo: 'TARJETA', bonoId: 'q1', ...extra });

test('etiquetaPagos: pendiente si debe algo de ESA cuota; al día solo con uno pagado; sin recibos, nada', () => {
  assert.equal(etiquetaPagos([pago({})], 'q1'), 'Al día');
  assert.equal(etiquetaPagos([pago({}), pago({ id: 'p2', estado: 'failed' })], 'q1'), 'Pago pendiente');
  assert.equal(etiquetaPagos([pago({ estado: 'pending', bonoId: 'otra' })], 'q1'), null);
  assert.equal(etiquetaPagos([pago({ estado: 'processing' })], 'q1'), null);
});

test('textoVigencia: nunca «se renueva sola»', () => {
  assert.equal(textoVigencia({ expiraEn: '2026-11-01', bajaAlVencer: false }), 'Vigente hasta el 1 nov');
  assert.equal(textoVigencia({ expiraEn: '2026-11-01', bajaAlVencer: true }), 'Termina el 1 nov · no se renueva');
  assert.equal(textoVigencia({ expiraEn: null }), 'Sin fecha de fin');
});

test('textoUltimoRecibo: el último de esa cuota, con la palabra de /pagos', () => {
  const t = textoUltimoRecibo([pago({ fecha: '2026-09-01' }), pago({ id: 'p2', fecha: '2026-10-01' }), pago({ id: 'p3', fecha: '2026-10-05', bonoId: 'otra' })], 'q1', () => 'Pagado');
  assert.equal(t, 'Último: 1 oct · 69 € · Pagado');
  assert.equal(textoUltimoRecibo([], 'q1', () => 'Pagado'), null);
});

const producto = (extra: Partial<ProductoTienda>): ProductoTienda => ({
  id: 'x', familia: 'bono', nombre: 'Bono 5', descripcion: null, precio: 65, sesiones: 5, validezDias: null, duracionMin: null,
  limiteSemanal: null, imagenUrl: null, periodicidadMeses: null, tiposClaseIds: [], limitePorTipo: {}, ...extra,
});

test('masParaCuota: solo lo que da clases que la cuota NO incluye; con una cuota que lo cubre todo, nada', () => {
  const productos = [
    producto({ id: 'b-barre', tiposClaseIds: ['barre'] }),
    producto({ id: 'b-ref', tiposClaseIds: ['ref'] }),
    producto({ id: 'suelta', familia: 'suelta', tiposClaseIds: [] }),
    producto({ id: 'otra-cuota', familia: 'suscripcion', tiposClaseIds: [] }),
  ];
  const r = masParaCuota({ tiposClaseIds: ['ref'] }, productos, ['ref', 'barre'], { ref: 'Reformer', barre: 'Barre' });
  assert.deepEqual(r.productos.map((p) => p.id), ['b-barre', 'suelta']);
  assert.deepEqual(r.noIncluye, ['Barre']);
  assert.deepEqual(masParaCuota({ tiposClaseIds: [] }, productos, ['ref', 'barre'], {}), { productos: [], noIncluye: [] });
});

test('precioPorClaseDe: solo con UN recibo cobrado, sin devolver, sin renovar y en un bono con sesiones', () => {
  const plan = { tipo: 'BONO', sesiones: 8 };
  const cobrado = { estado: 'COBRADO', importe: 96 };
  assert.equal(precioPorClaseDe(plan, false, [cobrado]), 12);
  assert.equal(precioPorClaseDe(plan, true, [cobrado]), null, 'renovado');
  assert.equal(precioPorClaseDe(plan, false, [cobrado, { estado: 'COBRADO', importe: 96 }]), null, 'dos recibos');
  assert.equal(precioPorClaseDe(plan, false, [cobrado, { estado: 'ANULADO', importe: 96 }]), 12, 'un anulado no cuenta');
  assert.equal(precioPorClaseDe(plan, false, [{ estado: 'PENDIENTE', importe: 96 }]), null, 'sin cobrar');
  assert.equal(precioPorClaseDe(plan, false, [{ estado: 'COBRADO', importe: 96, importeDevuelto: 20 }]), null, 'con devolución');
  assert.equal(precioPorClaseDe(plan, false, []), null, 'regalado o importado');
  assert.equal(precioPorClaseDe({ tipo: 'MENSUAL', sesiones: 8 }, false, [cobrado]), null, 'una cuota');
  assert.equal(precioPorClaseDe({ tipo: 'BONO', sesiones: null }, false, [cobrado]), null, 'sin sesiones');
  assert.equal(precioPorClaseDe(plan, false, [{ estado: 'COBRADO', importe: 100 }]), 12.5);
});

test('textoPrecioPorClase', () => {
  assert.equal(textoPrecioPorClase({ precioPorClase: 12 }), '12 € por clase');
  assert.equal(textoPrecioPorClase({ precioPorClase: 12.5 }), '12,5 € por clase');
  assert.equal(textoPrecioPorClase({ precioPorClase: null }), null);
});

test('el payload trae lo que el héroe y la cuota necesitan: el bono que pagó cada reserva, el precio por clase y la baja al vencer', () => {
  const d = {
    studio: { id: 'st' },
    planesTarifa: [{ id: 'p8', nombre: 'Bono 8', sesiones: 8, precio: 96, tipo: 'BONO' }, { id: 'pm', nombre: 'Mensual', sesiones: null, precio: 69, tipo: 'MENSUAL' }],
    socia: {
      socio: { id: 'soc' },
      suscripciones: [
        { id: 'b1', planId: 'p8', estado: 'ACTIVA', fechaInicio: '2026-10-01', fechaFin: '2026-10-31', sesionesRestantes: 5 },
        { id: 'q1', planId: 'pm', estado: 'ACTIVA', fechaInicio: '2026-10-01', fechaFin: '2026-11-01', sesionesRestantes: null, bajaAlVencer: true },
      ],
      recibos: [{ id: 'r1', estado: 'COBRADO', importe: 96, suscripcionId: 'b1' }],
      reservas: [{ id: 'res', sesionId: 's1', socioId: 'soc', estado: 'CONFIRMADA', creadoEn: '2026-10-02T09:00:00Z', posicionEspera: null, bonoSuscripcionId: 'b1' }],
    },
  } as unknown as PayloadMin;
  const [b1, q1] = proyectarBonos(d, Date.parse('2026-10-07T10:00:00Z'));
  assert.equal(b1.precioPorClase, 12);
  assert.equal(q1.precioPorClase, null);
  assert.equal(q1.bajaAlVencer, true);
  assert.equal(b1.bajaAlVencer, false);
  assert.equal(proyectarReservas(d)[0].bonoId, 'b1');
});
